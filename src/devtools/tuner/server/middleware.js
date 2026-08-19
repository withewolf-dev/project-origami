/**
 * Design-tuner dev-server endpoints (docs/tuner/TODO.md 5.1–5.3 + 8.1).
 * Mounted by metro.config.js via `server.enhanceMiddleware`; runs inside
 * Metro's Node process. Transport is plain HTTP — Metro's CDP inspector
 * proxy rejects third-party clients (verified in task 1.3), so both the app
 * and the dashboard talk to these endpoints directly.
 *
 * Source endpoints (phase 5):
 *   GET  /__tuner/ping                 → { ok: true }
 *   GET  /__tuner/inspect?loc=<loc>    → { shape, editable } | { error }
 *   POST /__tuner/write { loc, changes } → { ok, applied, failed } | { error }
 *
 * Hub endpoints (phase 8) — shared state between the running app and the
 * browser dashboard; in-memory, lives exactly as long as the dev server:
 *   POST /__tuner/app/tree { tree }    app pushes its stamped-element tree
 *   POST /__tuner/app/hit { loc }      app reports an on-device selection
 *   GET  /__tuner/app/commands         app drains queued browser commands
 *   GET  /__tuner/ui/state             dashboard polls tree + selection
 *   POST /__tuner/ui/select { loc }    browser selects an element
 *   POST /__tuner/ui/override { loc, patch }  browser edits a value live
 *
 * loc format: "src/path/File.tsx:line:col" — exactly what the babel plugin
 * stamps and the in-app overlay reads back from the inspector.
 */
/* global __dirname */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const KEYS = require('../keys');
const { parseLoc } = require('../loc');
const { inspectSource, writeConstSource, writeSource } = require('./core');

/** Queued browser→app commands are capped so an absent app can't grow it. */
const MAX_COMMANDS = 100;

/** Dashboard counts as live when it polled within this window (used by 8.9). */
const UI_LIVE_MS = 3000;

function readJsonBody(req, callback) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      callback(null, JSON.parse(body || '{}'));
    } catch (error) {
      callback(error, null);
    }
  });
}

