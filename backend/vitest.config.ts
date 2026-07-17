import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    globals: true,
    retry: Number(process.env.VITEST_RETRY ?? (process.env.CI ? 2 : 0)),
    reporters: process.env.VITEST_FLAKE_REPORTER
      ? ['default', process.env.VITEST_FLAKE_REPORTER]
      : ['default'],
    environment: 'node',
    testTimeout: 15000, // 15 seconds
  },
});
