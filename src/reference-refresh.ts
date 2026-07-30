/**
 * Cloud references — the client half (Diagrammo Cloud story 10.4).
 *
 * The build baked a diagram into the page. This checks, after the page is idle,
 * whether the diagram it points at has moved since, and swaps it if — and only
 * if — swapping is safe.
 *
 * ## What this is allowed to cost
 *
 * Almost nothing, on almost every page. The check is one conditional fetch per
 * referenced diagram against an edge-cached endpoint, and the overwhelmingly
 * common answer is "unchanged", which costs no work at all.
 *
 * 🔴 **There is no renderer in this module, not even behind a dynamic
 * `import()`, and that is the whole reason the file is shaped this way.**
 *
 * Measured on `astro-dgmo`'s own fixture, 2026-07-30: a plain
 * `await import('@diagrammo/dgmo/block')` here — dynamic, on a branch that
 * almost never runs — took the built site from **1 chunk / 7,990 gzipped bytes
 * to 90 chunks / 634,199**. Bundlers resolve a static-analyzable dynamic import
 * at BUILD time; "lazy" describes when the reader downloads it, not whether the
 * adopter ships it. Readers would not have paid for it, but every adopter's
 * `dist/` would, and the wrapper's own size assertion fails on the spot.
 *
 * So the default is to **notice, not to re-render**: a moved diagram gets a
 * small link to the live one. A site that genuinely wants the swap opts in by
 * loading `remark-dgmo/client-render.js`, which is the only module that
 * mentions the renderer — and therefore the only one whose graph a bundler can
 * follow.
 *
 * ## What it must never do
 *
 * Break the page it runs on. This code executes on somebody else's site, on a
 * diagram that already renders correctly, so **every failure path leaves the
 * baked diagram exactly as it is**: a blocked fetch (a CSP without our origin
 * is the expected case), a failed dynamic import, an offline reader, a renderer
 * whose version disagrees with the one that baked the page. Each of those ends
 * at the same place — a small "updated" affordance, or silence.
 *
 * ⚠️ This module ships inside `remark-dgmo/client.js`, which `vitepress-dgmo`
 * loads even though it does not use the remark plugin. On a page with no
 * `[data-dgmo-ref]` it must do nothing at all, and there is a test for that.
 */

/** Where the source endpoint lives. Overridable for self-host and tests. */
const DEFAULT_API_BASE = 'https://api.diagrammo.app';
/** Where a human goes to see the live diagram. */
const DEFAULT_APP_BASE = 'https://online.diagrammo.app';

/** Aspect-ratio drift a swap may absorb before it counts as reflowing the page. */
const MAX_ASPECT_DRIFT = 0.25;

export interface ReferenceRefreshOptions {
  apiBase?: string;
  appBase?: string;
  fetchImpl?: typeof fetch;
  /** Injected in tests; production defers to idle. */
  schedule?: (run: () => void) => void;
  /** Injected in tests so the 1.9 MB renderer isn't loaded to prove a branch. */
  loadRenderer?: () => Promise<RendererLike>;
  document?: Document;
}

export interface RendererLike {
  renderDgmoBlock: (
    source: string,
    options?: Record<string, unknown>
  ) => Promise<{ html: string }>;
}

/**
 * The opt-in renderer, registered by `remark-dgmo/client-render.js`.
 *
 * A registry rather than an import, because this module must stay free of any
 * reference to the render package — a bundler that can see one pulls its whole
 * graph into every adopter's build whether or not a diagram ever changes.
 *
 * Held on `globalThis` rather than in a module variable, and that is not
 * laziness: hosts inline these two files as SEPARATE script sources (Astro's
 * `injectScript` reads each one's text), so each carries its own copy of this
 * module and a module-level variable set by one would be invisible to the
 * other. A global is the only handshake that survives being bundled twice.
 */
const REGISTRY_KEY = '__dgmoReferenceRenderer';

type RegistryHost = { [REGISTRY_KEY]?: (() => Promise<RendererLike>) | null };

export function setReferenceRenderer(
  load: (() => Promise<RendererLike>) | null
): void {
  (globalThis as RegistryHost)[REGISTRY_KEY] = load;
}

function registeredRenderer(): (() => Promise<RendererLike>) | null {
  return (globalThis as RegistryHost)[REGISTRY_KEY] ?? null;
}

/**
 * `client-render.js` fires this once it has registered the renderer. Listening
 * for it is what lets the opt-in module stay import-free: it cannot call into
 * this one, so it announces itself instead, and a diagram that moved gets its
 * swap on this page load rather than the next.
 */
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('dgmo:renderer-ready', () => {
    void refreshCloudReferences();
  });
}

interface SourceResponse {
  source?: unknown;
  dgmoVersion?: unknown;
  updatedAt?: unknown;
}

function defaultSchedule(run: () => void): void {
  const idle = (
    globalThis as { requestIdleCallback?: (cb: () => void) => number }
  ).requestIdleCallback;
  if (typeof idle === 'function') idle(run);
  else setTimeout(run, 1000);
}

/**
 * Check every referenced diagram on the page and refresh what safely can be.
 * Resolves once the pass is done, so a test can await it; production fires it
 * and forgets.
 */
