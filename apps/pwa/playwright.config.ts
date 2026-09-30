import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real stack (`docker compose up`), through the PWA server,
 * the gateway (TLS), every service and Postgres.
 *   E2E_BASE_URL   default http://localhost:5173
 *   PW_CHANNEL     e.g. "chrome" / "msedge" to use an installed browser locally;
 *                  unset in CI (bundled Chromium)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
    },
  ],
});
