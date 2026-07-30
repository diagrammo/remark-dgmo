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
 * 🔴 **The renderer is `import()`ed only after a diagram is known to have moved,
 * and that is a hard constraint rather than a preference.** `astro-dgmo`'s own
 * build assertion fails if the renderer's jsdom sentinel appears in a page
 * chunk, its committed bundle baseline is 764 gzipped BYTES against a 100 KB
 * budget, and dgmo's browser render bundle is ~1.9 MB. A static import here
 * would put two megabytes of renderer into every docs page in exchange for a
 * refresh that fires on almost none of them.
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
  renderDgmoBlock(
    source: string,
    options?: Record<string, unknown>
  ): Promise<{ html: string }>;
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
  let renderer: RendererLike;
  try {
    // 🔴 The one dynamic import. It happens here — after a diagram is known to
    // have moved — and nowhere earlier.
    renderer =
      (await ctx.loadRenderer?.()) ??
      ((await import('@diagrammo/dgmo/block')) as unknown as RendererLike);
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