export async function refreshCloudReferences(
  options: ReferenceRefreshOptions = {}
): Promise<void> {
  const doc = options.document ?? globalThis.document;
  if (!doc) return;

  const blocks = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-dgmo-ref]')
  );
  // The inert path, and the common one: no references, no work, no fetch.
  if (blocks.length === 0) return;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return;

  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const schedule = options.schedule ?? defaultSchedule;

  await new Promise<void>((resolve) => {
    schedule(() => {
      void (async () => {
        // One request per distinct id, however many blocks name it.
        const byId = new Map<string, HTMLElement[]>();
        for (const el of blocks) {
          const id = el.dataset['dgmoRef'];
          if (!id) continue;
          byId.set(id, [...(byId.get(id) ?? []), el]);
        }
        await Promise.all(
          [...byId.entries()].map(([id, els]) =>
            refreshOne(id, els, { ...options, apiBase, fetchImpl, doc })
          )
        );
        resolve();
      })();
    });
  });
}

async function refreshOne(
  id: string,
  els: HTMLElement[],
  ctx: ReferenceRefreshOptions & {
    apiBase: string;
    fetchImpl: typeof fetch;
    doc: Document;
  }
): Promise<void> {
  let body: SourceResponse;
  try {
    const res = await ctx.fetchImpl(
      `${ctx.apiBase}/public/diagrams/${encodeURIComponent(id)}/source`
    );
    // A withdrawn diagram (410) is deliberately left alone here. The build
    // decides what a tombstone looks like, with a warning the site owner can
    // act on; silently blanking a rendered diagram in a reader's browser is
    // not this code's call to make.
    if (!res.ok) return;
    body = (await res.json()) as SourceResponse;
  } catch {
    // Blocked by CSP, offline, DNS, our outage — all the same answer: the page
    // keeps the diagram it already has. This is the expected path on a site
    // whose Content-Security-Policy omits our origin, and it is precisely why
    // that failure cannot be measured from here.
    return;
  }

  const source = typeof body.source === 'string' ? body.source : null;
  const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : null;
  const dgmoVersion =
    typeof body.dgmoVersion === 'string' ? body.dgmoVersion : '';
  if (source === null || updatedAt === null) return;

  for (const el of els) {
    const bakedAt = Number(el.dataset['dgmoRefUpdated'] ?? '');
    // Unchanged — the overwhelmingly common case, and the whole point of
    // comparing before doing anything expensive.
    if (Number.isFinite(bakedAt) && bakedAt >= updatedAt) continue;

    // The renderer that baked this page and the one that authored the new
    // revision disagree, so a re-render here could look different in ways
    // nobody chose. Say so instead of swapping.
    if (dgmoVersion && el.dataset['dgmoRefVersion'] !== dgmoVersion) {
      markUpdated(el, id, ctx);
      continue;
    }

    await swapOrMark(el, id, source, ctx);
  }
}

async function swapOrMark(
  el: HTMLElement,
  id: string,
  source: string,
  ctx: ReferenceRefreshOptions & { doc: Document }
): Promise<void> {
  const load = ctx.loadRenderer ?? registeredRenderer();
  // The default path, and the one almost every site takes: nobody registered a
  // renderer, so say the diagram moved and leave it alone.
  if (!load) {
    markUpdated(el, id, ctx);
    return;
  }

  let renderer: RendererLike;
  try {
    renderer = await load();
  } catch {
    markUpdated(el, id, ctx); // renderer unavailable: label it, don't break it
    return;
  }

  try {
    const opts = readBakeOptions(el);
    const { html } = await renderer.renderDgmoBlock(source, opts);
    const next = parseWrapper(html, ctx.doc);
    if (!next || !fitsTheBox(el, next)) {
      markUpdated(el, id, ctx);
      return;
    }
    el.innerHTML = next.innerHTML;
    el.dataset['dgmoRefRefreshed'] = 'true';
  } catch {
    markUpdated(el, id, ctx);
  }
}

/**
 * The render options this block was baked with, so a swap matches what is
 * already on the page rather than reverting to defaults — a diagram that
 * silently changes palette on refresh reads as a bug, not as freshness.
 */
function readBakeOptions(el: HTMLElement): Record<string, unknown> {
  const raw = el.dataset['dgmoRefOpts'];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseWrapper(html: string, doc: Document): HTMLElement | null {
  const host = doc.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement | null;
}

/**
 * Would the new render reflow the page? Compared by aspect ratio from the
 * emitted `viewBox`, which is what the blocks are sized by. An unmeasurable
 * pair is treated as "fits": refusing every swap we cannot measure would make
 * the feature not work at all on the surfaces least able to tell us why.
 */
function fitsTheBox(current: HTMLElement, next: HTMLElement): boolean {
  const a = aspect(current);
  const b = aspect(next);
  if (a === null || b === null) return true;
  return Math.abs(a - b) / a <= MAX_ASPECT_DRIFT;
}

function aspect(el: HTMLElement): number | null {
  const svg = el.querySelector('svg');
  const box = svg
    ?.getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number);
  if (!box || box.length !== 4) return null;
  const [, , w, h] = box as [number, number, number, number];
  if (!w || !h) return null;
  return w / h;
}

/**
 * The fallback for every path that cannot safely swap: a small link to the live
 * diagram. Idempotent, and deliberately quiet — a docs page peppered with
 * badges is worse than one that is a few days behind.
 */
function markUpdated(
  el: HTMLElement,
  id: string,
  ctx: ReferenceRefreshOptions & { doc: Document }
): void {
  if (el.dataset['dgmoRefStale'] === 'true') return;
  el.dataset['dgmoRefStale'] = 'true';
  const appBase = (ctx.appBase ?? DEFAULT_APP_BASE).replace(/\/+$/, '');
  const link = ctx.doc.createElement('a');
  link.className = 'dgmo-updated';
  link.href = `${appBase}/d/${encodeURIComponent(id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'This diagram has been updated';
  el.appendChild(link);
}
