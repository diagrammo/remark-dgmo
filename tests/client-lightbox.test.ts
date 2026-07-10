// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindDgmo } from '../src/client.js';

// Exercises the full-screen lightbox paths of the client: the delegated
// `.dgmo-expand` click opens a <dialog> lightbox containing a namespaced
// clone of the visible SVG; close button / backdrop click / native close
// (Escape) dismiss it and remove it from the DOM.
//
// jsdom's HTMLDialogElement is not guaranteed to implement showModal/close,
// so we install a minimal polyfill that mirrors the observable contract the
// client relies on: showModal() sets `open`, close() clears it and fires a
// `close` event.

const XLINK_NS = 'http://www.w3.org/1999/xlink';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function polyfillDialog(): void {
  const proto = window.HTMLDialogElement?.prototype as
    | (HTMLDialogElement & { __dgmoPolyfilled?: boolean })
    | undefined;
  if (!proto || proto.__dgmoPolyfilled) return;
  proto.__dgmoPolyfilled = true;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    (this as unknown as { open: boolean }).open = true;
    Object.defineProperty(this, 'open', {
      configurable: true,
      get: () => this.hasAttribute('open'),
    });
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
}

async function openLightbox(): Promise<HTMLDialogElement> {
  bindDgmo();
  const btn = document.querySelector('button.dgmo-expand') as HTMLElement;
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flush();
  return document.querySelector('dialog.dgmo-lightbox') as HTMLDialogElement;
}

describe('client lightbox behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    polyfillDialog();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('opens a full-screen dialog with a namespaced clone of the visible SVG', async () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg">
          <svg id="root" viewBox="0 0 100 100">
            <defs><linearGradient id="grad"></linearGradient></defs>
            <rect id="r" fill="url(#grad)" style="stroke: url(#grad)" href="#r"></rect>
          </svg>
        </div>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;
    // Add an xlink:href referencing an id, to cover the namespaced-attr branch.
    const rect = document.querySelector('#r') as Element;
    rect.setAttributeNS(XLINK_NS, 'href', '#grad');

    const dialog = await openLightbox();

    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('Diagram, full screen');

    const host = dialog.querySelector('.dgmo-lightbox-svg');
    expect(host).not.toBeNull();
    const clonedSvg = host!.querySelector('svg');
    expect(clonedSvg).not.toBeNull();

    // Descendant ids were namespaced (prefix dgmo-lb-<n>-) on the clone.
    // The root <svg>'s own id is left untouched (querySelectorAll only walks
    // descendants), which is fine — nothing refs it internally.
    const clonedRect = host!.querySelector('rect') as Element;
    expect(clonedRect.getAttribute('id')).toMatch(/^dgmo-lb-\d+-r$/);
    // url(#grad) refs in fill + style rewritten to the namespaced id.
    expect(clonedRect.getAttribute('fill')).toMatch(/^url\(#dgmo-lb-\d+-grad\)$/);
    expect(clonedRect.getAttribute('style')).toMatch(
      /url\(#dgmo-lb-\d+-grad\)/
    );
    // plain href="#r" rewritten to the namespaced id.
    expect(clonedRect.getAttribute('href')).toMatch(/^#dgmo-lb-\d+-r$/);
    // xlink:href="#grad" rewritten too.
    expect(clonedRect.getAttributeNS(XLINK_NS, 'href')).toMatch(
      /^#dgmo-lb-\d+-grad$/
    );

    // A close button exists with the expected class + accessible label.
    const closeBtn = dialog.querySelector('.dgmo-lightbox-close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn!.getAttribute('aria-label')).toBe('Close full screen');
  });

  it('closes and removes the dialog when the close button is clicked', async () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg viewBox="0 0 10 10"></svg></div>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;

    const dialog = await openLightbox();
    expect(dialog.open).toBe(true);

    const closeBtn = dialog.querySelector(
      '.dgmo-lightbox-close'
    ) as HTMLButtonElement;
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('dialog.dgmo-lightbox')).toBeNull();
  });

  it('closes on a backdrop click (target === dialog) but not on inner clicks', async () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg viewBox="0 0 10 10"></svg></div>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;

    const dialog = await openLightbox();

    // Click on the inner SVG host: should NOT close (target !== dialog).
    const host = dialog.querySelector('.dgmo-lightbox-svg') as HTMLElement;
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('dialog.dgmo-lightbox')).not.toBeNull();

    // Click on the dialog itself (the backdrop region): closes + removes.
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('dialog.dgmo-lightbox')).toBeNull();
  });

  it('removes the dialog when it emits a native close (Escape)', async () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"><svg viewBox="0 0 10 10"></svg></div>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;

    const dialog = await openLightbox();
    // Simulate the browser's Escape-driven native close.
    dialog.dispatchEvent(new window.Event('close'));
    await flush();

    expect(document.querySelector('dialog.dgmo-lightbox')).toBeNull();
  });

  it('falls back to a hidden/other wrapper when no wrapper is visibly displayed', async () => {
    // No matching .dgmo-light/.dgmo-dark/.dgmo-svg wrapper contains the svg
    // in a displayed state via getComputedStyle; exercises the block-level
    // svg fallback (block.querySelector('svg')).
    document.body.innerHTML = `
      <div class="dgmo">
        <span><svg id="bare" viewBox="0 0 10 10"></svg></span>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;

    const dialog = await openLightbox();
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('svg')).not.toBeNull();
  });

  it('does nothing when the expand button is outside a .dgmo block', async () => {
    document.body.innerHTML = `
      <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>`;

    bindDgmo();
    const btn = document.querySelector('button.dgmo-expand') as HTMLElement;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('dialog.dgmo-lightbox')).toBeNull();
  });

  it('does nothing when the block has no svg to clone', async () => {
    document.body.innerHTML = `
      <div class="dgmo">
        <div class="dgmo-svg"></div>
        <button class="dgmo-toolbar-btn dgmo-expand" type="button">expand</button>
      </div>`;

    const dialog = await openLightbox();
    expect(dialog).toBeNull();
  });
});
