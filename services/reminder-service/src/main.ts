// Telemetry MUST be the first import so http/pg are instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import { createFieldCrypto, createPool, migrate, readSecret, start } from '@vigil/service-kit';
import { buildApp, MIGRATIONS, memoryRepo, pgRepo } from './app.js';

async function main() {
  const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
  if (pool) await migrate(pool, MIGRATIONS);
  const crypto = createFieldCrypto(readSecret('field_encryption_key') as string);
  const app = buildApp({
    repo: pool ? pgRepo(pool, crypto) : memoryRepo(),
    internalToken: readSecret('internal_token'),
    onUnhandledError: errorReporter.capture,
  });
  app.addHook('onClose', async () => {
    await pool?.end();
  });
  if (!pool) app.log.warn('DATABASE_URL not set — running with the in-memory stub repository');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'reminder-service', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
