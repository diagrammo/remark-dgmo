import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * AC-CM2: client.css contains exactly the three color-mode rules and no
 * additional rules. Parses the file via postcss and walks the AST counting
 * Rule nodes — does NOT do a literal snapshot match, so license headers,
 * trailing newlines, and prettier-style edits don't break the test.
 *
 * The source-of-truth file is `styles/client.css`. The build step copies it
 * to `dist/client.css`; we read from source here so the test can run without
 * a prior build.
 */
describe('client.css (AC-CM2 — structural rule check)', () => {
  const cssPath = resolve(__dirname, '../styles/client.css');
  const css = readFileSync(cssPath, 'utf8');

  it('contains exactly three CSS rules', () => {
    const root = postcss.parse(css);
    const rules: Array<{ selector: string; decls: Record<string, string> }> = [];
    root.walkRules(rule => {
      const decls: Record<string, string> = {};
      rule.walkDecls(d => {
        decls[d.prop] = d.value;
      });
      rules.push({ selector: rule.selector, decls });
    });
    expect(rules).toHaveLength(3);
  });

  it('rule 1: .dgmo-dark { display: none }', () => {
    const root = postcss.parse(css);
    const rules = collectRules(root);
    expect(rules).toContainEqual({
      selector: '.dgmo-dark',
      decls: { display: 'none' },
    });
  });

  it('rule 2: [data-theme="dark"] .dgmo-light { display: none }', () => {
    const root = postcss.parse(css);
    const rules = collectRules(root);
    expect(rules).toContainEqual({
      selector: '[data-theme="dark"] .dgmo-light',
      decls: { display: 'none' },
    });
  });

  it('rule 3: [data-theme="dark"] .dgmo-dark { display: block }', () => {
    const root = postcss.parse(css);
    const rules = collectRules(root);
    expect(rules).toContainEqual({
      selector: '[data-theme="dark"] .dgmo-dark',
      decls: { display: 'block' },
    });
  });
});

function collectRules(
  root: postcss.Root
): Array<{ selector: string; decls: Record<string, string> }> {
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
