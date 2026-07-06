import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'remark-plugin': 'src/remark-plugin.ts',
    client: 'src/client.ts',
    'client-css': 'src/client-css.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  external: ['@diagrammo/dgmo'],
});
