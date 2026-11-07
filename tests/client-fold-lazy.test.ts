// @vitest-environment jsdom
// The renderer stays off the wire until a reader uses a fold toggle
// (diagrammo/diagrammo#1741). The mock counts evaluations of dgmo's /block
// entry, which only the opt-in fold entry imports in this file.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loads = vi.hoisted(() => {
  // The fold entry checks for a browser when it is evaluated.
  globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  return { n: 0 };
});
vi.mock('@diagrammo/dgmo/block', async (importOriginal) => {
  loads.n++;
  return importOriginal();
});

import { bindDgmo } from '../src/client.js';
import '../src/client-fold.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('fold renderer is lazy', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('a page with no toggles never loads the renderer', async () => {
    document.body.innerHTML = `
      <figure class="dgmo dgmo--diagram">
        <div class="dgmo-svg"><svg viewBox="0 0 10 10"><g data-line-number="2"><text>Pie</text></g></svg></div>
      </figure>`;
    bindDgmo();
    const g = document.querySelector('g') as SVGElement;
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await flush();
    expect(loads.n).toBe(0);
  });

  it('a toggle outside a foldable block is not ours and loads nothing', async () => {
    document.body.innerHTML = `<svg><g data-node-toggle="n" data-line-number="2" aria-expanded="true"></g></svg>`;
    bindDgmo();
    await flush();
    document
      .querySelector('g')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(loads.n).toBe(0);
    expect(document.querySelector('g')!.hasAttribute('tabindex')).toBe(false);
  });

  // Positive control: the counter does see the fold path's import.
  it('the first toggle use loads it', async () => {
    document.body.innerHTML = `
      <figure class="dgmo" data-dgmo-fold-opts="{&quot;colorMode&quot;:&quot;light&quot;}" data-dgmo-fold-source="mindmap M&#10;&#10;A&#10;  B">
        <div class="dgmo-svg"><svg><g data-node-toggle="n" data-line-number="3" aria-expanded="true"></g></svg></div>
      </figure>`;
    bindDgmo();
    const done = new Promise((r) =>
      document.body.addEventListener('dgmo:folded', r, { once: true })
    );
    document
      .querySelector('g')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await done;
    expect(loads.n).toBe(1);
    expect(
      document.querySelector('figure')!.getAttribute('data-dgmo-fold-source')
    ).toContain('collapsed');
  });
});

// Fold is opt-in (#1741, owner 2026-11-07): a site that does not import
// `client-fold.js` must ship the client it shipped before. A bundler follows
// every import a module graph names, static or dynamic, so walk the base
// client's local imports and read every specifier it names, comments removed.
describe('client.js names no fold code', () => {
  const src = resolve(__dirname, '../src');
  const graph = new Map<string, string>();
  const walk = (file: string): void => {
    if (graph.has(file)) return;
    const code = readFileSync(resolve(src, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    graph.set(file, code);
    for (const m of code.matchAll(/(?:from|import\()\s*'\.\/([^']+)\.js'/g))
      walk(`${m[1]}.ts`);
  };
  walk('client.ts');
  const specifiers = [...graph.values()].flatMap((c) =>
    [...c.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1]!)
  );

  it('reaches no fold module', () => {
    // Positive control: the walk does follow local imports.
    expect([...graph.keys()]).toContain('reference-refresh.ts');
    expect([...graph.keys()].filter((f) => /fold/.test(f))).toEqual([]);
  });

  it('names no import of the renderer', () => {
    expect(specifiers).toContain('@diagrammo/dgmo/countdown');
    expect(specifiers).not.toContain('@diagrammo/dgmo/block');
  });
});
