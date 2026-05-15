/**
 * Framework-neutral client-side enhancement for diagrams emitted by
 * `remark-dgmo`:
 *
 *   - Bind a delegated click handler for `button.dgmo-copy` to copy the
 *     source string in `data-dgmo-source` to the clipboard.
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

export function bindDgmo(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!clickHandlerBound) {
    document.addEventListener('click', handleCopyClick);
    clickHandlerBound = true;
  }
  tightenViewBoxes();
}

async function handleCopyClick(e: Event): Promise<void> {
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const btn = target.closest('button.dgmo-copy') as HTMLElement | null;
  if (!btn) return;
  const src = btn.dataset.dgmoSource ?? '';
  try {
    await navigator.clipboard.writeText(src);
  } catch {
    return;
  }
  btn.classList.add('dgmo-copy--success');
  setTimeout(() => btn.classList.remove('dgmo-copy--success'), 1500);
}

function tightenViewBoxes(): void {
  const SVG_SELECTORS = '.dgmo-svg svg, .dgmo-light svg, .dgmo-dark svg';
  document.querySelectorAll(SVG_SELECTORS).forEach(node => {
    const svg = node as SVGSVGElement;
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
