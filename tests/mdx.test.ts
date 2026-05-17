import { describe, it, expect } from 'vitest';
import { compile } from '@mdx-js/mdx';
import remarkDgmo from '../src/remark-plugin.js';
import { htmlToMdxJsxNode } from '../src/mdx-node.js';

const SAMPLE_BLOCK = '```dgmo\nsequence\nA -> B\n```\n';

describe('mdx: true output (AC-MDX1)', () => {
  it('htmlToMdxJsxNode produces a valid mdxJsxFlowElement', () => {
    const node = htmlToMdxJsxNode('<div class="dgmo">x</div>');
    expect(node.type).toBe('mdxJsxFlowElement');
    expect(node.name).toBe('div');
    expect(node.attributes[0].name).toBe('dangerouslySetInnerHTML');

    const expr = node.attributes[0].value;
    // `value: null` is the bare-prop form (used by the suppressHydrationWarning
    // attribute on the same wrapper); dangerouslySetInnerHTML always has an
    // expression value, so narrow before reading subfields.
    if (expr === null) throw new Error('expected value expression, got null');
    expect(expr.type).toBe('mdxJsxAttributeValueExpression');
    expect(expr.value).toContain('__html');
    expect(expr.data.estree.type).toBe('Program');
    expect(expr.data.estree.body[0].type).toBe('ExpressionStatement');
  });

  it('remarkDgmo with mdx:true emits mdxJsxFlowElement instead of html', async () => {
    const transform = remarkDgmo({ colorMode: 'light', mdx: true });
    const tree = {
      type: 'root' as const,
      children: [
        {
          type: 'code' as const,
          lang: 'dgmo',
          meta: null,
          value: 'sequence\nA -> B',
        },
      ],
    };
    await transform(tree);
    expect((tree.children[0] as { type: string }).type).toBe(
      'mdxJsxFlowElement'
    );
  });

  it('remarkDgmo default (mdx:false) still emits raw html nodes', async () => {
    const transform = remarkDgmo({ colorMode: 'light' });
    const tree = {
      type: 'root' as const,
      children: [
        {
          type: 'code' as const,
          lang: 'dgmo',
          meta: null,
          value: 'sequence\nA -> B',
        },
      ],
    };
    await transform(tree);
    expect((tree.children[0] as { type: string }).type).toBe('html');
  });

  it('compiles cleanly through @mdx-js/mdx — no "Cannot handle unknown node `raw`"', async () => {
    // The whole point of mdx:true: the output must survive MDX → React
    // compilation. Without this option, the same input throws.
    const compiled = await compile(SAMPLE_BLOCK, {
      remarkPlugins: [[remarkDgmo, { colorMode: 'light', mdx: true }]],
    });
    const code = String(compiled);
    expect(code).toContain('jsx');
    // The escaped SVG content survives — `dgmo` class names appear in the
    // compiled JSX module after the dangerouslySetInnerHTML payload.
    expect(code).toMatch(/dgmo/);
  }, 15000);

  it('default mode still throws under @mdx-js/mdx (regression guard)', async () => {
    await expect(
      compile(SAMPLE_BLOCK, {
        remarkPlugins: [[remarkDgmo, { colorMode: 'light' }]],
      })
    ).rejects.toThrow(/raw|unknown node/i);
  }, 15000);
});
