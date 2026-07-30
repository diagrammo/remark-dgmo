import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'remark-plugin': 'src/remark-plugin.ts',
    client: 'src/client.ts',
    // Opt-in renderer for cloud references. Its own entry precisely so the
    // render graph is absent from `client.js` — see src/client-render.ts.
    'client-render': 'src/client-render.ts',
    'client-css': 'src/client-css.ts',
  },
  format: ['esm'],
  // No shared chunks: hosts INLINE `client.js` and `client-render.js` as script
  // text (Astro's injectScript), and an inlined module cannot resolve a
  // relative `./chunk-*.js` sibling — the fixture build fails outright. The
  // cost is that both client entries carry their own copy of the refresh
  // module, which is why the renderer registry lives on `globalThis`.
  splitting: false,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  external: ['@diagrammo/dgmo'],
});
