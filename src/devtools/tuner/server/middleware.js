/**
 * Design-tuner dev-server endpoints (docs/tuner/TODO.md 5.1–5.3).
 * Mounted by metro.config.js via `server.enhanceMiddleware`; runs inside
 * Metro's Node process. Transport is plain HTTP — Metro's CDP inspector
 * proxy rejects third-party clients (verified in task 1.3), so the app
 * talks to these endpoints directly.
 *
 *   GET  /__tuner/ping                 → { ok: true }
 *   GET  /__tuner/inspect?loc=<loc>    → { shape, editable } | { error }
 *   POST /__tuner/write { loc, changes } → { ok, applied, failed } | { error }
 *
 * loc format: "src/path/File.tsx:line:col" — exactly what the babel plugin
 * stamps and the in-app overlay reads back from the inspector.
 */
const fs = require('fs');
const path = require('path');

const { parseLoc } = require('../loc');
const { inspectSource, writeSource } = require('./core');

function createTunerMiddleware(projectRoot) {
  /** Resolve a loc's file safely inside the project, or null. */
  function resolveLoc(loc) {
    const parsed = parseLoc(loc);
    if (!parsed) return null;
    const absolute = path.resolve(projectRoot, parsed.file);
    // Must stay inside the project and inside src/ — this endpoint writes files.
    if (!absolute.startsWith(path.join(projectRoot, 'src') + path.sep)) return null;
    if (!fs.existsSync(absolute)) return null;
    return { file: absolute, relFile: parsed.file, line: parsed.line, col: parsed.column };
  }

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  return function tunerMiddleware(req, res, next) {
    // Cheap string guard first: this middleware fronts Metro's whole chain,
    // so every bundle/HMR request passes through here. Only tuner traffic
    // pays for URL parsing.
    if (!req.url.startsWith('/__tuner/')) return next();
    const url = new URL(req.url, 'http://localhost');

    try {
      if (url.pathname === '/__tuner/ping') {
        return json(res, 200, { ok: true });
      }

      // NOTE: no in-app caller today — the panel seeds from the rendered
      // style snapshot instead. Kept deliberately: it is the curl-able
      // diagnostic for the write path's resolution rules, and the v2 hook
      // for panel-side editability/per-key validation (see TODO Log).
      if (url.pathname === '/__tuner/inspect' && req.method === 'GET') {
        const target = resolveLoc(url.searchParams.get('loc'));
        if (!target) return json(res, 400, { error: 'bad-loc' });
        const source = fs.readFileSync(target.file, 'utf8');
        const result = inspectSource(source, target.line, target.col);
        return json(res, result.error ? 422 : 200, { ...result, file: target.relFile });
      }

      if (url.pathname === '/__tuner/write' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { loc, changes } = JSON.parse(body || '{}');
            const target = resolveLoc(loc);
            if (!target) return json(res, 400, { error: 'bad-loc' });
            if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
              return json(res, 400, { error: 'no-changes' });
            }
            const source = fs.readFileSync(target.file, 'utf8');
            const result = writeSource(source, target.line, target.col, changes);
            if (result.error) {
              return json(res, 422, { error: result.error, failed: result.failed ?? [] });
            }
            fs.writeFileSync(target.file, result.code);
            return json(res, 200, { ok: true, applied: result.applied, failed: result.failed });
          } catch (writeError) {
            return json(res, 500, { error: 'internal', detail: String(writeError.message) });
          }
        });
        return;
      }

      return json(res, 404, { error: 'unknown-endpoint' });
    } catch (error) {
      return json(res, 500, { error: 'internal', detail: String(error.message) });
    }
  };
}

module.exports = { createTunerMiddleware };
