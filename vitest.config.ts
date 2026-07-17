/// <reference types="vitest" />

import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    retry: Number(process.env.VITEST_RETRY ?? (process.env.CI ? 2 : 0)),
    reporters: process.env.VITEST_FLAKE_REPORTER
      ? ['default', process.env.VITEST_FLAKE_REPORTER]
      : ['default'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Limit concurrency to prevent crashes
    maxConcurrency: 5,
    pool: 'threads',
    // Vitest 4: poolOptions moved to top-level
    maxThreads: 4,
    minThreads: 1,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'dist/',
        'build/',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    // Configure test file patterns
    // e2e/helpers hold pure (non-browser) helpers whose unit tests run here;
    // Playwright only collects *.spec.ts (see playwright.config.ts testMatch).
    include: ['src/**/*.{test,spec}.{js,ts,tsx}', 'e2e/helpers/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', 'build/'],
  },
});
