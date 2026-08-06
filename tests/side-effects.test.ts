import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `client-render.js` registers the renderer by running, and exports nothing.
 * A package-wide `"sideEffects": false` therefore licenses every bundler that
 * honours the flag to DELETE the documented opt-in:
 *
 *     import 'remark-dgmo/client-render.js';
 *
 * Measured with esbuild against the published 0.14.0, 2026-08-06: the flag
 * false took that import to 75 bytes of output carrying zero registrations —
 * so re-rendering silently never happened, and nothing anywhere said so.
 * Naming the file in the array restored it (493 bytes, one registration).
 *
 * `astro-dgmo` never hit this only because it injects the file's BYTES rather
 * than an import, which is exactly why the defect could sit unnoticed.
 */
describe('package.json sideEffects', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../package.json'), 'utf8')
  ) as { sideEffects?: unknown };

  it('names client-render.js, so a side-effect import of it survives bundling', () => {
    expect(Array.isArray(pkg.sideEffects)).toBe(true);
    expect(pkg.sideEffects).toContain('./dist/client-render.js');
  });

  it('is not the blanket `false` that deleted the opt-in', () => {
    expect(pkg.sideEffects).not.toBe(false);
  });
});
