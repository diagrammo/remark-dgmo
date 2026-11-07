/**
 * Fold in the page (diagrammo/diagrammo#1741, owner decision 2026-11-07): a
 * reader clicks a fold toggle and THAT reader's copy of the diagram folds or
 * unfolds. Nothing is saved — reload and the page shows what the author wrote.
 *
 * The build marks a foldable block with `data-dgmo-fold-opts` (or, on a cloud
 * reference, the `data-dgmo-ref-opts` it already carries) and, when the block
 * has no copy button holding the source, `data-dgmo-fold-source`. A toggle is
 * found by dgmo's four attributes only, so this file knows no chart type: dgmo's
 * `foldAtLine` flips the `collapsed` marker on the toggle's line and the block
 * is drawn again with the options it was baked with.
 *
 * 🔴 The renderer is a dynamic import, reached on the FIRST toggle and never
 * before. That keeps the reader's eager download where it was; it does NOT keep
 * the renderer out of the adopter's build output — bundlers resolve a
 * static-analyzable `import()` at build time and emit its graph as lazy chunks.
 * That cost is the owner's call on #1741: folding works on every docs site
 * without a host opting in, which is what `client-render.js` exists to avoid
 * for cloud references.
 */

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

function loadRenderer(): Promise<FoldRenderer> {
  // Cached, and dropped again on failure so a flaky network gets a second try
  // on the next click instead of a dead toggle for the rest of the visit.
  renderer ??= (
    import('@diagrammo/dgmo/block') as Promise<unknown> as Promise<FoldRenderer>
  ).catch((err: unknown) => {
    renderer = null;
    throw err;
  });
  return renderer;
}

/**
 * Give every toggle inside a foldable block a Tab stop. dgmo emits none on
 * purpose (the app preview allows one Tab stop per diagram, #1434); a static
 * page has no such rule, and a control the keyboard cannot reach is not one.
 */
export function markFoldToggles(root: ParentNode = document): void {
  root.querySelectorAll(BLOCK_SELECTOR).forEach((block) => {
    block.querySelectorAll(TOGGLE_SELECTOR).forEach((t) => {
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
    });
  });
}

/**
 * The delegated handler for `click` and `keydown` on the document. Returns once
 * the block is drawn again, or at once when the event is not a fold.
 */
export async function handleFoldEvent(
  e: Event,
  afterRender: () => void
): Promise<void> {
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

  // Space would scroll the page; a click on an SVG has no default worth keeping.
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
    const drawn = host.firstElementChild;
    if (!drawn) return;
    // The inner markup only: the block element keeps its own attributes, so
    // a reference stays a reference and this block stays foldable.
    block.innerHTML = drawn.innerHTML;
    block.dataset['dgmoFoldSource'] = next;
    markFoldToggles(block.parentNode ?? block);
    afterRender();

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
    // Renderer unreachable (offline, CSP) or the source no longer renders: the
    // reader keeps the diagram they had. A fold must never break a page.
  } finally {
    delete block.dataset['dgmoFolding'];
  }
}

function currentSource(block: HTMLElement): string | null {
  const own = block.dataset['dgmoFoldSource'];
  if (own !== undefined) return own;
  const copy = block.querySelector<HTMLElement>('[data-dgmo-source]');
  return copy?.dataset['dgmoSource'] ?? null;
}

function bakeOptions(block: HTMLElement): Record<string, unknown> {
  const raw = block.dataset['dgmoFoldOpts'] ?? block.dataset['dgmoRefOpts'];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
