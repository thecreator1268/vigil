/// <reference lib="webworker" />
/**
 * Hand-written service worker (injectManifest — see vite.config.ts for why).
 *
 * Two jobs:
 *  1. The app shell, same as before: precache the static build, serve API
 *     routes NetworkOnly, static assets StaleWhileRevalidate. Equivalent to
 *     the old generateSW `workbox` config, just hand-written here.
 *  2. Background Sync / Periodic Background Sync: wake up and flush the
 *     REAL sync/engine.ts queues — not a reimplementation. Importing
 *     ./sync/engine here reuses the exact same SyncQueue/CrisisFastPath,
 *     idempotent sends, exponential backoff, and — critically — the exact
 *     same consent-at-send-time check (buildSubmission reads live consent
 *     from the same Dexie-backed store this file also hydrates below), so
 *     a background-delivered check-in is held to the same rules as one
 *     sent with the page open.
 *
 * Deliberately does NOT call skipWaiting()/clientsClaim(): a new SW version
 * waits until every tab is closed, exactly as sw-register.ts documents —
 * never swap code under someone mid-check-in, never force a reload.
 */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { crisisFastPath, syncQueue } from './sync/engine';
import { PERIODIC_SYNC_TAG, SYNC_TAG } from './sync/background-sync';
import { useStore } from './store';

// `self` is typed as DOM's Window elsewhere in this project (tsconfig mixes
// DOM + WebWorker libs for the rest of the app) — redeclare its type for
// just this module instead of fighting that globally. This must stay a
// type-only `declare`, not a renamed variable: workbox-build's
// injectManifest finds where to splice the precache list by searching the
// BUILT OUTPUT for the literal text `self.__WB_MANIFEST`, so every
// reference below has to read `self`, verbatim.
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

interface SyncLikeEvent extends ExtendableEvent {
  tag: string;
}

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`), {
  denylist: [/^\/v1\//, /^\/auth\//],
}));

// Never serve stale alert (or any API) data as current.
registerRoute(({ url }) => url.pathname.startsWith('/v1/') || url.pathname.startsWith('/auth/'), new NetworkOnly());
registerRoute(({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination), new StaleWhileRevalidate({ cacheName: 'vigil-static' }));

async function ensureHydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => useStore.persist.onFinishHydration(() => resolve()));
}

async function flush(): Promise<void> {
  await ensureHydrated();
  // Independent queues, run together: a failing standard queue must never
  // hold up crisis delivery, and vice versa.
  await Promise.allSettled([syncQueue.runOnce(), crisisFastPath.runOnce()]);
}

self.addEventListener('sync', (event) => {
  const e = event as unknown as SyncLikeEvent;
  if (e.tag === SYNC_TAG) e.waitUntil(flush());
});

self.addEventListener('periodicsync', (event) => {
  const e = event as unknown as SyncLikeEvent;
  if (e.tag === PERIODIC_SYNC_TAG) e.waitUntil(flush());
});
