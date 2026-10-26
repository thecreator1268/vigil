// Telemetry MUST be the first import so http/pg are instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import { createPool, migrate, readSecret, start } from '@vigil/service-kit';
import { buildApp } from './app.js';
import { memoryRepo, MIGRATIONS, pgRepo } from './db.js';

async function main() {
  const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
  if (pool) await migrate(pool, MIGRATIONS);
  const app = await buildApp({
    repo: pool ? pgRepo(pool) : memoryRepo(),
    privateKeyPem: readSecret('jwt_private_key') as string,
    publicKeyPem: readSecret('jwt_public_key') as string,
    issuer: process.env.JWT_ISSUER ?? 'https://idp.vigil.local',
    audience: process.env.JWT_AUDIENCE ?? 'vigil-api',
    rpID: process.env.PASSKEY_RP_ID ?? 'localhost',
    origin: process.env.PASSKEY_ORIGIN ?? 'http://localhost:5173',
    internalToken: readSecret('internal_token') as string,
    onUnhandledError: errorReporter.capture,
  });
  app.addHook('onClose', async () => {
    await pool?.end();
  });
  if (!pool) app.log.warn('DATABASE_URL not set — running with the in-memory stub repository');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'counselor-identity-service', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
