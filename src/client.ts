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
 * In a non-browser environment, `bindDgmo()` is a no-op. We can't just check
 * for `window`/`document`: some SSG renderers (Docusaurus's static export among
 * them) evaluate client modules against a PARTIAL DOM that defines `window` and
 * `document` but NOT the browser-only APIs this function relies on
 * (`MutationObserver`, `requestAnimationFrame`, `SVGGraphicsElement.getBBox`).
 * So we feature-detect those too and bail unless we're in a real browser —
 * otherwise the module-level auto-init below throws during server render.
 */

// Lean, zero-import ~1 KB ticker for the `countdown` chart type — the only
// dynamic dgmo chart. Its own subpath so this client bundle never pulls the
// render pipeline. Lights up all five remark host wrappers (Astro, Docusaurus,
// Fumadocs, Nextra, VitePress) — they all call bindDgmo().
import { startCountdowns } from '@diagrammo/dgmo/countdown';
// Same deal for the `clock` chart type — a sibling ~1 KB 1s ticker on its own
// subpath. Updates the baked `data-dgmo-clock` analog/digital world-clock rows.
import { startClocks } from '@diagrammo/dgmo/clock';

let clickHandlerBound = false;
let themeObserverBound = false;

function isInteractiveBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof MutationObserver !== 'undefined' &&
    typeof requestAnimationFrame !== 'undefined'
  );
}

export function bindDgmo(): void {
  if (!isInteractiveBrowser()) return;

  if (!clickHandlerBound) {
    // Capture phase, not bubble: the handler must run BEFORE any
    // framework-level click handling. Docusaurus (markdown.format 'md')
    // maps the raw <details> onto its theme Details component, whose React
    // onClick — delegated at the app root — toggles the panel for ANY click
    // inside the <summary>, including our copy/open buttons. Capturing at
    // document and stopping propagation for in-summary buttons keeps those
    // clicks ours; plain summary clicks pass through untouched so the
    // toggle (native or framework-managed) still works.
    document.addEventListener(
      'click',
      (e) => {
        void handleToolbarBtnClick(e);
      },
      true
    );
    clickHandlerBound = true;
  }
  tightenViewBoxes();

  // Seed the dynamic chart types (countdown, clock) and register their 1s
  // tickers (idempotent; no-op when none are on the page). Both call
  // `window.setInterval`, so gate on it: a partial DOM can clear the
  // interactive-browser guard above yet still lack timers (some SSG runtimes).
  if (typeof window.setInterval === 'function') {
    startCountdowns();
    startClocks();
  }

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
  if (insideSummary) {
    e.preventDefault();
    // Keep the click from reaching framework toggle handlers (Docusaurus's
    // Details component collapses the panel on any in-summary click).
    e.stopPropagation();
  }

  if (btn.matches('button.dgmo-expand')) {
    openDgmoLightbox(btn);
    return;
  }

  if (btn.matches('button.dgmo-copy')) {
    const src = btn.dataset['dgmoSource'] ?? '';
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
      window.open(
        anchor.href,
        anchor.target || '_blank',
        'noopener,noreferrer'
      );
    }
  }
}

// ============================================================
// Full-screen lightbox (expand toolbar button)
// ============================================================
//
// MIRROR of the canonical helper in @diagrammo/dgmo's `auto/shared.ts`
// (`openDgmoLightbox`), kept near-verbatim here for the same reason copy/open
// handling is mirrored per surface. The `.dgmo-lightbox*` CSS is single-sourced
// in dgmo's BLOCK_CSS (this package's client.css is a generated byte-copy).

const LIGHTBOX_XLINK_NS = 'http://www.w3.org/1999/xlink';
const LIGHTBOX_REF_ATTRS = [
  'clip-path',
  'mask',
  'filter',
  'fill',
  'stroke',
  'marker-start',
  'marker-mid',
  'marker-end',
];
let lightboxIdSeq = 0;

const LIGHTBOX_CLOSE_ICON =
  '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 4 8 8"/><path d="m12 4-8 8"/></svg>';

/**
 * Namespace a cloned SVG's ids + internal `url(#id)`/`href="#id"` refs so the
 * clone can't clash with the still-mounted inline copy (WebKit resolves
 * duplicate ids to the first match, corrupting gradients/clips/masks).
 */
