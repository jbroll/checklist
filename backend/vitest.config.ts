import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 15000, // 15 seconds
  },
});
