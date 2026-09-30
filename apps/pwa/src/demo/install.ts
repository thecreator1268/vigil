/**
 * Imported FIRST by main.tsx. In the static prototype build it swaps the
 * network API for the in-browser demo backend before any module (notably the
 * openapi-fetch client, which captures `fetch` at creation) is evaluated.
 * In every other build the condition is a compile-time `false` and the mock
 * backend is tree-shaken out of the bundle.
 */
import { installMockBackend } from './mock-backend';

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

if (DEMO_MODE) installMockBackend();
