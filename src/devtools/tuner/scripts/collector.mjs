/**
 * Task 1.3 collector (docs/tuner/TODO.md) — dev tooling, not shipped.
 *
 * Metro's CDP inspector proxy refuses third-party debugger sockets (closes
 * 1006 even when idle), so the app pushes probe results here instead.
 * Prints whatever the device POSTs to http://localhost:8790/probe.
 */
import http from 'node:http';

const PORT = Number(process.env.PROBE_PORT ?? 8790);

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
      return res.end();
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
      if (!body) return;
      console.log('\n===== PROBE RECEIVED =====');
      try {
        console.log(JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        console.log(body);
      }
      console.log('===== END =====\n');
    });
  })
  .listen(PORT, () => console.log(`collector listening on http://localhost:${PORT}/probe`));
