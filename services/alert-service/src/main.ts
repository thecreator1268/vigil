// Telemetry MUST be the first import so http/pg are instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import { createPool, migrate, readSecret, start } from '@vigil/service-kit';
import { buildApp } from './app.js';
import { MIGRATIONS, memoryRepo, pgRepo } from './repo.js';

async function main() {
  const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
  if (pool) await migrate(pool, MIGRATIONS);
  const app = buildApp({ repo: pool ? pgRepo(pool) : memoryRepo(), internalToken: readSecret('internal_token'), onUnhandledError: errorReporter.capture });
  app.addHook('onClose', async () => {
    await pool?.end();
  });
  if (!pool) app.log.warn('DATABASE_URL not set — running with the in-memory stub repository');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'alert-service', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
