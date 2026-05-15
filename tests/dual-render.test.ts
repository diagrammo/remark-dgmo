import { describe, it, expect } from 'vitest';
import { renderDgmoBlock } from '../src/render-block.js';

const SAMPLE = `chart: sequence
A -> B
B -> C`;

/**
 * AC-CM1: Dual-render emits exactly two child wrappers (dgmo-light, dgmo-dark),
 * each containing one SVG rendered with the matching palette mode. The two
 * SVGs must be observably different — verified by extracting the first
 * <rect>'s `fill` attribute (the diagram's outer background) and asserting
 * the two values are not equal.
 */
describe('dual-render (AC-CM1)', () => {
  it('emits both dgmo-light and dgmo-dark wrappers under default colorMode auto', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null);
    expect(html).toMatch(/<div class="[^"]*\bdgmo-light\b[^"]*">\s*<svg/);
    expect(html).toMatch(/<div class="[^"]*\bdgmo-dark\b[^"]*">\s*<svg/);
  });

  it('the two SVGs have distinct background fills (first <rect> fill)', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null);

    // Extract everything between dgmo-light and dgmo-dark wrappers.
    const lightMatch = html.match(
      /<div class="[^"]*\bdgmo-light\b[^"]*">([\s\S]*?)<\/div>\s*<div class="[^"]*\bdgmo-dark\b/
    );
    const darkMatch = html.match(
      /<div class="[^"]*\bdgmo-dark\b[^"]*">([\s\S]*?)<\/div>\s*<\/(?:figure|div)>/
    );
    expect(lightMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();

    const lightFill = extractFirstRectFill(lightMatch![1]);
    const darkFill = extractFirstRectFill(darkMatch![1]);
    // Background fill must differ — palette light/dark backgrounds are
    // distinct by construction.
    expect(lightFill).toBeTruthy();
    expect(darkFill).toBeTruthy();
    expect(lightFill).not.toEqual(darkFill);
  });

  it('single-render (colorMode light) emits exactly one <figure> wrapping one SVG, with no light/dark wrappers', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null, {
      colorMode: 'light',
    });
    expect(html).not.toContain('dgmo-light');
    expect(html).not.toContain('dgmo-dark');
    const svgCount = (html.match(/<svg\b/g) || []).length;
    // showcase mode would have an icon SVG; diagram mode has only the rendered one.
    expect(svgCount).toBe(1);
  });
});

function extractFirstRectFill(svgHtml: string): string | null {
  const rectMatch = svgHtml.match(/<rect\b[^>]*\bfill="([^"]+)"/);
  return rectMatch?.[1] ?? null;
}
