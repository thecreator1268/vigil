/**
 * Wires the Sync Queue and Crisis Fast-Path to app state, and pulls
 * server-owned data (reminders, consent ledger, scoring config) when online.
 */
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '@vigil/scoring-engine';
import { api, ensureOk } from '../api/client';
import { db, tables } from '../db';
import { useStore } from '../store';
import { CrisisFastPath } from './crisis-fast-path';
import { effectiveConsent, mergeConsentLedger, resolveReminders } from './resolvers';
import { SyncQueue } from './sync-queue';
import { createTransport, sendCrisisCheckIn } from './transport';

const patch = (p: Parameters<ReturnType<typeof useStore.getState>['patchSync']>[0]) => useStore.getState().patchSync(p);

export const syncQueue = new SyncQueue(createTransport(), {
  onChange: ({ pending, syncing, delivered, lastError }) =>
    patch({ pending, syncing, lastError, ...(delivered > 0 ? { lastSyncedAt: Date.now() } : {}) }),
});

export const crisisFastPath = new CrisisFastPath(sendCrisisCheckIn, {
  onChange: ({ pending, delivered, lastError }) =>
    patch({ crisisPending: pending, lastError, ...(delivered > 0 ? { lastSyncedAt: Date.now() } : {}) }),
});

const CONFIG_KEY = 'scoring-config';

export async function currentScoringConfig(): Promise<ScoringConfig> {
  const rec = await tables.kv.get(CONFIG_KEY);
  return (rec?.value as ScoringConfig | undefined) ?? { ...DEFAULT_SCORING_CONFIG };
}

/** Pull server-owned data for the signed-in person. Failures are silent: we are offline-first. */
export async function pullVictimData(): Promise<void> {
  const { session } = useStore.getState();
  if (session.role !== 'victim' || !session.subject || !navigator.onLine) return;
  const victimId = session.subject;
  try {
    const cfg = ensureOk(await api.GET('/v1/scoring-config'));
    await tables.kv.put({ key: CONFIG_KEY, value: cfg });

    const { reminders } = ensureOk(await api.GET('/v1/reminders', { params: { query: { victimId } } }));
    const local = await tables.reminders.where('victimId').equals(victimId).toArray();
    const serverOwned = local.filter((r) => r.type !== 'checkin');
    const merged = resolveReminders(serverOwned, reminders);
    await db.transaction('rw', tables.reminders, async () => {
      await tables.reminders.bulkPut(merged);
    });

    const { records } = ensureOk(await api.GET('/v1/consent', { params: { query: { victimId } } }));
    const ledger = mergeConsentLedger(await tables.consent.where('victimId').equals(victimId).toArray(), records);
    await tables.consent.bulkPut(ledger);
    useStore.getState().replaceConsent(effectiveConsent(ledger) as never);
  } catch {
    /* offline or gateway unavailable — try again later */
  }
}

let started = false;
export function startSync(): void {
  if (started) return;
  started = true;
  const setOnline = () => patch({ online: navigator.onLine });
  window.addEventListener('online', () => {
    setOnline();
    void pullVictimData();
  });
  window.addEventListener('offline', setOnline);
  syncQueue.start();
  crisisFastPath.start();
  void pullVictimData();
  setInterval(() => void pullVictimData(), 5 * 60_000);
  void Promise.all([syncQueue.pendingCount(), crisisFastPath.pendingCount()]).then(([pending, crisisPending]) =>
    patch({ pending, crisisPending }),
  );
}
