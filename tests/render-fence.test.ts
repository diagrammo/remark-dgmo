/**
 * `renderDgmoFence` — the one-shot path for hosts with no document-wide batch
 * phase. `vitepress-dgmo` is the reason it exists: its markdown-it fence rule is
 * synchronous, fed by a per-fence async cache warm, so there is nowhere to hang
 * a per-document resolve. Before this it called `renderDgmoBlock` directly and a
 * live link was handed to the parser as if the URL were diagram source.
 *
 * The behaviour it must match is the remark plugin's, so these cases mirror
 * reference-plugin.test.ts rather than inventing their own contract.
 */

import { describe, expect, it, vi } from 'vitest';

import { renderDgmoFence } from '../src/render-fence.js';
import {
  serializeCache,
  type ReferenceCacheFs,
} from '../src/reference-resolve.js';

const ID = 'dgm_01HQ3';
const SOURCE = 'pie Revenue\n  Q1 40\n  Q2 60';

function memFs(seed: Record<string, string> = {}): ReferenceCacheFs {
  const files = new Map(Object.entries(seed));
  return {
    read: (p) => Promise.resolve(files.get(p) ?? null),
    write: (p, c) => {
      files.set(p, c);
      return Promise.resolve();
    },
  };
}

const okFetch = (status = 200) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          id: ID,
          source: SOURCE,
          dgmoVersion: '0.56.0',
          updatedAt: 4242,
        }),
        { status, headers: { 'content-type': 'application/json' } }
      )
    )
  ) as unknown as typeof fetch;

const liveLink = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  fetchImpl: okFetch(),
  fs: memFs(),
  ...over,
});

describe('renderDgmoFence', () => {
  it('renders pasted source without reaching the network', async () => {
    const fetchImpl = okFetch();
    const { html } = await renderDgmoFence(SOURCE, null, {
      colorMode: 'light',
      liveLink: liveLink({ fetchImpl }),
    });

    expect(html).toContain('<svg');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves a live link and bakes the markers a refresh reads back', async () => {
    const { html } = await renderDgmoFence(`live-link ${ID}`, null, {
      colorMode: 'light',
      liveLink: liveLink(),
    });

    expect(html).toContain('<svg');
    expect(html).toContain(`data-dgmo-ref="${ID}"`);
    expect(html).toContain('data-dgmo-ref-updated="4242"');
  });

  it('recognises a share URL, not just the keyword spelling', async () => {
    const { html } = await renderDgmoFence(
      `https://online.diagrammo.app/d/${ID}`,
      null,
      { colorMode: 'light', liveLink: liveLink() }
    );

    expect(html).toContain(`data-dgmo-ref="${ID}"`);
    expect(html).not.toContain('dgmo--error');
  });

  it('keeps fence meta working — the body says WHICH, the meta says HOW', async () => {
    const { html } = await renderDgmoFence(`live-link ${ID}`, 'showcase', {
      colorMode: 'light',
      liveLink: liveLink(),
    });

    expect(html).toContain(`data-dgmo-ref="${ID}"`);
    expect(html).toContain('dgmo--showcase');
  });

  it('draws the withdrawn-diagram card when the author stopped showing it', async () => {
    const gone = vi.fn(() =>
      Promise.resolve(new Response('', { status: 410 }))
    ) as unknown as typeof fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { html } = await renderDgmoFence(`live-link ${ID}`, null, {
      colorMode: 'light',
      liveLink: liveLink({ fetchImpl: gone }),
    });

    expect(html).not.toContain('<svg');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders the reference card, unfetched, when live links are off', async () => {
    const fetchImpl = okFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { html } = await renderDgmoFence(`live-link ${ID}`, null, {
      colorMode: 'light',
      liveLink: liveLink({ enabled: false, fetchImpl }),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(html).not.toContain('dgmo--error');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to the committed cache when the network is unreachable', async () => {
    const offline = vi.fn(() =>
      Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    ) as unknown as typeof fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { html } = await renderDgmoFence(`live-link ${ID}`, null, {
      colorMode: 'light',
      liveLink: liveLink({
        fetchImpl: offline,
        retries: 0,
        fs: memFs({
          [`.dgmo/references/${ID}.json`]: serializeCache({
            id: ID,
            source: SOURCE,
            dgmoVersion: '0.56.0',
            updatedAt: 4242,
            fetchedAt: 1000,
          }),
        }),
      }),
    });

    expect(html).toContain('<svg');
    expect(html).toContain(`data-dgmo-ref="${ID}"`);
    warn.mockRestore();
  });

  it('throws with the file and line attached when the id resolves to nothing', async () => {
    const missing = vi.fn(() =>
      Promise.resolve(new Response('', { status: 404 }))
    ) as unknown as typeof fetch;

    await expect(
      renderDgmoFence(
        `live-link ${ID}`,
        null,
        { colorMode: 'light', liveLink: liveLink({ fetchImpl: missing }) },
        { path: 'docs/index.md', line: 12 }
      )
    ).rejects.toThrow('docs/index.md:12');
  });
});
