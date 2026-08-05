/**
 * The transformer half of live links (story 10.4): interception, the
 * off-by-default guarantee, the markers a refresh reads back, and what a
 * withdrawn reference turns into.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Root } from 'mdast';

import remarkDgmo from '../src/remark-plugin.js';
import {
  serializeCache,
  type ReferenceCacheFs,
} from '../src/reference-resolve.js';

const ID = 'dgm_01HQ3';
const SOURCE = 'piechart Revenue\n  Q1 40\n  Q2 60';

function tree(value: string, meta: string | null = null): Root {
  return {
    type: 'root',
    children: [{ type: 'code', lang: 'dgmo', meta, value }],
  } as Root;
}

const html = (t: Root) => (t.children[0] as unknown as { value: string }).value;

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

describe('a live link renders as an ordinary block', () => {
  it('resolves the fence body and renders the fetched source', async () => {
    const t = tree(`live-link ${ID}`);
    await remarkDgmo({ colorMode: 'light', liveLink: liveLink() })(t);

    expect(html(t)).toContain('<svg');
    expect(html(t)).toContain('dgmo--diagram');
  });

  it('keeps fence meta working — the body says WHICH, the meta says HOW', async () => {
    const t = tree(`live-link ${ID}`, 'showcase');
    await remarkDgmo({ colorMode: 'light', liveLink: liveLink() })(t);

    expect(html(t)).toContain('dgmo--showcase');
    expect(html(t)).toContain('dgmo-copy');
  });

  it('stamps the markers a refresh needs, and nothing else', async () => {
    const t = tree(`live-link ${ID}`);
    await remarkDgmo({ colorMode: 'light', liveLink: liveLink() })(t);

    expect(html(t)).toContain(`data-dgmo-ref="${ID}"`);
    expect(html(t)).toContain('data-dgmo-ref-updated="4242"');
    expect(html(t)).toContain('data-dgmo-ref-version="0.56.0"');
  });

  it('accepts the fence spellings — parity is the resolver’s job, not ours', async () => {
    // 🔴 `![[live-link:<id>]]` is deliberately absent: it is the host document's
    // markdown, and a fence's content is DGMO. Accepted here until 2026-08-05,
    // and taught by the showcase content, which is how markdown came to be
    // nested inside a code fence that was itself inside markdown.
    for (const body of [
      `live-link ${ID}`,
      `https://api.diagrammo.app/public/diagrams/${ID}/source`,
    ]) {
      const t = tree(body);
      await remarkDgmo({ colorMode: 'light', liveLink: liveLink() })(t);
      expect(html(t)).toContain(`data-dgmo-ref="${ID}"`);
    }
  });

  it('🔴 the note spelling is not a fence spelling', async () => {
    // It renders as whatever DGMO makes of it — which is nothing — rather than
    // being silently resolved. `![[…]]` belongs in the document body, where the
    // host's own transclusion handles it.
    const t = tree(`![[live-link:${ID}]]`);
    await remarkDgmo({ colorMode: 'light', liveLink: liveLink() })(t);
    expect(html(t)).not.toContain(`data-dgmo-ref="${ID}"`);
  });
});

describe('ON by default, and OFF is a deliberate choice', () => {
  it('AC17: a wrapper with no config at all resolves and bakes the diagram', async () => {
    // The old default was OFF, so non-piloting wrappers changed behaviour by
    // zero bytes. That promise is retired: a pointer that does not resolve is
    // not a feature someone opted into, it is a broken page.
    const fetchImpl = okFetch();
    const t = tree(`live-link ${ID}`);
    await remarkDgmo({
      colorMode: 'light',
      liveLink: { fetchImpl, fs: memFs() },
    })(t);

    expect(fetchImpl).toHaveBeenCalled();
    expect(html(t)).toContain(`data-dgmo-ref="${ID}"`);
  });

  it('AC18: off renders the reference card with a click-through, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = okFetch();
    const t = tree(`live-link ${ID}`);

    await remarkDgmo({
      colorMode: 'light',
      liveLink: { enabled: false, fetchImpl, fs: memFs() },
    })(t, { path: 'docs/architecture.md' });

    // Never fetched…
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(html(t)).not.toContain('data-dgmo-ref');
    // …but not an error block either. Since `live-link` became a real chart
    // type, calling a valid fence broken takes deliberate work.
    expect(html(t)).toContain('<svg');
    expect(html(t)).toContain('Live link published at Diagrammo Cloud');
    // AC18 — the card itself links through to the diagram.
    expect(html(t)).toContain('dgmo-live-link-view');
    expect(html(t)).toContain(`https://online.diagrammo.app/d/${ID}`);
    // AC22 — the author-facing affordance, and where it points.
    expect(html(t)).toContain('dgmo-live-link-enable');
    expect(html(t)).toContain('Show this diagram here');
    expect(html(t)).toContain('https://diagrammo.app/docs/live-links/');

    // The warning names the option and the source file, not just an id.
    const message = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(message).toContain('liveLink');
    expect(message).toContain('docs/architecture.md');
    expect(message).toContain(ID);
    warn.mockRestore();
  });

  it('off: every fence spelling renders the card, not just the keyword one', async () => {
    // The card is produced by rendering a canonical `live-link <id>`, never the
    // raw fence body — a plain share URL is not a chart-type declaration, so
    // passing the body through would hand it an "Unsupported chart type" card
    // while the warning promised a reference card.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const body of [
      `live-link ${ID}`,
      `https://online.diagrammo.app/d/${ID}`,
    ]) {
      const t = tree(body);
      await remarkDgmo({
        colorMode: 'light',
        liveLink: { enabled: false, fetchImpl: okFetch(), fs: memFs() },
      })(t);
      expect(html(t), body).toContain('Live link published at Diagrammo Cloud');
      expect(html(t), body).not.toContain('Unsupported chart type');
      expect(html(t), body).toContain('dgmo-live-link-off');
    }
    warn.mockRestore();
  });

  it('a pasted diagram is untouched when live links are ON', async () => {
    const fetchImpl = okFetch();
    const t = tree(SOURCE);
    await remarkDgmo({
      colorMode: 'light',
      liveLink: liveLink({ fetchImpl }),
    })(t);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(html(t)).toContain('<svg');
    expect(html(t)).not.toContain('data-dgmo-ref');
  });
});

describe('when the reference cannot be resolved', () => {
  it('a withdrawn diagram becomes the tombstone card, carrying nothing about it', async () => {
    const cache = serializeCache({
      id: ID,
      source: 'piechart Secret Restructuring Plan\n  A 1',
      dgmoVersion: '0.56.0',
      updatedAt: 1,
      fetchedAt: 1,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = tree(`live-link ${ID}`);

    await remarkDgmo({
      colorMode: 'light',
      liveLink: liveLink({
        fetchImpl: vi.fn(() =>
          Promise.resolve(new Response('{}', { status: 410 }))
        ) as unknown as typeof fetch,
        fs: memFs({ [`.dgmo/references/${ID}.json`]: cache }),
      }),
    })(t);

    expect(html(t)).toContain('no longer shared');
    expect(html(t)).toContain('dgmo--tombstone');
    // NOT the cached copy — our cache must not outlive the author's revocation.
    expect(html(t)).not.toContain('Restructuring');
    expect(html(t)).not.toContain('<svg');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a bad id fails the BUILD, and the message names the file and line', async () => {
    const t: Root = {
      type: 'root',
      children: [
        {
          type: 'code',
          lang: 'dgmo',
          meta: null,
          value: `live-link ${ID}`,
          position: {
            start: { line: 12, column: 1, offset: 0 },
            end: { line: 14, column: 1, offset: 0 },
          },
        },
      ],
    } as Root;

    await expect(
      remarkDgmo({
        colorMode: 'light',
        liveLink: liveLink({
          fetchImpl: vi.fn(() =>
            Promise.resolve(new Response('{}', { status: 404 }))
          ) as unknown as typeof fetch,
        }),
      })(t, { path: 'docs/architecture.md' })
    ).rejects.toThrow(/docs\/architecture\.md:12/);
  });

  it('an unreachable Cloud does NOT fail the build when the cache can answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = tree(`live-link ${ID}`);

    await remarkDgmo({
      colorMode: 'light',
      liveLink: liveLink({
        fetchImpl: vi.fn(() =>
          Promise.reject(new Error('ENOTFOUND'))
        ) as unknown as typeof fetch,
        fs: memFs({
          [`.dgmo/references/${ID}.json`]: serializeCache({
            id: ID,
            source: SOURCE,
            dgmoVersion: '0.56.0',
            updatedAt: 7,
            fetchedAt: 7,
          }),
        }),
      }),
    })(t);

    expect(html(t)).toContain('<svg');
    expect(html(t)).toContain('data-dgmo-ref-updated="7"');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
