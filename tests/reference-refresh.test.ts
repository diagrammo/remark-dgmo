/**
 * The client half of cloud references (story 10.4).
 *
 * Everything here is about restraint: what it does NOT do on a page with no
 * references, what it does NOT load until a diagram has actually moved, and how
 * it behaves when the fetch is blocked — which is the expected case on a site
 * whose CSP omits our origin, and the failure that cannot report itself.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  refreshCloudReferences,
  type RendererLike,
  setReferenceRenderer,
} from '../src/reference-refresh.js';
import { TOMBSTONE_TEXT, tombstoneCardHtml } from '../src/tombstone-card.js';

const ID = 'dgm_01HQ3';

/** Run the scheduled pass immediately — no idle callback in a test. */
const now = (run: () => void) => {
  run();
};

function block(
  attrs: Record<string, string>,
  inner = '<svg viewBox="0 0 100 50"></svg>'
) {
  const el = document.createElement('figure');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = inner;
  document.body.appendChild(el);
  return el;
}

const source = (over: Record<string, unknown> = {}) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          id: ID,
          source: 'piechart X\n  A 1',
          dgmoVersion: '0.56.0',
          updatedAt: 200,
          ...over,
        }),
        { status: 200 }
      )
    )
  ) as unknown as typeof fetch;

const renderer = (html: string): (() => Promise<RendererLike>) => {
  return () =>
    Promise.resolve({
      renderDgmoBlock: () => Promise.resolve({ html }),
    });
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the inert path', () => {
  it('does nothing at all on a page with no references', async () => {
    // ⚠️ vitepress-dgmo ships this client without using the remark plugin.
    const fetchImpl = source();
    document.body.innerHTML = '<figure class="dgmo"><svg></svg></figure>';

    await refreshCloudReferences({ fetchImpl, schedule: now });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not load the renderer when nothing has moved', async () => {
    const loadRenderer = vi.fn(renderer('<figure><svg/></figure>'));
    block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '200' });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 200 }),
      schedule: now,
      loadRenderer,
    });

    // The whole cost model: one edge-cached fetch, and no megabytes.
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('fetches once for a diagram referenced by several blocks', async () => {
    const fetchImpl = source();
    block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '200' });
    block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '200' });

    await refreshCloudReferences({ fetchImpl, schedule: now });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('when the diagram has moved', () => {
  it('swaps the rendered content in', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
      loadRenderer: renderer(
        '<figure><svg viewBox="0 0 100 50"><title>fresh</title></svg></figure>'
      ),
    });

    expect(el.innerHTML).toContain('fresh');
    expect(el.dataset['dgmoRefRefreshed']).toBe('true');
  });

  it('refuses the swap when the renderer version disagrees with the bake', async () => {
    const loadRenderer = vi.fn(renderer('<figure><svg/></figure>'));
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.50.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300, dgmoVersion: '0.56.0' }),
      schedule: now,
      loadRenderer,
    });

    expect(loadRenderer).not.toHaveBeenCalled();
    expect(el.querySelector('.dgmo-updated')).not.toBeNull();
    expect(el.innerHTML).toContain('<svg');
  });

  it('refuses a swap that would reflow the page, and labels it instead', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
      // 100×50 became 100×400 — a diagram that grew eightfold in height.
      loadRenderer: renderer(
        '<figure><svg viewBox="0 0 100 400"></svg></figure>'
      ),
    });

    expect(el.dataset['dgmoRefRefreshed']).toBeUndefined();
    expect(el.querySelector('.dgmo-updated')).not.toBeNull();
  });

  it('labels rather than breaks when the renderer cannot be loaded', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
      loadRenderer: () => Promise.reject(new Error('chunk load failed')),
    });

    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('.dgmo-updated')).not.toBeNull();
  });

  it('re-renders with the options the block was baked with', async () => {
    const seen: Array<Record<string, unknown> | undefined> = [];
    block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
      'data-dgmo-ref-opts': JSON.stringify({ palette: 'catppuccin' }),
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
      loadRenderer: () =>
        Promise.resolve({
          renderDgmoBlock: (_s: string, o?: Record<string, unknown>) => {
            seen.push(o);
            return Promise.resolve({
              html: '<figure><svg viewBox="0 0 100 50"></svg></figure>',
            });
          },
        }),
    });

    // A diagram that silently changes palette on refresh reads as a bug.
    expect(seen[0]).toMatchObject({ palette: 'catppuccin' });
  });
});

