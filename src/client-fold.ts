/**
 * Fold in the page — the OPT-IN entry (diagrammo/diagrammo#1741).
 *
 * A reader clicks a fold toggle, or presses Enter/Space on a focused one, and
 * THAT reader's copy of the diagram folds or unfolds. Nothing is saved: reload
 * and the page shows what the author wrote.
 *
 * ```js
 * import 'remark-dgmo/client.js';
 * import 'remark-dgmo/client-fold.js'; // opt in to folding
 * ```
 *
 * It pairs with the plugin's `fold: true`. Only then does the build mark a
 * foldable block with `data-dgmo-fold-opts` (the options it was baked with) and,
 * when no copy button holds the source, `data-dgmo-fold-source`, and draw its
 * toggles as buttons. With `fold` off, the toggles carry no button markup
 * (dgmo's `interactiveFolds: false`) and this file is not needed.
 *
 * ## Why it is a separate file
 *
 * The renderer is a dynamic `import()`, reached on the first toggle use. That
 * keeps the reader's eager download small; it does NOT keep the renderer out of
 * the site's build output. A bundler resolves a static-analyzable `import()` at
 * build time and emits its whole graph as lazy chunks. Measured on
 * `astro-dgmo`'s fixture, 2026-11-07, with this code inside `client.js`: eager
 * JS 12,404 → 14,405 gzipped bytes, emitted JS chunks 3 → 197. A module nobody
 * imports by default is the only way a bundler can decline to follow it — the
 * same reason `client-render.js` exists.
 *
 * ## Why it imports nothing, not even from this package
 *
 * Hosts INLINE the client entries into one script scope (Astro's
 * `injectScript`), so a top-level declaration here could collide with one in
 * `client.js`. The whole file is wrapped and declares nothing at the top level.
 * The fold logic finds a toggle by dgmo's four attributes only, so it knows no
 * chart type: dgmo's `foldAtLine` flips the `collapsed` marker on the toggle's
 * line and the block is drawn again with the options it was baked with.
 */

