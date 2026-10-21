import { tables } from '../../db';

/**
 * Clears every local table, then reloads so all in-memory state (Zustand,
 * React) resets to defaults from the now-empty store. Anything already
 * synced to a counselor is unaffected — this only touches this device.
 */
export async function wipeDevice(): Promise<void> {
  await Promise.all([
    tables.checkIns.clear(),
    tables.levelChanges.clear(),
    tables.reminders.clear(),
    tables.consent.clear(),
    tables.syncQueue.clear(),
    tables.crisisQueue.clear(),
    tables.kv.clear(),
  ]);
  window.location.assign(import.meta.env.BASE_URL);
}
