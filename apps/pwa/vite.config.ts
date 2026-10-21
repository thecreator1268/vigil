import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const GATEWAY = process.env.VITE_DEV_GATEWAY ?? 'https://localhost:8080';
// Sub-path hosting (e.g. GitHub Pages serves the prototype at /vigil/). Default: root.
const BASE = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered explicitly in src/sw-register.ts
      // Hand-written SW (src/sw.ts), not generateSW: it needs to import and
      // reuse the real sync/engine.ts (SyncQueue, CrisisFastPath, consent
      // logic) for the Background Sync / Periodic Background Sync handlers,
      // not a reimplementation. See src/sw.ts's doc comment.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'VIGIL — a quiet place to check in',
        short_name: 'VIGIL',
        description: 'Check in on how you are doing, even without internet. Help is always one tap away.',
        theme_color: '#0f1f3d',
        background_color: '#fbfaf7',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Precache the SHELL only — same files generateSW used to glob.
        // Routing/runtime-caching equivalents to the old `workbox` config
        // (NetworkOnly for /v1//auth/, StaleWhileRevalidate for static
        // assets) are hand-written in src/sw.ts, next to the Background
        // Sync handlers they now share a file with.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: GATEWAY, changeOrigin: true, secure: false },
      '/auth': { target: GATEWAY, changeOrigin: true, secure: false },
    },
  },
  build: {
    target: 'es2022',
    // No sourcemap pipeline exists yet (nothing uploads/consumes them) — they
    // were previously generated AND shipped inside the production image for
    // no reason, at ~8.7MB, 81% of dist/assets. Re-enable once something
    // actually reads them (e.g. uploading to the error-reporter on release).
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy, counselor-only libraries stay out of the victim's first load.
          if (/node_modules\/(jspdf|html2canvas|canvg|dompurify)/.test(id)) return 'export-pdf';
          if (/node_modules\/(recharts|d3-|victory-vendor)/.test(id)) return 'charts';
          if (/node_modules\/(lottie-web|lottie-react)/.test(id)) return 'lottie';
          if (/node_modules\/meyda/.test(id)) return 'voice';
          return undefined;
        },
      },
    },
  },
});
