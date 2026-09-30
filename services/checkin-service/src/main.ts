// Telemetry MUST be the first import so http/pg are instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import {
  createFieldCrypto,
  createInternalClient,
  createPool,
  migrate,
  readSecret,
  start,
} from '@vigil/service-kit';
import { buildApp } from './app.js';
import { createDispatcher } from './dispatcher.js';
import { MIGRATIONS, memoryRepo, pgRepo } from './repo.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const internalToken = readSecret('internal_token') as string;
  const crypto = createFieldCrypto(readSecret('field_encryption_key') as string);

  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await migrate(pool, MIGRATIONS);
  const repo = pool ? pgRepo(pool) : memoryRepo();

  // onCommitted only fires on requests, i.e. after `dispatcher` below exists.
  const app = buildApp({ repo, crypto, internalToken, onUnhandledError: errorReporter.capture, onCommitted: () => dispatcher.kick() });

  const dispatcher = createDispatcher({
    repo,
    call: createInternalClient({ token: internalToken }),
    urls: {
      alert: process.env.ALERT_SERVICE_URL ?? 'http://alert-service:3000',
      trend: process.env.TREND_SERVICE_URL ?? 'http://distress-trend-service:3000',
    },
    log: app.log,
  });
  dispatcher.start();
  app.addHook('onClose', async () => {
    dispatcher.stop();
    await pool?.end();
  });

  if (!pool) app.log.warn('DATABASE_URL not set — running with the in-memory stub repository');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'checkin-service', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
