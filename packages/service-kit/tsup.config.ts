import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/telemetry.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  platform: 'node',
});