function createTunerMiddleware(projectRoot) {
  const hub = {
    tree: null,
    treeAt: 0,
    selection: null,
    /** { name, style } for the selected element — the inspector seeds from it. */
    selectionMeta: null,
    /** Design-mode state as reported by the app (drives the dashboard button). */
    designOpen: false,
    /** One AI edit job at a time (prompt-at-point). */
    promptJob: null,
    commands: [],
    uiSeenAt: 0,
  };

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
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  }

  /**
   * Long-poll support (latency fix): the app's command poll holds here until
   * a command arrives, so browser edits land in ~one round-trip instead of
   * waiting out a fixed poll interval.
   */
  let commandWaiter = null;

  function commandsResponse() {
    return {
      commands: hub.commands.splice(0),
      dashboardLive: Date.now() - hub.uiSeenAt < UI_LIVE_MS,
    };
  }

  function flushCommandWaiter() {
    if (!commandWaiter) return;
    const { res, timer } = commandWaiter;
    commandWaiter = null;
    clearTimeout(timer);
    json(res, 200, commandsResponse());
  }

  function pushCommand(command) {
    hub.commands.push(command);
    if (hub.commands.length > MAX_COMMANDS) {
      hub.commands.splice(0, hub.commands.length - MAX_COMMANDS);
    }
    flushCommandWaiter();
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

      // The dashboard (8.4). Read from disk per request, deliberately:
      // dashboard.html is editable without restarting Metro.
      if (url.pathname === '/__tuner/' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // no-store is load-bearing: a cached dashboard silently runs OLD
        // control code against a new hub — the user saw exactly that.
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(path.join(__dirname, 'dashboard.html')));
        return;
      }

      // ---- hub: app side (8.1) ----

      if (url.pathname === '/__tuner/app/tree' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || !body || typeof body !== 'object') {
            return json(res, 400, { error: 'bad-json' });
          }
          hub.tree = body.tree ?? null;
          hub.treeAt = Date.now();
          return json(res, 200, { ok: true });
        });
        return;
      }

      if (url.pathname === '/__tuner/app/mode' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error) return json(res, 400, { error: 'bad-json' });
          hub.designOpen = body.open === true;
          return json(res, 200, { ok: true });
        });
        return;
      }

      if (url.pathname === '/__tuner/app/hit' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error) return json(res, 400, { error: 'bad-json' });
          hub.selection = typeof body.loc === 'string' ? body.loc : null;
          hub.selectionMeta = hub.selection
            ? {
                name: body.name ?? null,
                style: body.style ?? null,
                motion: body.motion ?? null,
                instances: body.instances ?? 1,
              }
            : null;
          return json(res, 200, { ok: true });
        });
        return;
      }

      if (url.pathname === '/__tuner/app/commands' && req.method === 'GET') {
        const wantsWait = url.searchParams.get('wait') === '1';
        if (!wantsWait || hub.commands.length > 0) {
          return json(res, 200, commandsResponse());
        }
        // Hold until a command arrives or the window closes. A newer poll
        // replaces an older one (single app client) — release the old empty.
        flushCommandWaiter();
        const timer = setTimeout(() => flushCommandWaiter(), 10_000);
        commandWaiter = { res, timer };
        req.on('close', () => {
          if (commandWaiter?.res === res) {
            clearTimeout(commandWaiter.timer);
            commandWaiter = null;
          }
        });
        return;
      }

      // ---- hub: dashboard side (8.1) ----

      if (url.pathname === '/__tuner/ui/state' && req.method === 'GET') {
        hub.uiSeenAt = Date.now();
        return json(res, 200, {
          tree: hub.tree,
          treeAt: hub.treeAt,
          selection: hub.selection,
          selectionMeta: hub.selectionMeta,
          designOpen: hub.designOpen,
          promptJob: hub.promptJob
            ? {
                status: hub.promptJob.status,
                prompt: hub.promptJob.prompt,
                elapsed: Date.now() - hub.promptJob.startedAt,
                output: hub.promptJob.output.slice(-400),
              }
            : null,
        });
      }

      if (url.pathname === '/__tuner/ui/select' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.loc !== 'string') return json(res, 400, { error: 'bad-loc' });
          hub.selection = body.loc;
          pushCommand({ type: 'select', loc: body.loc });
          return json(res, 200, { ok: true });
        });
        return;
      }

      // The key tables (10.1): one definition in keys.js, served to the
      // dashboard so panel and browser can never drift apart.
      if (url.pathname === '/__tuner/ui/keys' && req.method === 'GET') {
        return json(res, 200, KEYS);
      }

      /**
       * Prompt-at-point: the selection is a precise reference (loc + element
       * name); the instruction is natural language; a headless `claude -p`
       * run makes the edit, and Fast Refresh delivers it to the device.
       * One job at a time; scoped tools, no Bash.
       */
      if (url.pathname === '/__tuner/ui/prompt' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.loc !== 'string' || typeof body.prompt !== 'string' || !body.prompt.trim()) {
            return json(res, 400, { error: 'bad-prompt' });
          }
          if (hub.promptJob && hub.promptJob.status === 'running') {
            return json(res, 409, { error: 'job-running' });
          }
          const parsed = parseLoc(body.loc);
          if (!parsed) return json(res, 400, { error: 'bad-loc' });

          const elementName = (hub.selectionMeta && hub.selectionMeta.name) || 'element';
          const fullPrompt = [
            'You are making a targeted edit in a React Native project.',
            `Target: a <${elementName.replace(/^RCT/, '')}> element in ${parsed.file}`,
            `at line ${parsed.line}, column ${parsed.column} (0-based col of the JSX opening tag).`,
            'The user selected this element visually in a design tool and asked:',
            `"${body.prompt.trim()}"`,
            'Make the change directly by editing the file(s). Keep the edit minimal',
            'and in the style of the surrounding code. Do not run git commands.',
          ].join('\n');

          const job = {
            id: Date.now().toString(36),
            loc: body.loc,
            prompt: body.prompt.trim(),
            status: 'running',
            startedAt: Date.now(),
            output: '',
          };
          hub.promptJob = job;

          let child;
          try {
            child = spawn(
              'claude',
              ['-p', fullPrompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Write,Grep,Glob'],
              { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
            );
          } catch (spawnError) {
            job.status = 'error';
            job.output = `could not start claude: ${spawnError.message}`;
            return json(res, 500, { error: 'spawn-failed' });
          }

          const timeout = setTimeout(() => {
            job.output += '\n[timed out after 180s]';
            child.kill();
          }, 180_000);

          const collect = (chunk) => {
            job.output = (job.output + chunk.toString()).slice(-2000);
          };
          child.stdout.on('data', collect);
          child.stderr.on('data', collect);
          child.on('close', (code) => {
            clearTimeout(timeout);
            if (hub.promptJob === job) {
              job.status = code === 0 ? 'done' : 'error';
              job.endedAt = Date.now();
            }
          });
          child.on('error', (childError) => {
            clearTimeout(timeout);
            job.status = 'error';
            job.output += `\n${childError.message}`;
          });

          return json(res, 200, { ok: true, id: job.id });
        });
        return;
      }

      if (url.pathname === '/__tuner/ui/replay' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.id !== 'string') return json(res, 400, { error: 'bad-replay' });
          pushCommand({ type: 'replay', id: body.id });
          return json(res, 200, { ok: true });
        });
        return;
      }

      if (url.pathname === '/__tuner/ui/undo' && req.method === 'POST') {
        pushCommand({ type: 'undo' });
        return json(res, 200, { ok: true });
      }

      // Design mode is toggled FROM the dashboard — the app's dev-menu entry
      // was removed once the browser became the primary editing surface.
      if (url.pathname === '/__tuner/ui/mode' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.on !== 'boolean') return json(res, 400, { error: 'bad-mode' });
          pushCommand({ type: 'mode', on: body.on });
          return json(res, 200, { ok: true });
        });
        return;
      }

      // Save routes THROUGH the app (8.8): the app owns the grace-window
      // handoff and error surface — duplicating that logic browser-side was
      // the alternative, rejected.
      if (url.pathname === '/__tuner/ui/save' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.loc !== 'string') return json(res, 400, { error: 'bad-loc' });
          pushCommand({ type: 'save', loc: body.loc });
          return json(res, 200, { ok: true });
        });
        return;
      }

      if (url.pathname === '/__tuner/ui/override' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          if (error || typeof body.loc !== 'string' || !body.patch || typeof body.patch !== 'object') {
            return json(res, 400, { error: 'bad-override' });
          }
          pushCommand({ type: 'override', loc: body.loc, patch: body.patch });
          return json(res, 200, { ok: true });
        });
        return;
      }

      // ---- source endpoints (phase 5) ----

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

      // Motion constants (Motion section): same splice machinery, but the
      // target is `const NAME = { … }` rather than an element's style.
      if (url.pathname === '/__tuner/write-const' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          try {
            if (error) return json(res, 400, { error: 'bad-json' });
            const target = resolveLoc(`${body.file}:1:0`);
            if (!target || typeof body.name !== 'string') return json(res, 400, { error: 'bad-target' });
            if (!body.changes || Object.keys(body.changes).length === 0) {
              return json(res, 400, { error: 'no-changes' });
            }
            const source = fs.readFileSync(target.file, 'utf8');
            const result = writeConstSource(source, body.name, body.changes);
            if (result.error) return json(res, 422, { error: result.error, failed: result.failed ?? [] });
            fs.writeFileSync(target.file, result.code);
            return json(res, 200, { ok: true, applied: result.applied, failed: result.failed });
          } catch (writeError) {
            return json(res, 500, { error: 'internal', detail: String(writeError.message) });
          }
        });
        return;
      }

      if (url.pathname === '/__tuner/write' && req.method === 'POST') {
        readJsonBody(req, (error, body) => {
          try {
            if (error) return json(res, 400, { error: 'bad-json' });
            const { loc, changes } = body;
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
