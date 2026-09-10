import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 🔴 A hang guard, not a performance budget. The first test in a file pays
    // the cold `@diagrammo/dgmo` import — fonts, basemaps, the whole renderer —
    // and vitest's 5000ms default is under that on a loaded machine: the
    // release gate for 0.15.8 died at 5795ms on `renders simple diagram mode
    // by default` while the very next test in the same file passed in 340ms,
    // and the repo's own CI was green the same morning. That is the machine
    // being measured, not the code.
    //
    // 20s is far above any plausible cold start and far below a real hang, so
    // an infinite loop is still caught. Do not turn this into an assertion
    // about how long a render takes — wall-clock assertions are banned across
    // this workspace for exactly the reason above.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
