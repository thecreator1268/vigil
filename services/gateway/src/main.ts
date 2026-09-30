// Telemetry MUST be the first import so http is instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import { readFileSync } from 'node:fs';
import { readSecret, start } from '@vigil/service-kit';
import { buildGateway } from './app.js';

const SERVICES = ['checkin-service', 'distress-trend-service', 'alert-service', 'reminder-service', 'case-integration-service'];

async function main() {
  const upstreams = Object.fromEntries(
    SERVICES.map((s) => [s, process.env[`UPSTREAM_${s.replace(/-/g, '_').toUpperCase()}`] ?? `http://${s}:3000`]),
  );
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;

  const app = await buildGateway({
    jwtPublicKeyPem: readSecret('jwt_public_key') as string,
    issuer: process.env.JWT_ISSUER ?? 'https://idp.vigil.local',
    audience: process.env.JWT_AUDIENCE ?? 'vigil-api',
    internalToken: readSecret('internal_token') as string,
    upstreams,
    devIdpUrl: process.env.DEV_IDP_URL || undefined,
    https: certPath && keyPath ? { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') } : undefined,
    rateLimit: { max: Number(process.env.RATE_LIMIT_MAX ?? 120), timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute' },
    onUnhandledError: errorReporter.capture,
  });
  if (!certPath) app.log.warn('TLS_CERT_PATH not set — serving plain HTTP (terminate TLS at the ingress)');
  await start(app, Number(process.env.PORT ?? 8080));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'gateway', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
