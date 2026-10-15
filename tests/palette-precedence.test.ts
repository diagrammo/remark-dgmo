import { describe, it, expect } from 'vitest';
import { getPalette } from '@diagrammo/dgmo';
import { renderDgmoBlock } from '../src/render-block.js';

// One diagram, three ways (#1038, spec §1.13): fence `palette=` › the file's
// own `palette` line › the plugin's `palette` option › Slate.
const BARE = `chart: sequence
A -> B
B -> C`;
const WITH_LINE = `palette nord
${BARE}`;

// Each palette's light-mode text colour, which the drawn labels use.
const ink = (id: string) => getPalette(id)!.light.text.toLowerCase();

function drawnIn(html: string, id: string): boolean {
  return html.toLowerCase().includes(ink(id));
}

describe('palette precedence: fence › file › plugin option', () => {
  it('the three palettes are told apart by their text colour', () => {
    expect(new Set([ink('nord'), ink('catppuccin'), ink('slate')]).size).toBe(
      3
    );
  });

  it("no fence override: the file's palette line beats the plugin option", async () => {
    const { html } = await renderDgmoBlock(WITH_LINE, null, {
      palette: 'catppuccin',
      colorMode: 'light',
    });
    expect(drawnIn(html, 'nord')).toBe(true);
    expect(drawnIn(html, 'catppuccin')).toBe(false);
  });

  it("a fence palette= beats the file's palette line", async () => {
    const { html } = await renderDgmoBlock(WITH_LINE, 'palette=catppuccin', {
      palette: 'slate',
      colorMode: 'light',
    });
    expect(drawnIn(html, 'catppuccin')).toBe(true);
    expect(drawnIn(html, 'nord')).toBe(false);
  });

  it('no palette line: the plugin option is the default', async () => {
    const { html } = await renderDgmoBlock(BARE, null, {
      palette: 'catppuccin',
      colorMode: 'light',
    });
    expect(drawnIn(html, 'catppuccin')).toBe(true);
  });

  it('a referenced block bakes the override apart from the default, so a refresh keeps it', async () => {
    const { html } = await renderDgmoBlock(
      WITH_LINE,
      'palette=catppuccin',
      { palette: 'slate', colorMode: 'light' },
      undefined,
      { dataAttributes: { 'dgmo-ref': 'abc' } }
    );
    const m = html.match(/data-dgmo-ref-opts="([^"]*)"/);
    expect(m).not.toBeNull();
    const opts = JSON.parse(
      m![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    );
    expect(opts.paletteOverride).toBe('catppuccin');
    expect(opts.palette).toBe('slate');
  });
});