(() => {
  if (
    typeof document === 'undefined' ||
    typeof MutationObserver === 'undefined' ||
    typeof requestAnimationFrame === 'undefined'
  ) {
    return; // a partial SSR DOM (Docusaurus's static export), not a browser
  }
  const nextFrame = requestAnimationFrame.bind(globalThis);
  const doc = document;

  const TOGGLE_ATTRS = [
    'data-node-toggle',
    'data-group-toggle',
    'data-section-toggle',
    'data-note-toggle',
  ] as const;
  const TOGGLE_SELECTOR = TOGGLE_ATTRS.map((a) => `[${a}]`).join(', ');
  const BLOCK_SELECTOR = '[data-dgmo-fold-opts], [data-dgmo-ref-opts]';
  const WRAPPER_CLASSES = ['dgmo-light', 'dgmo-dark', 'dgmo-svg'] as const;

  interface FoldRenderer {
    foldAtLine(source: string, line: number, collapse: boolean): string | null;
    renderDgmoBlock(
      source: string,
      options: Record<string, unknown>
    ): Promise<{ html: string }>;
  }

  let renderer: Promise<FoldRenderer> | null = null;
  const loadRenderer = (): Promise<FoldRenderer> => {
    // Cached, and dropped again on failure so a flaky network gets a second
    // try on the next click instead of a dead toggle for the rest of the visit.
    renderer ??= (
      import('@diagrammo/dgmo/block') as Promise<unknown> as Promise<FoldRenderer>
    ).catch((err: unknown) => {
      renderer = null;
      throw err;
    });
    return renderer;
  };

  /**
   * The SVG this file last drew into each block. A cloud-reference refresh
   * (`client.js`) also redraws a block in place; when the SVG in the block is no
   * longer ours, the source this file kept is no longer the one on the page.
   */
  const drawn = new WeakMap<HTMLElement, Element | null>();

  /**
   * Give every toggle inside a foldable block a Tab stop. dgmo emits none on
   * purpose (the app preview allows one Tab stop per diagram, #1434); a static
   * page has no such rule, and a control the keyboard cannot reach is not one.
   */
  const markToggles = (root: ParentNode): void => {
    root.querySelectorAll(BLOCK_SELECTOR).forEach((block) => {
      block.querySelectorAll(TOGGLE_SELECTOR).forEach((t) => {
        if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
      });
    });
  };

  const currentSource = (block: HTMLElement): string | null => {
    const copy =
      block.querySelector<HTMLElement>('[data-dgmo-source]')?.dataset[
        'dgmoSource'
      ] ?? null;
    const mine = drawn.get(block);
    const ours = mine !== undefined && mine !== null && block.contains(mine);
    // Redrawn by a reference refresh after the build (or after our last
    // fold): only a copy button inside the new markup knows its source.
    if (block.dataset['dgmoRefRefreshed'] === 'true' && !ours) return copy;
    return block.dataset['dgmoFoldSource'] ?? copy;
  };

  const bakeOptions = (block: HTMLElement): Record<string, unknown> => {
    const raw = block.dataset['dgmoFoldOpts'] ?? block.dataset['dgmoRefOpts'];
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  /**
   * Fit each redrawn SVG's viewBox to what it draws, as `client.js` does at
   * load. A hidden colour-mode wrapper is shown for the measurement; the base
   * client re-fits every diagram again when the page's colour mode flips.
   */
  const fitViewBoxes = (block: HTMLElement): void => {
    for (const cls of WRAPPER_CLASSES) {
      block.querySelectorAll<HTMLElement>(`.${cls}`).forEach((wrapper) => {
        const svg = wrapper.querySelector('svg');
        if (!svg) return;
        const saved = wrapper.getAttribute('style');
        const hidden = getComputedStyle(wrapper).display === 'none';
        if (hidden) {
          wrapper.style.display = 'block';
          void wrapper.offsetHeight;
        }
        try {
          const b = (svg as unknown as SVGGraphicsElement).getBBox();
          if (b.width > 0 && b.height > 0) {
            svg.setAttribute(
              'viewBox',
              [b.x - 16, b.y - 16, b.width + 32, b.height + 32].join(' ')
            );
          }
        } catch {
          // getBBox unsupported: keep the build's viewBox
        }
        if (hidden) {
          if (saved === null) wrapper.removeAttribute('style');
          else wrapper.setAttribute('style', saved);
        }
      });
    }
  };

  const onFold = async (e: Event): Promise<void> => {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;

    let toggle: Element | null;
    if (e.type === 'keydown') {
      const key = (e as KeyboardEvent).key;
      if (key !== 'Enter' && key !== ' ') return;
      // The key goes to whatever has focus, so only a focused toggle counts —
      // Enter on a link that happens to sit inside the SVG is that link's.
      toggle = target.matches(TOGGLE_SELECTOR) ? target : null;
    } else {
      toggle = target.closest(TOGGLE_SELECTOR);
    }
    if (!toggle) return;
    const block = toggle.closest<HTMLElement>(BLOCK_SELECTOR);
    if (!block) return;

    // Space would scroll the page; a click on an SVG has no default worth
    // keeping.
    e.preventDefault();
    if (block.dataset['dgmoFolding'] === 'true') return;

    const line = Number(toggle.getAttribute('data-line-number'));
    const kind = TOGGLE_ATTRS.find((a) => toggle.hasAttribute(a));
    const source = currentSource(block);
    if (!Number.isInteger(line) || line < 1 || !kind || source === null) return;
    const collapse = toggle.getAttribute('aria-expanded') === 'true';
    const wrapper = WRAPPER_CLASSES.find((c) => toggle.closest(`.${c}`));
    const refocus =
      e.type === 'keydown' || block.ownerDocument.activeElement === toggle;

    block.dataset['dgmoFolding'] = 'true';
    try {
      const r = await loadRenderer();
      const next = r.foldAtLine(source, line, collapse);
      if (next === null) return;
      const { html } = await r.renderDgmoBlock(next, bakeOptions(block));
      const host = block.ownerDocument.createElement('div');
      host.innerHTML = html;
      const fresh = host.firstElementChild;
      if (!fresh) return;
      // The inner markup only: the block element keeps its own attributes, so
      // a reference stays a reference and this block stays foldable.
      block.innerHTML = fresh.innerHTML;
      block.dataset['dgmoFoldSource'] = next;
      drawn.set(block, block.querySelector('svg'));
      markToggles(block.parentNode ?? block);
      nextFrame(() => fitViewBoxes(block));

      if (refocus) {
        const scope = wrapper ? `.${wrapper} ` : '';
        block
          .querySelector<SVGElement>(
            `${scope}[${kind}][data-line-number="${String(line)}"]`
          )
          ?.focus({ preventScroll: true });
      }
      block.dispatchEvent(new Event('dgmo:folded', { bubbles: true }));
    } catch {
      // Renderer unreachable (offline, CSP) or the source no longer renders:
      // the reader keeps the diagram they had. A fold must never break a page.
    } finally {
      delete block.dataset['dgmoFolding'];
    }
  };

  const handler = (e: Event): void => {
    void onFold(e);
  };
  doc.addEventListener('click', handler);
  doc.addEventListener('keydown', handler);

  // Mark toggles now, and again whenever a page swaps content in (a
  // client-routed docs site renders new diagrams without a page load).
  let queued = false;
  const remark = (): void => {
    if (queued) return;
    queued = true;
    nextFrame(() => {
      queued = false;
      markToggles(doc);
    });
  };
  new MutationObserver(remark).observe(doc.documentElement, {
    childList: true,
    subtree: true,
  });
  markToggles(doc);
})();
