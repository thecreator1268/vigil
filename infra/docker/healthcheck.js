// Container HEALTHCHECK probe. Distroless images have no shell/curl, so this
// runs under the image's own node binary. CommonJS on purpose.
// Probes 127.0.0.1 only; for TLS services it skips cert verification because
// it is talking to itself over loopback (the cert is issued for the service
// hostname, not 127.0.0.1).
const port = Number(process.env.PORT || 3000);
const tls = !!process.env.TLS_CERT_PATH;
const client = require(tls ? 'node:https' : 'node:http');

const req = client.get(
  { host: '127.0.0.1', port, path: '/healthz', timeout: 2500, rejectUnauthorized: false },
  (res) => process.exit(res.statusCode === 200 ? 0 : 1),
);
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
req.on('error', () => process.exit(1));
