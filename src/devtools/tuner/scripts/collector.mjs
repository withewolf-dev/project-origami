/**
 * Generic device→terminal channel — dev tooling, not shipped.
 *
 * Run it, then `fetch('http://localhost:8790/probe', { method: 'POST',
 * body: JSON.stringify(anything) })` from app code to print structured data
 * in the terminal. Exists because Metro's CDP inspector proxy refuses
 * third-party debugger sockets (closes 1006 even when idle), so an agent
 * cannot read app state any other way. First used for TODO task 1.3.
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
