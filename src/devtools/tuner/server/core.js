/**
 * Design-tuner source inspection & writing — pure functions (docs/tuner/TODO.md
 * 5.2–5.4). Runs in Node (Metro's process), never in the app bundle.
 *
 * Everything operates on the source TEXT via AST byte ranges — the file is
 * never regenerated from the AST, so formatting and comments survive
 * untouched. Insertions into inline JSX objects are single-line on purpose:
 * adding a newline above other stamped elements would shift their line
 * numbers and invalidate every loc the running app is holding.
 */
const { parse } = require('@babel/parser');

function parseSource(source) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
}

/** Depth-first walk over every AST node. */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    walk(node[key], visit);
  }
}

/** The JSXOpeningElement whose start is exactly line:col (the stamped loc). */
function findElement(ast, line, col) {
  let found = null;
  walk(ast.program, (node) => {
    if (
      !found &&
      node.type === 'JSXOpeningElement' &&
      node.loc.start.line === line &&
      node.loc.start.column === col
    ) {
      found = node;
    }
  });
  return found;
}

/** `styles.card` → the ObjectExpression for `card` inside StyleSheet.create. */
function findSheetEntry(ast, objectName, propertyName) {
  let entry = null;
  walk(ast.program, (node) => {
    if (
      entry ||
      node.type !== 'VariableDeclarator' ||
      node.id.type !== 'Identifier' ||
      node.id.name !== objectName ||
      node.init?.type !== 'CallExpression' ||
      node.init.callee?.type !== 'MemberExpression' ||
      node.init.callee.property?.name !== 'create' ||
      node.init.arguments[0]?.type !== 'ObjectExpression'
    ) {
      return;
    }
    for (const prop of node.init.arguments[0].properties) {
      if (
        prop.type === 'ObjectProperty' &&
        !prop.computed &&
        propName(prop) === propertyName &&
        prop.value.type === 'ObjectExpression'
      ) {
        entry = prop.value;
      }
    }
  });
  return entry;
}

function propName(prop) {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  return null;
}

/** Literal value of a property's RHS, or NOT_LITERAL. */
const NOT_LITERAL = Symbol('not-literal');
function literalValue(node) {
  if (node.type === 'NumericLiteral' || node.type === 'StringLiteral' || node.type === 'BooleanLiteral') {
    return node.value;
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'NumericLiteral') {
    return -node.argument.value;
  }
  return NOT_LITERAL;
}

function serialize(value) {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error(`unserialisable value: ${JSON.stringify(value)}`);
}

/**
 * Resolve the element's style expression to concrete object literals.
 *
 * shape: 'inline' | 'sheetRef' | 'array' | 'none' | 'unsupported'
 * objects: ObjectExpressions in merge order (later wins) — for reading.
 * writeTarget: the ObjectExpression edits go into, or null.
 * appendArray: when an array has no writable member, append a literal here.
 */
