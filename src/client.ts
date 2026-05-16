/**
 * Framework-neutral client-side enhancement for diagrams emitted by
 * `remark-dgmo`:
 *
 *   - Bind a delegated click handler for the showcase toolbar buttons:
 *     `.dgmo-copy` copies the source string in `data-dgmo-source` to the
 *     clipboard. `.dgmo-open` is an `<a href>` whose default-action
 *     navigation is preserved — except when it lives inside a `<summary>`
 *     (the collapsible toolbar case), where we have to manually navigate
 *     because the same click's `preventDefault()` cancels both the
 *     summary's toggle AND the anchor's nav.
 *   - Tighten each diagram's `viewBox` to its actual content bounds via
 *     `SVGGraphicsElement.getBBox()`, since SVG-export from the renderer
 *     embeds a generous bounding box.
 *
 * `bindDgmo()` is safe to call multiple times: the click handler is bound
 * once-and-only-once (idempotent), and viewBox tightening is run every
 * invocation so SPA-style frameworks (Docusaurus) can re-run it after
 * route changes.
 *
 * In a non-browser environment (Node SSR), `bindDgmo()` is a no-op.
 */

let clickHandlerBound = false;
let themeObserverBound = false;

export function bindDgmo(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!clickHandlerBound) {
    document.addEventListener('click', handleToolbarBtnClick);
    clickHandlerBound = true;
  }
  tightenViewBoxes();

  // Color-mode toggles flip which dual-render wrapper is `display: none`.
  // The wrapper that was hidden at load couldn't be measured (getBBox
  // returns 0 on display:none subtrees), so its SVG keeps the full
  // un-tightened viewBox and looks tiny when it becomes visible. Watch
  // for the host's color-mode signal flipping and re-tighten then.
  //
  // Double-rAF defers the measurement until AFTER the browser has
  // finished the layout pass that the display-change triggered. Without
  // it, MutationObserver fires synchronously before layout and getBBox
  // still returns 0 on the freshly-visible element.
  if (!themeObserverBound) {
    const html = document.documentElement;
    const reTighten = () => {
      requestAnimationFrame(() => requestAnimationFrame(tightenViewBoxes));
    };
    new MutationObserver(reTighten).observe(html, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    themeObserverBound = true;
  }
}

async function handleToolbarBtnClick(e: Event): Promise<void> {
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const btn = target.closest('.dgmo-toolbar-btn') as HTMLElement | null;
  if (!btn) return;

  // The showcase toolbar IS the <summary> of a <details> disclosure, so a
  // click on any descendant would also toggle the disclosure unless we
  // cancel the default action. preventDefault here cancels the summary's
  // toggle — but it also cancels an anchor's navigation, so we have to
  // manually re-open the link below when the open-in-editor button is
  // nested inside a summary.
  const insideSummary = !!btn.closest('summary');
  if (insideSummary) e.preventDefault();

  if (btn.matches('button.dgmo-copy')) {
    const src = btn.dataset.dgmoSource ?? '';
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      return;
    }
    btn.classList.add('dgmo-copy--success');
    setTimeout(() => btn.classList.remove('dgmo-copy--success'), 1500);
    return;
  }

  if (insideSummary && btn.matches('a.dgmo-open')) {
    const anchor = btn as HTMLAnchorElement;
    if (anchor.href) {
      window.open(anchor.href, anchor.target || '_blank', 'noopener,noreferrer');
    }
  }
}

function tightenViewBoxes(): void {
  const WRAPPER_SELECTORS = '.dgmo-light, .dgmo-dark, .dgmo-svg';
  document.querySelectorAll(WRAPPER_SELECTORS).forEach(node => {
    const wrapper = node as HTMLElement;
    const svg = wrapper.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    // `getBBox()` returns 0,0,0,0 on elements whose ancestor is `display: none`.
    // Under dual-render the inactive color-mode wrapper IS display:none at load,
    // so its SVG would stay un-tightened — and then look small after the user
    // toggles into it. Set the wrapper to inline-style `display: block`
    // synchronously, read getBBox, then restore. Modern browsers don't paint
    // between these synchronous DOM writes, so there's no visible flicker.
    const computed = window.getComputedStyle(wrapper);
    const wasHidden = computed.display === 'none';
    const savedInlineDisplay = wrapper.style.display;
    if (wasHidden) {
      wrapper.style.display = 'block';
      // Force a synchronous layout pass before getBBox so the freshly-
      // shown element actually has bounds. Without this, some browsers
      // still report 0,0,0,0 because they batch the display change for
      // the next frame.
      void wrapper.offsetHeight;
    }

    try {
      const bbox = (svg as unknown as SVGGraphicsElement).getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        const pad = 16;
        svg.setAttribute(
          'viewBox',
          `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${
            bbox.height + pad * 2
          }`
        );
      }
    } catch {
      // ignore: SVG not yet in the DOM, or getBBox unsupported
    }

    if (wasHidden) wrapper.style.display = savedInlineDisplay;
  });
}

// Auto-init on initial load. Docusaurus-style SPA wrappers also re-call
// bindDgmo on route changes; that's safe (the click handler is bound once,
// viewBox tightening runs every time).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDgmo);
  } else {
    bindDgmo();
  }
}