describe('a refresh can never break the page it runs on', () => {
  it('leaves the diagram alone when the fetch is blocked', async () => {
    // The CSP case: our origin is not in `connect-src`, the fetch rejects, and
    // the client cannot report it — the report would be blocked too.
    const el = block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '100' });
    const before = el.innerHTML;

    await refreshCloudReferences({
      fetchImpl: vi.fn(() =>
        Promise.reject(new TypeError('Failed to fetch'))
      ) as unknown as typeof fetch,
      schedule: now,
    });

    expect(el.innerHTML).toBe(before);
  });

  it.each([404, 429, 500, 503])(
    'leaves the diagram alone on a %i, which means "cannot say"',
    async (status) => {
      const el = block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '100' });
      const before = el.innerHTML;

      await refreshCloudReferences({
        fetchImpl: vi.fn(() =>
          Promise.resolve(new Response('{}', { status }))
        ) as unknown as typeof fetch,
        schedule: now,
      });

      expect(el.innerHTML).toBe(before);
      expect(el.querySelector('.dgmo-tombstone-text')).toBeNull();
    }
  );

  it('marks a block at most once', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.1.0',
    });

    for (let i = 0; i < 3; i += 1) {
      await refreshCloudReferences({
        fetchImpl: source({ updatedAt: 300 }),
        schedule: now,
      });
    }

    expect(el.querySelectorAll('.dgmo-updated')).toHaveLength(1);
  });
});

// ============================================================
// A withdrawn diagram stops drawing (issue 101)
// ============================================================
//
// The one case where this script takes something OFF the page. It is also the
// one case where leaving the page alone means publishing content an author took
// back — which is why it reverses the "the build decides" position that stood
// here until 2026-08-10, without reversing that position's actual objection:
// nothing below leaves a hole.

describe('when the author has stopped showing it', () => {
  const withdrawn = () =>
    vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 410 }))
    ) as unknown as typeof fetch;

  it('replaces the diagram with the card the build would have drawn', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      class: 'dgmo dgmo--diagram',
    });

    await refreshCloudReferences({ fetchImpl: withdrawn(), schedule: now });

    expect(el.querySelector('svg')).toBeNull();
    const text = el.querySelector('.dgmo-tombstone-text');
    expect(text?.textContent).toBe(TOMBSTONE_TEXT);
    // Same shape the build emits: the tombstone class, the diagram variant
    // gone, and `note` rather than `alert` — nothing went wrong here.
    expect([...el.classList].sort()).toEqual(['dgmo', 'dgmo--tombstone']);
    expect(el.getAttribute('role')).toBe('note');
    // 🔴 No link, no id, no title. What it says is all it says.
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).not.toContain(ID);
  });

  it('says exactly what the build says, character for character', async () => {
    // The two hosts of one sentence. A reader who follows the link must not be
    // told a second story, so this compares against the build's own card
    // rather than against a copy of the string typed here.
    const el = block({ 'data-dgmo-ref': ID, class: 'dgmo dgmo--diagram' });

    await refreshCloudReferences({ fetchImpl: withdrawn(), schedule: now });

    const built = document.createElement('div');
    built.innerHTML = tombstoneCardHtml();
    expect(el.querySelector('.dgmo-tombstone-text')?.textContent).toBe(
      built.querySelector('.dgmo-tombstone-text')?.textContent
    );
    expect(el.getAttribute('role')).toBe(
      built.firstElementChild?.getAttribute('role')
    );
  });

  it('wears the host’s own class name rather than assuming ours', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      class: 'diagram diagram--showcase legacy-thing',
    });

    await refreshCloudReferences({ fetchImpl: withdrawn(), schedule: now });

    expect([...el.classList].sort()).toEqual([
      'diagram',
      'diagram--tombstone',
      'legacy-thing',
    ]);
    expect(el.querySelector('.diagram-tombstone-text')).not.toBeNull();
  });

  it('stays a reference, so a later pass still recognises it', async () => {
    // 🔴 The block is mutated rather than replaced precisely so `data-dgmo-ref`
    // survives. Drop it and the second pass stops seeing the block at all,
    // which is how a withdrawn diagram would come back on a soft navigation.
    const el = block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '100' });
    const fetchImpl = withdrawn();

    await refreshCloudReferences({ fetchImpl, schedule: now });
    await refreshCloudReferences({ fetchImpl, schedule: now });

    expect(el.dataset['dgmoRef']).toBe(ID);
    expect(el.querySelectorAll('.dgmo-tombstone-text')).toHaveLength(1);
  });

  it('withdraws every block naming it, on one request', async () => {
    const a = block({ 'data-dgmo-ref': ID });
    const b = block({ 'data-dgmo-ref': ID });
    const fetchImpl = withdrawn();

    await refreshCloudReferences({ fetchImpl, schedule: now });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const el of [a, b]) {
      expect(el.querySelector('.dgmo-tombstone-text')).not.toBeNull();
    }
  });

  it('needs no renderer — the card is a sentence, not a drawing', async () => {
    const load = vi.fn(renderer('<figure><svg viewBox="0 0 1 1"></svg></figure>'));
    const el = block({ 'data-dgmo-ref': ID });

    await refreshCloudReferences({
      fetchImpl: withdrawn(),
      loadRenderer: load,
      schedule: now,
    });

    expect(load).not.toHaveBeenCalled();
    expect(el.querySelector('.dgmo-tombstone-text')).not.toBeNull();
  });
});

