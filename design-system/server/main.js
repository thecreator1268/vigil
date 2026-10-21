// Static file server for the VIGIL design-system bundle. Zero dependencies,
// so it runs unmodified on the distroless Node image (no shell, no package
// manager, non-root). Serves design-system/project/ as the document root;
// there is no backend, no proxy, no build step — the "project" directory is
// exactly what /design-sync would push to claude.ai/design.
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'project');
const PORT = Number(process.env.PORT ?? 4600);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', // served as plain text; index.html renders it itself
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  // 'unsafe-inline' on script-src is deliberate and scoped to this tool only:
  // every preview.html is hand-written static markup with an inline <script>,
  // by design (no bundler, no build step — see project/README.md). The
  // production PWA (apps/pwa/server/main.js) does NOT allow inline scripts.
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const log = (o) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), service: 'design-system', ...o })}\n`);

function sendFile(res, file) {
  res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":"ok","service":"design-system"}');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  let safe = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (safe === '' || safe === '.') safe = 'index.html';
  let file = join(ROOT, safe);

  if (!file.startsWith(ROOT)) {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Bad request');
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) return sendFile(res, file);

  res.writeHead(404, SECURITY_HEADERS);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => log({ level: 'info', msg: `design-system listening on :${PORT}` }));
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => server.close(() => process.exit(0)));
