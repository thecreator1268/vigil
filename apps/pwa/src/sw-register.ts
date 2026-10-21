/**
 * Registers the Workbox service worker (app shell only). New versions wait
 * until every tab is closed rather than swapping code under someone who is
 * mid-check-in; we never force a reload.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  void import('workbox-window').then(({ Workbox }) => {
    // injectManifest builds sw.ts as an ES module (it has real `import`
    // statements — see sw.ts) — registration must say so, or the browser
    // parses it as a classic script and fails on the first `import`.
    const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { type: 'module' });
    void wb.register();
  });
}
