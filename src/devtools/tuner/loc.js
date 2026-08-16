/**
 * The tuner loc wire format — the contract the whole system hinges on.
 *
 *   "src/path/File.tsx:line:col"
 *
 * line is 1-based, col is 0-based (babel's JSXOpeningElement loc.start), and
 * the path uses posix separators relative to the project root. Produced by
 * babel-plugin.js at bundle time, carried through the app as an opaque token
 * (hitTest.ts / devServer.ts never parse it), and parsed back here on the
 * server side. Both producer and parser run in Metro's Node process, so this
 * CommonJS module is the single definition.
 */
const LOC_PATTERN = /^(.+):(\d+):(\d+)$/;

function formatLoc(posixRelFile, line, column) {
  return `${posixRelFile}:${line}:${column}`;
}

/** Parse a loc string, or null when it does not match the format. */
function parseLoc(loc) {
  const match = LOC_PATTERN.exec(loc ?? '');
  if (!match) return null;
  return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
}

module.exports = { formatLoc, parseLoc };
