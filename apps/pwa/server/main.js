// Production server for the PWA: static files + same-origin proxy to the
// gateway. Zero dependencies so it runs on the distroless Node image.
//
//  - hashed assets: immutable, 1 year; index.html / sw.js / manifest: no-cache
//  - SPA fallback to index.html for app routes
//  - /v1/* and /auth/* proxied to the gateway over TLS, verifying the
//    gateway's certificate against GATEWAY_CA_PATH (never disabled)
//  - strict security headers (CSP without unsafe-eval / inline scripts)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 5173);
const GATEWAY = new URL(process.env.GATEWAY_URL ?? 'https://gateway:8080');
const CA = process.env.GATEWAY_CA_PATH && existsSync(process.env.GATEWAY_CA_PATH) ? readFileSync(process.env.GATEWAY_CA_PATH) : undefined;
const SPEECH = process.env.SPEECH_PROXY_ORIGIN ?? '';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain',
};

const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${SPEECH ? ` ${SPEECH}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

const log = (o) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), service: 'pwa', ...o })}\n`);

function proxy(req, res) {
  const upstream = https.request(
    {
      protocol: GATEWAY.protocol,
      hostname: GATEWAY.hostname,
      port: GATEWAY.port,
      method: req.method,
      path: req.url,
      ca: CA,
      servername: GATEWAY.hostname,
      minVersion: 'TLSv1.3',
      headers: { ...req.headers, host: GATEWAY.host, 'x-forwarded-for': req.socket.remoteAddress ?? '' },
      timeout: 15_000,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('gateway timeout')));
  upstream.on('error', (err) => {
    log({ level: 'warn', msg: 'gateway unreachable', err: err.message });
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_gateway', message: 'The server is unreachable right now' }));
  });
  req.pipe(upstream);
}

function sendFile(res, file, status = 200) {
  const ext = extname(file);
  const name = file.slice(ROOT.length);
  const immutable = name.startsWith(`${sep}assets${sep}`) || name.startsWith('/assets/');
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":"ok","service":"pwa"}');
  }
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/auth/')) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) {
    res.writeHead(400);
    return res.end();
  }
  if (safe && existsSync(file) && statSync(file).isFile()) return sendFile(res, file);
  if (extname(safe)) {
    res.writeHead(404, SECURITY_HEADERS);
    return res.end('Not found');
  }
  return sendFile(res, join(ROOT, 'index.html')); // SPA route
});

server.listen(PORT, '0.0.0.0', () => log({ level: 'info', msg: `pwa listening on :${PORT}`, gateway: GATEWAY.origin, ca: !!CA }));
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => server.close(() => process.exit(0)));
