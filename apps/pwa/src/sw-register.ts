/**
 * Registers the Workbox service worker (app shell only). New versions wait
 * until every tab is closed rather than swapping code under someone who is
 * mid-check-in; we never force a reload.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  void import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`);
    void wb.register();
  });
}
