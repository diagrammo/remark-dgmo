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

  // AC-PF1: unregistered palette name → warn + nord fallback
  it('warns and falls back to nord when palette is not registered (AC-PF1)', async () => {
    await renderDgmoBlock(
      SAMPLE,
      null,
      {
        palette: 'totally-not-a-real-palette',
        colorMode: 'light',
      }
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toMatch(
      /^\[remark-dgmo\] palette "totally-not-a-real-palette" not registered, falling back to "nord"( at .+:\d+)?$/
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

  // AC-PF2: registered palette missing a mode → defensive nord-fallback for the missing mode + warn.
  // dgmo's registry validates both modes at registration, so this path is unreachable for the
  // built-in palettes today. Tested here by mocking `palettes` with a synthetic entry missing `.dark`.
  it('warns when an auto-render palette is missing one mode (AC-PF2)', async () => {
    vi.resetModules();
    vi.doMock('@diagrammo/dgmo', async () => {
      const orig =
        await vi.importActual<typeof import('@diagrammo/dgmo')>(
          '@diagrammo/dgmo'
        );
      const nord = orig.palettes.nord;
      const fake = {
        id: 'fake-light-only',
        name: 'Fake light-only',
        light: nord.light,
        // intentional: no `dark` mode
      };
      return {
        ...orig,
        palettes: { ...orig.palettes, fakeLightOnly: fake },
      };
    });
    const { renderDgmoBlock: rerouted } = await import(
      '../src/render-block.js?fake=' + Date.now()
    );
    await rerouted(SAMPLE, null, {
      palette: 'fake-light-only',
      colorMode: 'auto',
    });
    const messages: string[] = warnSpy.mock.calls.map(
      (c: unknown[]) => String(c[0])
    );
    expect(
      messages.some((m: string) =>
        /^\[remark-dgmo\] palette "fake-light-only" has no dark mode; using nord dark for the missing pair/.test(
          m
        )
      )
    ).toBe(true);
    vi.doUnmock('@diagrammo/dgmo');
  });
});