function namespaceLightboxSvgIds(root: SVGElement, prefix: string): void {
  const map = new Map<string, string>();
  root.querySelectorAll('[id]').forEach((el) => {
    const oldId = el.getAttribute('id');
    if (!oldId) return;
    const newId = prefix + oldId;
    map.set(oldId, newId);
    el.setAttribute('id', newId);
  });
  if (map.size === 0) return;
  const remap = (value: string): string =>
    value.replace(/url\(#([^)]+)\)/g, (m, id: string) => {
      const next = map.get(id);
      return next ? `url(#${next})` : m;
    });
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of LIGHTBOX_REF_ATTRS) {
      const v = el.getAttribute(attr);
      if (v && v.includes('url(#')) el.setAttribute(attr, remap(v));
    }
    const style = el.getAttribute('style');
    if (style && style.includes('url(#'))
      el.setAttribute('style', remap(style));
    const href = el.getAttribute('href');
    if (href && href.startsWith('#') && map.has(href.slice(1)))
      el.setAttribute('href', '#' + map.get(href.slice(1)));
    const xhref = el.getAttributeNS(LIGHTBOX_XLINK_NS, 'href');
    if (xhref && xhref.startsWith('#') && map.has(xhref.slice(1)))
      el.setAttributeNS(
        LIGHTBOX_XLINK_NS,
        'href',
        '#' + map.get(xhref.slice(1))
      );
  });
}

/**
 * Open the diagram belonging to `fromButton`'s block in a full-viewport
 * `<dialog>` lightbox: clone the currently-visible color-mode SVG, namespace
 * its ids, then `showModal()`. Escape / backdrop-click / close button dismiss.
 */
function openDgmoLightbox(fromButton: Element): void {
  if (typeof document === 'undefined') return;
  const block = fromButton.closest('.dgmo');
  if (!block) return;

  const wrappers = block.querySelectorAll('.dgmo-light, .dgmo-dark, .dgmo-svg');
  let svg: SVGSVGElement | null = null;
  for (const w of Array.from(wrappers)) {
    if (window.getComputedStyle(w).display === 'none') continue;
    const found = w.querySelector('svg');
    if (found) {
      svg = found as SVGSVGElement;
      break;
    }
  }
  if (!svg) svg = block.querySelector('svg');
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  namespaceLightboxSvgIds(clone, `dgmo-lb-${++lightboxIdSeq}-`);

  const dialog = document.createElement('dialog');
  dialog.className = 'dgmo-lightbox';
  dialog.setAttribute('aria-label', 'Diagram, full screen');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dgmo-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close full screen');
  closeBtn.innerHTML = LIGHTBOX_CLOSE_ICON;

  const host = document.createElement('div');
  host.className = 'dgmo-lightbox-svg';
  host.appendChild(clone);

  dialog.appendChild(closeBtn);
  dialog.appendChild(host);
  document.body.appendChild(dialog);

  const close = (): void => {
    if (dialog.open) dialog.close();
  };
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function tightenViewBoxes(): void {
  const WRAPPER_SELECTORS = '.dgmo-light, .dgmo-dark, .dgmo-svg';
  document.querySelectorAll(WRAPPER_SELECTORS).forEach((node) => {
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

    if (wasHidden) {
      wrapper.style.display = savedInlineDisplay;
      // Clearing the only inline property leaves `style=""` on the
      // element in Chrome/Safari. React 19's post-hydration check reads
      // that empty attribute as a server-vs-client mismatch on the
      // wrapper div (the wrapper is React-owned; only its `innerHTML`
      // is dangerouslySetInnerHTML). Drop the empty attribute so the
      // wrapper round-trips back to its SSR shape.
      if (savedInlineDisplay === '' && wrapper.getAttribute('style') === '') {
        wrapper.removeAttribute('style');
      }
    }
  });
}

// Auto-init on initial load. Docusaurus-style SPA wrappers also re-call
// bindDgmo on route changes; that's safe (the click handler is bound once,
// viewBox tightening runs every time).
if (isInteractiveBrowser()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDgmo);
  } else {
    bindDgmo();
  }
}
