import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'framer-motion', 'react-icons'],
  esbuildOptions(o) {
    o.jsx = 'automatic';
  },
});
