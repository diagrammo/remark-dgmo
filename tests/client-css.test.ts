import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * AC-CM2 (revised after the v0.1.2 smoke test): client.css ships sizing +
 * showcase chrome alongside the three load-bearing visibility rules.
 *
 * The original spec capped this file at "exactly three rules" — but the
 * smoke test against a real Docusaurus site showed that without sizing
 * and `<pre>` styling, diagrams render at the UA default 300x150 and
 * showcase source loses its newlines. Default styling is required for the
 * package to be usable out of the box; the test now verifies the load-
 * bearing rules are present, not the total count.
 */
describe('client.css (AC-CM2 — required rules)', () => {
  const cssPath = resolve(__dirname, '../styles/client.css');
  const css = readFileSync(cssPath, 'utf8');

  function collectRules(): Array<{
    selector: string;
    decls: Record<string, string>;
  }> {
    const root = postcss.parse(css);
    const rules: Array<{ selector: string; decls: Record<string, string> }> = [];
    root.walkRules(rule => {
      const decls: Record<string, string> = {};
      rule.walkDecls(d => {
        decls[d.prop] = d.value;
      });
      rules.push({ selector: rule.selector, decls });
    });
    return rules;
  }

  it('parses without errors', () => {
    expect(() => postcss.parse(css)).not.toThrow();
  });

  // The three rules from the original spec, preserved as the load-bearing
  // visibility contract every consumer relies on.
  it('contains the dark-hide-by-default visibility rule', () => {
    expect(collectRules()).toContainEqual({
      selector: '.dgmo-dark',
      decls: { display: 'none' },
    });
  });

  it('contains the data-theme=dark light-hide rule', () => {
    expect(collectRules()).toContainEqual({
      selector: '[data-theme="dark"] .dgmo-light',
      decls: { display: 'none' },
    });
  });

  it('contains the data-theme=dark dark-show rule', () => {
    expect(collectRules()).toContainEqual({
      selector: '[data-theme="dark"] .dgmo-dark',
      decls: { display: 'block' },
    });
  });

  // Sizing — without this, diagrams render at UA default 300x150 size.
  it('contains an SVG sizing rule for the dgmo wrappers', () => {
    const rules = collectRules();
    const sizingRule = rules.find(
      r =>
        r.selector.includes('.dgmo-light') &&
        r.selector.includes('.dgmo-dark') &&
        r.selector.includes('svg')
    );
    expect(sizingRule).toBeDefined();
    expect(sizingRule?.decls['width']).toBe('100%');
  });

  // Showcase pre — without `white-space: pre`, the rendered source loses its
  // newlines and renders as flowed text under several host frameworks.
  it('contains a .dgmo-pre rule that preserves whitespace', () => {
    const rules = collectRules();
    const preRule = rules.find(r => r.selector === '.dgmo-pre');
    expect(preRule).toBeDefined();
    expect(preRule?.decls['white-space']).toBe('pre');
  });
});
