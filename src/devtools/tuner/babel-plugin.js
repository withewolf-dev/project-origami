/**
 * Design-tuner babel plugin (docs/tuner/TODO.md, tasks 1.2 + 3.2).
 *
 * Two transforms, both dev-only and both applied to React Native host
 * elements in `src/`:
 *
 *  1. Location stamping — React 19 removed `_debugSource`, so the runtime
 *     inspector can tell us *which* view was tapped but not *where* it lives.
 *     Every host element gets `__tunerLoc="src/path/File.tsx:line:col"`, which
 *     `getInspectorDataForViewAtPoint` hands back (verified in task 1.3).
 *
 *  2. Style routing — `style={X}` becomes `style={_resolveStyle("<loc>", X)}`
 *     so a pending override can be merged in at render time. Elements with no
 *     style prop get one, so styles can be added to unstyled elements too.
 *
 * Registered from babel.config.js, never in production builds.
 */
const nodePath = require('path');

const RUNTIME_MODULE = 'src/devtools/tuner/runtime';
const RESOLVE_STYLE = 'resolveStyle';
const USE_VERSION = 'useTunerVersion';

// "Host element" means JSX that renders a native view directly — a lowercase
// tag, or a component imported from 'react-native' (including namespace
// members like Animated.View). Custom components are skipped: stamping them
// would attribute taps to the call site rather than the element owning the style.
module.exports = function tunerPlugin({ types: t }) {
  /** Import a runtime export once per file, lazily. */
  function getRuntimeLocal(programPath, state, exportName) {
    const cached = state.tunerImports.get(exportName);
    if (cached) return cached;

    const local = programPath.scope.generateUidIdentifier(`tuner_${exportName}`);
    const specifier = t.importSpecifier(local, t.identifier(exportName));

    // Reuse one declaration so a file importing both helpers gets a single
    // `import { resolveStyle, useTunerVersion } from '…'`.
    if (state.tunerImportDecl) {
      state.tunerImportDecl.specifiers.push(specifier);
    } else {
      const from = nodePath.dirname(state.file.opts.filename);
      const to = nodePath.join(state.tunerRoot, RUNTIME_MODULE);
      let request = nodePath.relative(from, to).split(nodePath.sep).join('/');
      if (!request.startsWith('.')) request = `./${request}`;

      const declaration = t.importDeclaration([specifier], t.stringLiteral(request));
      programPath.unshiftContainer('body', declaration);
      state.tunerImportDecl = declaration;
    }

    state.tunerImports.set(exportName, local);
    return local;
  }

  /**
   * The name a function is declared under, whether `function Foo()` or
   * `const Foo = () => …`. Anonymous functions return null — render props and
   * inline callbacks must never receive a hook.
   */
  function functionName(fnPath) {
    if (fnPath.node.id?.name) return fnPath.node.id.name;
    const parent = fnPath.parentPath;
    if (parent?.isVariableDeclarator() && parent.node.id.type === 'Identifier') {
      return parent.node.id.name;
    }
    return null;
  }

  return {
    name: 'tuner',
    visitor: {
      Program: {
        enter(_programPath, state) {
          state.tunerRNLocals = new Set();
          state.tunerImports = new Map();
          state.tunerImportDecl = null;
          state.tunerRoot = state.file.opts.root || state.cwd;
          state.tunerComponents = new Set();
        },

        /**
         * Subscribe every component that owns stamped JSX (3.3). Done on exit
         * so the full set is known. Only capitalised, *named* functions
         * qualify — that is the standard component heuristic, and it keeps
         * hooks out of anonymous render props and inline callbacks, where they
         * would violate the Rules of Hooks.
         */
        exit(programPath, state) {
          for (const fnPath of state.tunerComponents) {
            const name = functionName(fnPath);
            if (!name || name[0] !== name[0].toUpperCase()) continue;

            fnPath.ensureBlock();
            const local = getRuntimeLocal(programPath, state, USE_VERSION);
            fnPath
              .get('body')
              .unshiftContainer(
                'body',
                t.expressionStatement(t.callExpression(t.cloneNode(local), [])),
              );
          }
        },
      },

      ImportDeclaration(path, state) {
        if (path.node.source.value !== 'react-native') return;
        for (const spec of path.node.specifiers) {
          state.tunerRNLocals.add(spec.local.name);
        }
      },

      JSXOpeningElement(path, state) {
        const filename = state.file.opts.filename;
        if (!filename) return;

        const rel = nodePath.relative(state.tunerRoot, filename);
        const parts = rel.split(nodePath.sep);
        if (rel.startsWith('..') || parts[0] !== 'src' || parts.includes('node_modules')) {
          return;
        }

        // Only the runtime module itself must be skipped, so it can never be
        // rewritten to import itself. Everything else under the tuner
        // directory IS stamped — notably Playground.tsx, the screen the whole
        // system is developed against.
        const posixRel = parts.join('/');
        if (posixRel.replace(/\.[jt]sx?$/, '') === RUNTIME_MODULE) return;

        const name = path.node.name;
        let eligible = false;
        if (name.type === 'JSXIdentifier') {
          const first = name.name[0];
          eligible = first === first.toLowerCase() || state.tunerRNLocals.has(name.name);
        } else if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
          eligible = state.tunerRNLocals.has(name.object.name);
        }
        if (!eligible || !path.node.loc) return;

        const attributes = path.node.attributes;
        const alreadyStamped = attributes.some(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === '__tunerLoc',
        );
        if (alreadyStamped) return;

        // Spread props may carry style/__tunerLoc we cannot reason about.
        if (attributes.some((attr) => attr.type === 'JSXSpreadAttribute')) return;

        const loc = `${posixRel}:${path.node.loc.start.line}:${path.node.loc.start.column}`;
        attributes.push(t.jsxAttribute(t.jsxIdentifier('__tunerLoc'), t.stringLiteral(loc)));

        // Remember the owning function so Program.exit can subscribe it (3.3).
        const ownerFn = path.getFunctionParent();
        if (ownerFn) state.tunerComponents.add(ownerFn);

        // --- style routing (3.2) ---
        const programPath = path.findParent((p) => p.isProgram());
        if (!programPath) return;

        const styleAttr = attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style',
        );

        if (!styleAttr) {
          const local = getRuntimeLocal(programPath, state, RESOLVE_STYLE);
          attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('style'),
              t.jsxExpressionContainer(
                t.callExpression(t.cloneNode(local), [
                  t.stringLiteral(loc),
                  t.identifier('undefined'),
                ]),
              ),
            ),
          );
          return;
        }

        // Only expression-container styles can be wrapped; a bare string
        // literal style is not valid RN anyway.
        const value = styleAttr.value;
        if (!value || value.type !== 'JSXExpressionContainer') return;
        if (value.expression.type === 'JSXEmptyExpression') return;

        const local = getRuntimeLocal(programPath, state, RESOLVE_STYLE);
        value.expression = t.callExpression(t.cloneNode(local), [
          t.stringLiteral(loc),
          value.expression,
        ]);
      },
    },
  };
};
