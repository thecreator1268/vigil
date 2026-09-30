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
      workbox: {
        // Workbox caches the SHELL only. Data sync is the app's own Dexie-backed
        // Sync Queue (src/sync) — deliberately separate from Workbox.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/v1\//, /^\/auth\//],
        runtimeCaching: [
          {
            // Never serve stale alert (or any API) data as current.
            urlPattern: ({ url }) => url.pathname.startsWith('/v1/') || url.pathname.startsWith('/auth/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'vigil-static' },
          },
        ],
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
    sourcemap: true,
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
