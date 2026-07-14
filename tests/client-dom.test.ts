// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindDgmo } from '../src/client.js';

// Exercises the interactive browser paths of the client: the delegated
// toolbar click handler (copy + open-in-editor-inside-summary) and the
// viewBox tightening pass. jsdom lacks SVGGraphicsElement.getBBox, so we
// stub it per-element.

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('client DOM behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('copies data-dgmo-source to the clipboard and marks success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    document.body.innerHTML = `
      <div class="dgmo">
        <button class="dgmo-toolbar-btn dgmo-copy" data-dgmo-source="pie&#10;A: 1">copy</button>
      </div>`;
    bindDgmo();

    const btn = document.querySelector('button.dgmo-copy') as HTMLElement;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(writeText).toHaveBeenCalledWith('pie\nA: 1');
    expect(btn.classList.contains('dgmo-copy--success')).toBe(true);
  });

  it('manually opens the editor link when nested inside a <summary>', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    document.body.innerHTML = `
      <details>
        <summary>
          <a class="dgmo-toolbar-btn dgmo-open" href="https://example.test/edit">open</a>
        </summary>
      </details>`;
    bindDgmo();

    const link = document.querySelector('a.dgmo-open') as HTMLAnchorElement;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(evt);
    await flush();

    // preventDefault cancels the summary toggle AND the anchor nav...
    expect(evt.defaultPrevented).toBe(true);
    // ...so the client re-opens the link manually.
    expect(open).toHaveBeenCalledWith(
      'https://example.test/edit',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('collapses an open source panel when the pointer leaves the block', () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg></svg></div>
        <details class="dgmo-source-wrap" open><summary class="dgmo-toolbar"></summary><div class="dgmo-source-inner"></div></details>
      </div>
      <div id="outside"></div>`;
    bindDgmo();

    const details = document.querySelector(
      'details.dgmo-source-wrap'
    ) as HTMLDetailsElement;
    expect(details.open).toBe(true);

    const outside = document.getElementById('outside')!;
    details.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: outside })
    );
    expect(details.open).toBe(false);
  });

  it('keeps the panel open while the pointer moves within the block', () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg></svg></div>
        <details class="dgmo-source-wrap" open><summary class="dgmo-toolbar"></summary><div class="dgmo-source-inner"><span id="inner">x</span></div></details>
      </div>`;
    bindDgmo();

    const details = document.querySelector(
      'details.dgmo-source-wrap'
    ) as HTMLDetailsElement;
    const inner = document.getElementById('inner')!;
    // Pointer moves from the summary to a child still inside the block.
    details.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: inner })
    );
    expect(details.open).toBe(true);
  });

  it('collapses the panel when focus leaves the block', () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg></svg></div>
        <details class="dgmo-source-wrap" open><summary class="dgmo-toolbar" tabindex="0"></summary><div class="dgmo-source-inner"></div></details>
      </div>
      <button id="elsewhere">x</button>`;
    bindDgmo();

    const details = document.querySelector(
      'details.dgmo-source-wrap'
    ) as HTMLDetailsElement;
    const elsewhere = document.getElementById('elsewhere')!;
    details.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere })
    );
    expect(details.open).toBe(false);
  });

  it('tightens the svg viewBox to getBBox bounds with padding', () => {
    document.body.innerHTML = `
      <div class="dgmo-svg"><svg viewBox="0 0 1200 800"></svg></div>`;
    const svg = document.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 10, y: 20, width: 100, height: 50 }) as DOMRect;

    bindDgmo();

    expect(svg.getAttribute('viewBox')).toBe('-6 4 132 82');
  });

  it('leaves the viewBox alone when getBBox reports empty bounds', () => {
    document.body.innerHTML = `
      <div class="dgmo-svg"><svg viewBox="0 0 1200 800"></svg></div>`;
    const svg = document.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;

    bindDgmo();

    expect(svg.getAttribute('viewBox')).toBe('0 0 1200 800');
  });

  it('measures a display:none wrapper by toggling display, then restores it', () => {
    document.body.innerHTML = `
      <div class="dgmo-dark" style="display: none"><svg viewBox="0 0 1200 800"></svg></div>`;
    const wrapper = document.querySelector('.dgmo-dark') as HTMLElement;
    const svg = wrapper.querySelector('svg') as SVGSVGElement;
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 0, y: 0, width: 200, height: 100 }) as DOMRect;

    bindDgmo();

    expect(svg.getAttribute('viewBox')).toBe('-16 -16 232 132');
    expect(wrapper.style.display).toBe('none');
  });
});
