import { describe, it, expect } from 'vitest';
import { normalizeSvg } from '../src/svg-normalize.js';

describe('normalizeSvg', () => {
  it('adds viewBox from width/height when missing', () => {
    const out = normalizeSvg('<svg width="200" height="100"><g/></svg>');
    expect(out).toContain('viewBox="0 0 200 100"');
  });

  it('strips fixed width/height', () => {
    const out = normalizeSvg(
      '<svg width="200" height="100" viewBox="0 0 200 100"><g/></svg>'
    );
    expect(out).not.toMatch(/<svg[^>]* width="\d+"/);
    expect(out).not.toMatch(/<svg[^>]* height="\d+"/);
    expect(out).toContain('viewBox="0 0 200 100"');
  });

  it('removes inline background from style', () => {
    const out = normalizeSvg(
      '<svg style="background:#fff;font:1px sans-serif" viewBox="0 0 1 1"></svg>'
    );
    expect(out).not.toContain('background:#fff');
    expect(out).toContain('font:1px sans-serif');
  });

  it('leaves an svg without width/height alone', () => {
    const input = '<svg viewBox="0 0 1 1"><g/></svg>';
    expect(normalizeSvg(input)).toBe(input);
  });
});
