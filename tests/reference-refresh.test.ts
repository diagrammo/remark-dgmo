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
} from '../src/reference-refresh.js';

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

  it('leaves a withdrawn diagram to the next build rather than blanking it', async () => {
    const el = block({ 'data-dgmo-ref': ID, 'data-dgmo-ref-updated': '100' });
    const before = el.innerHTML;

    await refreshCloudReferences({
      fetchImpl: vi.fn(() =>
        Promise.resolve(new Response('{}', { status: 410 }))
      ) as unknown as typeof fetch,
      schedule: now,
    });

    expect(el.innerHTML).toBe(before);
  });

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
