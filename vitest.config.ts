import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // 🔴 A hang guard, not a performance budget. The first test in a file pays
    // the cold `@diagrammo/dgmo` import — fonts, basemaps, the whole renderer —
    // and vitest's 5000ms default is under that on a loaded machine: the
    // release gate for 0.15.8 died at 5795ms on `renders simple diagram mode
    // by default` while the very next test in the same file passed in 340ms,
    // and this repo's CI was green the same morning. That is the machine being
    // measured, not the code.
    //
    // 20s is far above any plausible cold start and far below a real hang, so
    // an infinite loop is still caught. Do NOT turn this into an assertion
    // about how long a render takes — wall-clock assertions are banned across
    // this workspace for exactly the reason above.
    testTimeout: 20000,
    hookTimeout: 20000,
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
