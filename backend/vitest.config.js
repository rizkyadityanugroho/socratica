import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/__tests__/setup.js'],
    include: ['src/__tests__/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/helpers.js', 'src/index.js'],
      exclude: ['src/__tests__/**'],
    },
  },
});