describe('the renderer is opt-in, and the default bundle cannot reach it', () => {
  it('notifies instead of swapping when no renderer is registered', async () => {
    // The default path. `client.js` registers nothing, so a moved diagram is
    // labelled rather than re-rendered — and, more to the point, the render
    // graph is absent from the bundle entirely.
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
    });

    expect(el.querySelector('.dgmo-updated')).not.toBeNull();
    expect(el.dataset['dgmoRefRefreshed']).toBeUndefined();
  });

  it('swaps once a renderer IS registered, then stops when it is removed', async () => {
    setReferenceRenderer(() =>
      Promise.resolve({
        renderDgmoBlock: () =>
          Promise.resolve({
            html: '<figure><svg viewBox="0 0 100 50"><title>fresh</title></svg></figure>',
          }),
      })
    );
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });

    await refreshCloudReferences({
      fetchImpl: source({ updatedAt: 300 }),
      schedule: now,
    });
    expect(el.innerHTML).toContain('fresh');

    setReferenceRenderer(null);
  });

  it('never mentions the render package in the base client bundle', async () => {
    // 🔴 The measurement that forced this shape: a static-analyzable dynamic
    // import in `client.js` made astro-dgmo's fixture emit the entire renderer
    // graph — 1 chunk / 7,990 gzipped bytes became 90 chunks / 634,199.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../src/reference-refresh.ts'),
      'utf8'
    );
    // Comments stripped first — this file EXPLAINS the constraint at length,
    // and an assertion that its own prose trips is an assertion nobody keeps.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/import\(\s*['"]@diagrammo\/dgmo/);
  });
});

describe('the default scheduler', () => {
  // Every other test in this file injects `schedule`, so the real one was never
  // run — which is how it shipped asking `requestIdleCallback` for a callback
  // with no deadline. On a page heavy enough to matter (the showcases carry
  // dozens of diagrams) the browser can defer that indefinitely, and the page
  // does nothing at all: no swap, and no notice either, because the callback
  // that produces both never fires.
  it('gives requestIdleCallback a deadline', async () => {
    block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });
    const idle = vi.fn((cb: () => void, _opts?: { timeout: number }) => {
      cb();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', idle);

    await refreshCloudReferences({ fetchImpl: source() });

    expect(idle).toHaveBeenCalledTimes(1);
    expect(idle.mock.calls[0][1]).toEqual({ timeout: expect.any(Number) });
    vi.unstubAllGlobals();
  });

  it('still runs on a browser that has no requestIdleCallback', async () => {
    block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    const fetchImpl = source();
    const pass = refreshCloudReferences({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1500);
    await pass;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('the default fetch, called the way a browser demands', () => {
  // 🔴 The bug this exists for shipped in every release of the feature and was
  // invisible from the outside. `fetch` is a WebIDL operation on `Window`: it
  // throws `Illegal invocation` unless its `this` IS the global. The code held
  // it on an options object and called `ctx.fetchImpl(url)` — a method call —
  // so `this` was that plain object, the call threw, and `refreshOne`'s catch
  // filed it under "offline, or blocked by CSP". No swap, no notice, no error.
  //
  // Every test above injects a `vi.fn()`, which is an ordinary function and does
  // not care what `this` is. That is precisely why none of them caught it, so
  // this one models the real failure instead.
  const nativeLike = (body: Record<string, unknown>) =>
    function (this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'Window': Illegal invocation"
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 })
      );
    } as unknown as typeof fetch;

  it('reaches a this-sensitive global fetch when none is injected', async () => {
    const el = block({
      'data-dgmo-ref': ID,
      'data-dgmo-ref-updated': '100',
      'data-dgmo-ref-version': '0.56.0',
    });
    vi.stubGlobal(
      'fetch',
      nativeLike({
        id: ID,
        source: 'piechart X\n  A 1',
        dgmoVersion: '0.56.0',
        updatedAt: 200,
      })
    );

    // No fetchImpl — the production path.
    await refreshCloudReferences({ schedule: now });

    // It got far enough to act on the answer. Before the fix it silently did
    // nothing at all, which is indistinguishable from "nothing had changed".
    expect(el.dataset['dgmoRefStale']).toBe('true');
    vi.unstubAllGlobals();
  });
});
