import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderDgmoBlock } from '../src/render-block.js';

const SAMPLE = `chart: sequence
A -> B`;

describe('palette fallback', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  // AC-PF1: unregistered palette name → warn + fallback to dgmo's default (slate).
  // Story 110.2 centralized "resolve · fall back · warn" in @diagrammo/dgmo
  // (resolvePaletteOrFallback), which resolves against the validated registry and
  // unifies the fallback to slate (previously remark fell back to nord).
  it('warns and falls back to slate when palette is not registered (AC-PF1)', async () => {
    await renderDgmoBlock(SAMPLE, null, {
      palette: 'totally-not-a-real-palette',
      colorMode: 'light',
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toMatch(
      /^\[remark-dgmo\] Palette "totally-not-a-real-palette" is not registered — falling back to "slate"\.( at .+:\d+)?$/
    );
  });

  it('includes file:line location suffix when provided', async () => {
    await renderDgmoBlock(
      SAMPLE,
      null,
      { palette: 'definitely-fake', colorMode: 'light' },
      { path: 'docs/x.mdx', line: 42 }
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toContain('at docs/x.mdx:42');
  });

  // (Former AC-PF2 removed in Story 110.2.) It drove the missing-theme-mode
  // borrow in renderForTheme by mocking the `palettes` barrel so resolution
  // returned a malformed (dark-less) palette. Resolution now goes through
  // dgmo's registry (resolvePaletteOrFallback), which the barrel mock doesn't
  // touch and which only yields mode-validated palettes — so that injection
  // vector no longer reaches the branch. The borrow remains as defensive code.
});