function resolveStyle(ast, element) {
  const styleAttr = element.attributes.find(
    (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style',
  );
  if (!styleAttr) return { shape: 'none', objects: [], writeTarget: null, appendArray: null };

  const container = styleAttr.value;
  if (container?.type !== 'JSXExpressionContainer') {
    return { shape: 'unsupported', objects: [], writeTarget: null, appendArray: null };
  }
  const expr = container.expression;

  if (expr.type === 'ObjectExpression') {
    return { shape: 'inline', objects: [expr], writeTarget: expr, appendArray: null };
  }

  if (
    expr.type === 'MemberExpression' &&
    expr.object.type === 'Identifier' &&
    expr.property.type === 'Identifier'
  ) {
    const entry = findSheetEntry(ast, expr.object.name, expr.property.name);
    if (!entry) return { shape: 'unsupported', objects: [], writeTarget: null, appendArray: null };
    return { shape: 'sheetRef', objects: [entry], writeTarget: entry, appendArray: null };
  }

  if (expr.type === 'ArrayExpression') {
    const objects = [];
    let writeTarget = null;
    for (const member of expr.elements) {
      if (!member) continue;
      if (member.type === 'ObjectExpression') {
        objects.push(member);
        writeTarget = member; // last object literal wins
      } else if (
        member.type === 'MemberExpression' &&
        member.object.type === 'Identifier' &&
        member.property.type === 'Identifier'
      ) {
        const entry = findSheetEntry(ast, member.object.name, member.property.name);
        if (entry) objects.push(entry);
      }
    }
    return { shape: 'array', objects, writeTarget, appendArray: writeTarget ? null : expr };
  }

  return { shape: 'unsupported', objects: [], writeTarget: null, appendArray: null };
}

/**
 * What is editable at a stamped location (5.2).
 * Returns { shape, editable: { key: { value, kind } } } or { error }.
 */
function inspectSource(source, line, col) {
  const ast = parseSource(source);
  const element = findElement(ast, line, col);
  if (!element) return { error: 'element-not-found' };

  const { shape, objects } = resolveStyle(ast, element);
  const editable = {};
  for (const obj of objects) {
    for (const prop of obj.properties) {
      if (prop.type !== 'ObjectProperty' || prop.computed) continue;
      const key = propName(prop);
      if (!key) continue;
      const value = literalValue(prop.value);
      editable[key] =
        value === NOT_LITERAL ? { kind: 'computed' } : { kind: 'literal', value };
    }
  }
  return { shape, editable };
}

/** Last non-computed property named `key` — later duplicates win in RN. */
function findProp(obj, key) {
  let found = null;
  for (const prop of obj.properties) {
    if (prop.type === 'ObjectProperty' && !prop.computed && propName(prop) === key) {
      found = prop;
    }
  }
  return found;
}

/** An insertion edit adding `entriesText` inside an object literal. */
function insertIntoObject(source, obj, entriesText) {
  if (obj.properties.length === 0) {
    return { start: obj.start, end: obj.end, text: `{ ${entriesText} }` };
  }
  const last = obj.properties[obj.properties.length - 1];
  const tail = source.slice(last.end, obj.end);
  const multiline = source.slice(obj.start, obj.end).includes('\n');

  if (!multiline) {
    return { start: last.end, end: last.end, text: `, ${entriesText}` };
  }

  const lineStart = source.lastIndexOf('\n', last.start) + 1;
  const indent = source.slice(lineStart).match(/^\s*/)[0];
  const commaOffset = tail.indexOf(',');
  if (commaOffset !== -1) {
    const pos = last.end + commaOffset + 1;
    return { start: pos, end: pos, text: `\n${indent}${entriesText},` };
  }
  return { start: last.end, end: last.end, text: `,\n${indent}${entriesText}` };
}

/**
 * Apply `changes` ({ key: value }) to the element at line:col (5.3 / 5.4).
 * Returns { code, applied, failed } or { error }. Never throws on bad input.
 */
function writeSource(source, line, col, changes) {
  let ast;
  try {
    ast = parseSource(source);
  } catch (parseError) {
    return { error: 'parse-failed', detail: String(parseError.message) };
  }
  const element = findElement(ast, line, col);
  if (!element) return { error: 'element-not-found' };

  const { shape, writeTarget, appendArray } = resolveStyle(ast, element);
  if (shape === 'unsupported') return { error: 'style-not-writable' };

  const edits = [];
  const applied = [];
  const failed = [];
  const pendingInserts = [];

  for (const [key, value] of Object.entries(changes)) {
    let text;
    try {
      text = serialize(value);
    } catch {
      failed.push({ key, reason: 'unserialisable-value' });
      continue;
    }

    if (writeTarget) {
      const prop = findProp(writeTarget, key);
      if (prop) {
        if (literalValue(prop.value) === NOT_LITERAL) {
          failed.push({ key, reason: 'computed-value' });
          continue;
        }
        edits.push({ start: prop.value.start, end: prop.value.end, text });
        applied.push(key);
      } else {
        pendingInserts.push(`${key}: ${text}`);
        applied.push(key);
      }
    } else {
      // No writable object: element has no style prop, or an array of refs.
      pendingInserts.push(`${key}: ${text}`);
      applied.push(key);
    }
  }

  if (pendingInserts.length > 0) {
    const entries = pendingInserts.join(', ');
    if (writeTarget) {
      edits.push(insertIntoObject(source, writeTarget, entries));
    } else if (appendArray) {
      const members = appendArray.elements.filter(Boolean);
      const lastMember = members[members.length - 1];
      if (lastMember) {
        edits.push({ start: lastMember.end, end: lastMember.end, text: `, { ${entries} }` });
      } else {
        edits.push({ start: appendArray.start, end: appendArray.end, text: `[{ ${entries} }]` });
      }
    } else if (shape === 'none') {
      const lastAttr = element.attributes[element.attributes.length - 1];
      const pos = lastAttr ? lastAttr.end : element.name.end;
      edits.push({ start: pos, end: pos, text: ` style={{ ${entries} }}` });
    } else {
      for (const entry of pendingInserts) {
        failed.push({ key: entry.split(':')[0], reason: 'no-writable-target' });
      }
    }
  }

  if (edits.length === 0) {
    return { error: 'nothing-writable', failed };
  }

  edits.sort((a, b) => b.start - a.start);
  let code = source;
  for (const edit of edits) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }
  return { code, applied, failed };
}

module.exports = { inspectSource, writeSource };
