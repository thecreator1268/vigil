// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**', '**/node_modules/**', '**/coverage/**', '**/generated/**',
      'apps/pwa/dev-dist/**', 'apps/pwa/test-results/**', 'apps/pwa/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Dignity/privacy guard-rail: never log check-in content from app code.
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['apps/pwa/src/**/*.{ts,tsx}', 'packages/design-system/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**', '**/scripts/**', 'apps/pwa/server/**', 'infra/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Container HEALTHCHECK probe: CommonJS on purpose (runs under distroless node).
    files: ['infra/docker/healthcheck.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
