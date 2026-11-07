// @vitest-environment jsdom
// Fold in the page (diagrammo/diagrammo#1741): a reader's click or Enter on a
// fold toggle re-renders that block, in place, with the fold flipped. Driven
// end to end — the block is the remark adapter's real build output and the
// re-render is dgmo's real renderer, reached by the client's lazy import.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindDgmo } from '../src/client.js';
import { renderDgmoBlock } from '../src/render-block.js';

// Line 4 (`Ship`) starts folded; its toggle reads aria-expanded="false".
const MINDMAP = `mindmap Plan

Goals
  Ship collapsed
    Docs
    Tests
  Learn`;

const SHIP = '[data-node-toggle][data-line-number="4"]';

function block(): HTMLElement {
  return document.querySelector('[data-dgmo-fold-opts]') as HTMLElement;
}

function shipIn(wrapper: string): SVGElement {
  return block().querySelector(`.${wrapper} ${SHIP}`) as SVGElement;
}

function folded(): Promise<void> {
  return new Promise((resolve) =>
    block().addEventListener('dgmo:folded', () => resolve(), { once: true })
  );
}

async function mount(meta: string | null = null): Promise<void> {
  const { html } = await renderDgmoBlock(MINDMAP, meta, {});
  document.body.innerHTML = html;
  bindDgmo();
}

describe('fold in the page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('the build marks a foldable block with its options and source', async () => {
    await mount();
    const el = block();
    expect(el).not.toBeNull();
    expect(JSON.parse(el.dataset['dgmoFoldOpts']!).colorMode).toBe('auto');
    expect(el.dataset['dgmoFoldSource']).toBe(MINDMAP);
    expect(shipIn('dgmo-light').getAttribute('aria-expanded')).toBe('false');
    expect(shipIn('dgmo-light').getAttribute('tabindex')).toBe('0');
  });

  it('click unfolds, a second click folds again, and folds compound', async () => {
    await mount();
    let done = folded();
    shipIn('dgmo-light').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    await done;
    expect(shipIn('dgmo-light').getAttribute('aria-expanded')).toBe('true');
    expect(shipIn('dgmo-dark').getAttribute('aria-expanded')).toBe('true');
    expect(block().dataset['dgmoFoldSource']).not.toContain('collapsed');
    // Docs is drawn now that Ship is open.
    expect(block().querySelector('.dgmo-light svg')!.textContent).toContain(
      'Docs'
    );

    done = folded();
    shipIn('dgmo-light').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    await done;
    expect(shipIn('dgmo-light').getAttribute('aria-expanded')).toBe('false');

    // Fold Goals too: the edit applies to the source already folded above.
    done = folded();
    const goals = block().querySelector(
      '.dgmo-light [data-node-toggle][data-line-number="3"]'
    ) as SVGElement;
    goals.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await done;
    const src = block().dataset['dgmoFoldSource']!;
    expect(src.match(/collapsed/g)).toHaveLength(2);
  });

  it('Enter on a focused toggle folds it and focus stays on that toggle', async () => {
    await mount();
    const ship = shipIn('dgmo-light');
    ship.focus();
    const done = folded();
    const key = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    ship.dispatchEvent(key);
    await done;
    expect(key.defaultPrevented).toBe(true);
    const now = shipIn('dgmo-light');
    expect(now).not.toBe(ship); // drawn again, not patched
    expect(now.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(now);
  });

  it('re-renders with the options the block was baked with', async () => {
    const { html } = await renderDgmoBlock(MINDMAP, 'colorMode=light', {
      palette: 'nord',
    });
    document.body.innerHTML = html;
    bindDgmo();
    const before = block().querySelector('svg')!.outerHTML;
    const done = folded();
    (block().querySelector(`.dgmo-svg ${SHIP}`) as SVGElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await done;
    expect(block().querySelector('.dgmo-light')).toBeNull();
    const fills = (s: string) => new Set(s.match(/#[0-9a-f]{6}/gi));
    const after = block().querySelector('svg')!.outerHTML;
    // Same palette: every colour drawn after the unfold was available before.
    for (const c of fills(after)) expect(fills(before).has(c)).toBe(true);
  });

  it('a showcase block folds from the copy button and carries no second source', async () => {
    await mount('showcase');
    expect(block().dataset['dgmoFoldSource']).toBeUndefined();
    const done = folded();
    shipIn('dgmo-light').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await done;
    expect(shipIn('dgmo-light').getAttribute('aria-expanded')).toBe('true');
  });
});
