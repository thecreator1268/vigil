import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      // Spec requirement: 100% branch coverage on the scoring engine and the
      // crisis-phrase matcher. CI fails below this.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
