// @vitest-environment jsdom
// The renderer stays off the wire until a reader uses a fold toggle
// (diagrammo/diagrammo#1741). The mock counts evaluations of dgmo's /block
// entry, which only the client's fold path imports in this file.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loads = vi.hoisted(() => ({ n: 0 }));
vi.mock('@diagrammo/dgmo/block', async (importOriginal) => {
  loads.n++;
  return importOriginal();
});

import { bindDgmo } from '../src/client.js';

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
