/**
 * Background Sync / Periodic Background Sync registration.
 *
 * This is a best-effort WAKE-UP SIGNAL layered on top of the paths that
 * already work everywhere and need no browser support at all: syncing on
 * app open, and on the 'online' event (see sync/engine.ts, SyncQueue.start).
 * Neither Background Sync API exists outside Chromium; both are feature-
 * detected independently and fail silently when unsupported, denied, or the
 * app isn't installed — the existing paths are the guarantee, this is the
 * enhancement.
 *
 * The crisis fast-path never touches either API. It keeps its own fixed
 * 15s-while-open retry (crisis-fast-path.ts) specifically so it never
 * depends on Background Sync support or permission, per the device-safety
 * brief.
 */

export const SYNC_TAG = 'vigil-sync';
export const PERIODIC_SYNC_TAG = 'vigil-periodic-sync';
// Chrome enforces its own (usually larger) floor; this is a minimum ask, not a guarantee.
const PERIODIC_SYNC_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface VigilSyncManager {
  register(tag: string): Promise<void>;
}
interface VigilPeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}
export interface BackgroundSyncRegistration extends ServiceWorkerRegistration {
  sync: VigilSyncManager;
}
export interface PeriodicSyncRegistration extends ServiceWorkerRegistration {
  periodicSync: VigilPeriodicSyncManager;
}

export function supportsBackgroundSync(): boolean {
  return 'serviceWorker' in navigator && 'SyncManager' in window;
}

export function supportsPeriodicSync(): boolean {
  return 'serviceWorker' in navigator && 'PeriodicSyncManager' in window;
}

/** Periodic Background Sync is Chrome-only and additionally needs the app installed. */
export function isInstalled(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
}

/** Registers a one-off sync. No-ops (silently) if unsupported, denied, or no active SW yet. */
export async function registerBackgroundSync(): Promise<void> {
  if (!supportsBackgroundSync()) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as BackgroundSyncRegistration;
    await registration.sync.register(SYNC_TAG);
  } catch {
    /* the open-app and online-event paths still cover delivery */
  }
}

/** Registers periodic sync only when supported, installed, and permitted. */
export async function registerPeriodicSync(): Promise<void> {
  if (!supportsPeriodicSync() || !isInstalled()) return;
  try {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' as unknown as PermissionName });
      if (status.state !== 'granted') return;
    }
    const registration = (await navigator.serviceWorker.ready) as PeriodicSyncRegistration;
    await registration.periodicSync.register(PERIODIC_SYNC_TAG, { minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS });
  } catch {
    /* strictly best-effort */
  }
}

/**
 * Unregisters periodic sync, if it was ever registered. One-off Background
 * Sync has NO unregister method in the spec — there is nothing to cancel.
 * wipeDevice() relies instead on the queue it would flush already being
 * empty, which is the only "cancel" the platform actually offers.
 */
export async function unregisterPeriodicSync(registration: ServiceWorkerRegistration): Promise<void> {
  if (!('periodicSync' in registration)) return;
  try {
    await (registration as PeriodicSyncRegistration).periodicSync.unregister(PERIODIC_SYNC_TAG);
  } catch {
    /* already gone, or unsupported */
  }
}
