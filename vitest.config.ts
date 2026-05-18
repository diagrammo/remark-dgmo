import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary'],
      // Floor 2 pts below 2026-05-17 baseline (full src/** measurement).
      // Baseline: lines 69.5, statements 68.1, branches 60.5, functions 73.3.
      thresholds: {
        lines: 67,
        statements: 66,
        branches: 58,
        functions: 71,
      },
    },
  },
});
