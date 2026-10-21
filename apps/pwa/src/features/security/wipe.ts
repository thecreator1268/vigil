import { tables } from '../../db';
import { unregisterPeriodicSync } from '../../sync/background-sync';

export interface WipeDeviceOptions {
  /** Injected for tests; defaults to a full reload back to the app root. */
  reload?: () => void;
}

/**
 * Clears everything this app has put on this device:
 *
 *  - Every Dexie ("vigil-local") table: check-ins, level changes, reminders,
 *    consent, both sync queues, and kv (which holds the persisted Zustand
 *    state — including the session token and the App Lock PIN hash).
 *  - localStorage and sessionStorage — defensive. Nothing in this app's own
 *    code writes to either (auth is a Bearer header via Zustand/Dexie, and
 *    i18next runs here with no language-detector plugin), but a future
 *    dependency might, so clear them anyway.
 *  - Every Cache Storage cache — the service worker's precached app shell
 *    and the `vigil-static` runtime cache (vite.config.ts). These hold only
 *    static assets, never check-in data, but a full wipe should still leave
 *    none of them behind.
 *  - The service worker registration itself, so nothing keeps running
 *    in the background after the page reloads.
 *  - Any registered Periodic Background Sync tag. One-off Background Sync
 *    has no unregister method in the spec — see
 *    sync/background-sync.ts's unregisterPeriodicSync() doc comment for
 *    why "cancel" there means the queue it would flush is already empty,
 *    not a literal cancellation call.
 *
 * Cookies are deliberately not touched: this app never sets one (see
 * api/client.ts — the gateway is authenticated with a Bearer header).
 *
 * Anything already synced to a counselor is unaffected — this only touches
 * this device.
 */
export async function wipeDevice({ reload = defaultReload }: WipeDeviceOptions = {}): Promise<void> {
  await Promise.all([
    tables.checkIns.clear(),
    tables.levelChanges.clear(),
    tables.reminders.clear(),
    tables.consent.clear(),
    tables.syncQueue.clear(),
    tables.crisisQueue.clear(),
    tables.kv.clear(),
  ]);

  try {
    localStorage.clear();
  } catch {
    /* unavailable in this context (e.g. storage access blocked) — nothing to clear */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* unavailable in this context — nothing to clear */
  }

  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => unregisterPeriodicSync(r)));
    await Promise.all(registrations.map((r) => r.unregister()));
  }

  reload();
}

function defaultReload(): void {
  window.location.assign(import.meta.env.BASE_URL);
}
