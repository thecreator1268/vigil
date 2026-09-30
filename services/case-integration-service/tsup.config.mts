import { defineConfig } from 'tsup';

// CommonJS on purpose: OpenTelemetry's require-hook instrumentation only
// patches CJS-loaded modules without an ESM loader flag.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  outExtension: () => ({ js: '.js' }),
});
