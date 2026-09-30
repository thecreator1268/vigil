// Telemetry MUST be the first import so http/pg are instrumented before load.
import { errorReporter } from '@vigil/service-kit/telemetry';
import { createFieldCrypto, createInternalClient, createPool, migrate, readSecret, start } from '@vigil/service-kit';
import { buildApp, MIGRATIONS, memoryRepo, pgRepo, syncCases } from './app.js';
import { MockCaseSystem } from './external.js';

async function main() {
  const internalToken = readSecret('internal_token') as string;
  const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
  if (pool) await migrate(pool, MIGRATIONS);
  const repo = pool ? pgRepo(pool, createFieldCrypto(readSecret('field_encryption_key') as string)) : memoryRepo();
  const app = buildApp({ repo, internalToken, onUnhandledError: errorReporter.capture });

  // Only the explicitly-enabled mock adapter exists today. A real government
  // integration implements ExternalCaseSystem and is selected here.
  const linked = (process.env.CASE_SYNC_VICTIM_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.CASE_SYNC_MOCK === 'true' && linked.length) {
    const run = () =>
      syncCases({
        repo, external: new MockCaseSystem(), call: createInternalClient({ token: internalToken }),
        reminderServiceUrl: process.env.REMINDER_SERVICE_URL ?? 'http://reminder-service:3000',
        victimIds: () => linked, log: app.log,
      }).catch((err) => app.log.warn({ err: (err as Error).message }, 'case sync failed; will retry'));
    setTimeout(run, 5_000).unref();
    setInterval(run, Number(process.env.CASE_SYNC_INTERVAL_MS ?? 300_000)).unref();
  }

  app.addHook('onClose', async () => {
    await pool?.end();
  });
  if (!pool) app.log.warn('DATABASE_URL not set — running with the in-memory stub repository');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'case-integration-service', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
