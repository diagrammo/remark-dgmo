import { describe, it, expect } from 'vitest';
import remarkDgmo from '../src/remark-plugin.js';
import type { Root, Paragraph, Heading } from 'mdast';

function buildTree(
  blocks: Array<{ lang: string; meta?: string | null; value: string }>
): Root {
  return {
    type: 'root',
    children: blocks.map(b => ({
      type: 'code',
      lang: b.lang,
      meta: b.meta ?? null,
      value: b.value,
    })),
  };
}

describe('remarkDgmo plugin', () => {
  it('replaces ```dgmo blocks with html nodes', async () => {
    const transform = remarkDgmo({ colorMode: 'light' });
    const tree = buildTree([{ lang: 'dgmo', value: 'chart: sequence\nA -> B' }]);
    await transform(tree);
    const node = tree.children[0] as { type: string; value: string };
    expect(node.type).toBe('html');
    expect(node.value).toContain('dgmo--diagram');
  });

  it('leaves non-dgmo blocks alone', async () => {
    const transform = remarkDgmo({ colorMode: 'light' });
    const tree = buildTree([
      { lang: 'js', value: 'const x = 1' },
      { lang: 'dgmo', value: 'chart: sequence\nA -> B' },
      { lang: 'python', value: 'print(1)' },
    ]);
    await transform(tree);
    expect(tree.children[0].type).toBe('code');
    expect(tree.children[1].type).toBe('html');
    expect(tree.children[2].type).toBe('code');
  });

  it('passes meta to the renderer', async () => {
    const transform = remarkDgmo({ colorMode: 'light' });
    const tree = buildTree([
      { lang: 'dgmo', meta: 'showcase', value: 'chart: sequence\nA -> B' },
    ]);
    await transform(tree);
    const node = tree.children[0] as { value: string };
    expect(node.value).toContain('dgmo--showcase');
  });

  it('honors integration-level options', async () => {
    const transform = remarkDgmo({ mode: 'showcase', colorMode: 'light' });
    const tree = buildTree([{ lang: 'dgmo', value: 'chart: sequence\nA -> B' }]);
    await transform(tree);
    const node = tree.children[0] as { value: string };
    expect(node.value).toContain('dgmo--showcase');
  });

  // AC-RD5: reverse-order replacement invariant with interleaved siblings
  it('preserves order and content of interleaved non-dgmo siblings', async () => {
    const transform = remarkDgmo({ colorMode: 'light' });
    const para: Paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', value: 'paragraph one between diagrams' }],
    };
    const heading: Heading = {
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value: 'heading between diagrams' }],
    };
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'code', lang: 'dgmo', meta: null, value: 'chart: sequence\nA -> B' },
        para,
        { type: 'code', lang: 'dgmo', meta: null, value: 'chart: sequence\nC -> D' },
        heading,
        { type: 'code', lang: 'dgmo', meta: null, value: 'chart: sequence\nE -> F' },
      ],
    };
    await transform(tree);

    expect(tree.children[0].type).toBe('html');
    expect(tree.children[1].type).toBe('paragraph');
    expect((tree.children[1] as Paragraph).children[0]).toMatchObject({
      type: 'text',
      value: 'paragraph one between diagrams',
    });
    expect(tree.children[2].type).toBe('html');
    expect(tree.children[3].type).toBe('heading');
    expect((tree.children[3] as Heading).children[0]).toMatchObject({
      type: 'text',
      value: 'heading between diagrams',
    });
    expect(tree.children[4].type).toBe('html');
  });
});
