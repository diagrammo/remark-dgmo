/**
 * Cloud references at build time (story 10.4).
 *
 * The failure table is the deliverable, so it gets a test per row. The rows that
 * matter most are the two asymmetric ones: a build must not fail when a cache
 * can answer, and it must fail when nothing can.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  cachePath,
  ReferenceBuildError,
  resolveReference,
  resolveReferenceOptions,
  resolveReferences,
  serializeCache,
  type ReferenceCacheFs,
} from '../src/reference-resolve.js';

const ID = 'dgm_01HQ3';
const REF = { id: ID };
const NOW = 1_800_000_000_000;

/** An in-memory cache directory. */
function memFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const fs: ReferenceCacheFs = {
    read: (path) => Promise.resolve(files.get(path) ?? null),
    write: (path, contents) => {
      files.set(path, contents);
      return Promise.resolve();
    },
  };
  return { fs, files };
}

const cached = (over: Partial<Record<string, unknown>> = {}) =>
  serializeCache({
    id: ID,
    source: 'flowchart\n  Cached -> Copy',
    dgmoVersion: '0.56.0',
    updatedAt: 111,
    fetchedAt: 222,
    ...over,
  } as never);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function opts(
  fetchImpl: typeof fetch,
  fs: ReferenceCacheFs,
  over: Record<string, unknown> = {}
) {
  return resolveReferenceOptions({
    enabled: true,
    fetchImpl,
    fs,
    now: () => NOW,
    ...over,
  });
}

const PATH = cachePath('.dgmo/references', ID);

describe('200 — the ordinary case', () => {
  it('serves the fetched source and writes the cache', async () => {
    const { fs, files } = memFs();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        json({
          id: ID,
          source: 'flowchart\n  A -> B',
          dgmoVersion: '0.56.0',
          updatedAt: 999,
        })
      )
    ) as unknown as typeof fetch;

    const out = await resolveReference(REF, opts(fetchImpl, fs));

    expect(out).toEqual({
      kind: 'source',
      source: 'flowchart\n  A -> B',
      dgmoVersion: '0.56.0',
      updatedAt: 999,
      fromCache: false,
    });
    // Pretty-printed with a trailing newline: this file gets reviewed in a diff.
    expect(files.get(PATH)).toContain('"source": "flowchart\\n  A -> B"');
    expect(files.get(PATH)?.endsWith('}\n')).toBe(true);
  });
});

describe('the build never fails when the cache can answer', () => {
  it('network error + cache → cached source and a warning', async () => {
    const { fs } = memFs({ [PATH]: cached() });
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    ) as unknown as typeof fetch;

    const out = await resolveReference(REF, opts(fetchImpl, fs));

    expect(out).toMatchObject({
      kind: 'source',
      source: 'flowchart\n  Cached -> Copy',
      fromCache: true,
    });
    expect(out.kind === 'source' && out.warning).toContain('cached copy');
  });

  it('404 after it once worked → cached source, warned as possibly deleted', async () => {
    const { fs } = memFs({ [PATH]: cached() });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({}, 404))
    ) as unknown as typeof fetch;

    const out = await resolveReference(REF, opts(fetchImpl, fs));

    expect(out).toMatchObject({ kind: 'source', fromCache: true });
    expect(out.kind === 'source' && out.warning).toContain(
      'may have been deleted'
    );
  });

  it('a corrupt cache file reads as absent rather than exploding', async () => {
    const { fs } = memFs({ [PATH]: '{ this is not json' });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        json({
          id: ID,
          source: 'flowchart\n  A',
          dgmoVersion: '1',
          updatedAt: 1,
        })
      )
    ) as unknown as typeof fetch;
    // A bad merge conflict in a JSON file must not break a docs build.
    await expect(
      resolveReference(REF, opts(fetchImpl, fs))
    ).resolves.toMatchObject({ kind: 'source', fromCache: false });
  });
});

describe('the build fails when nothing can answer', () => {
  it('network error, no cache', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error('offline'))
    ) as unknown as typeof fetch;

    await expect(
      resolveReference(REF, opts(fetchImpl, fs))
    ).rejects.toBeInstanceOf(ReferenceBuildError);
  });

  it('404 that was never cached — this can only be a typo', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({}, 404))
    ) as unknown as typeof fetch;

    await expect(
      resolveReference(REF, opts(fetchImpl, fs), {
        path: 'docs/a.md',
        line: 12,
      })
    ).rejects.toThrow(/does not exist/);
  });

  it('offline with no cache says how to fix it', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      resolveReference(REF, opts(fetchImpl, fs, { offline: true }))
    ).rejects.toThrow(/offline/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('410 — withdrawn by its author', () => {
  it('shows the tombstone and NEVER the cached copy', async () => {
    // The author unshared it deliberately. Our cache must not outlive their
    // revocation — rendering the cached diagram would publish something taken
    // back, which is worse than the friendlier-looking behaviour.
    const { fs } = memFs({ [PATH]: cached() });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({}, 410))
    ) as unknown as typeof fetch;

    const out = await resolveReference(REF, opts(fetchImpl, fs));

    expect(out.kind).toBe('tombstone');
    expect(out.kind === 'tombstone' && out.warning).toContain('unshared');
  });

  it('does not fail the build — it is not the document author’s mistake', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({}, 410))
    ) as unknown as typeof fetch;
    await expect(
      resolveReference(REF, opts(fetchImpl, fs))
    ).resolves.toMatchObject({ kind: 'tombstone' });
  });
});

describe('429 and 5xx — one retry, then treated as unavailable', () => {
  it('retries once and takes the second answer', async () => {
    const { fs } = memFs();
    let call = 0;
    const fetchImpl = vi.fn(() => {
      call += 1;
      return Promise.resolve(
        call === 1
          ? json({}, 429)
          : json({
              id: ID,
              source: 'flowchart\n  A',
              dgmoVersion: '1',
              updatedAt: 2,
            })
      );
    }) as unknown as typeof fetch;

    await expect(
      resolveReference(REF, opts(fetchImpl, fs))
    ).resolves.toMatchObject({
      kind: 'source',
      fromCache: false,
    });
    expect(call).toBe(2);
  });

  it('does not retry a 404 — the answer will not change', async () => {
    const { fs } = memFs({ [PATH]: cached() });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({}, 404))
    ) as unknown as typeof fetch;
    await resolveReference(REF, opts(fetchImpl, fs));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('the batch', () => {
  it('fetches a repeated id exactly once', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        json({
          id: ID,
          source: 'flowchart\n  A',
          dgmoVersion: '1',
          updatedAt: 1,
        })
      )
    ) as unknown as typeof fetch;

    const out = await resolveReferences(
      [{ ref: REF }, { ref: REF }, { ref: REF }],
      opts(fetchImpl, fs)
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out.size).toBe(1);
  });

  it('never exceeds the concurrency cap', async () => {
    const { fs } = memFs();
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return json({
        id: ID,
        source: 'flowchart\n A',
        dgmoVersion: '1',
        updatedAt: 1,
      });
    }) as unknown as typeof fetch;

    await resolveReferences(
      Array.from({ length: 20 }, (_, i) => ({
        ref: { id: `dgm_${String(i)}` },
      })),
      opts(fetchImpl, fs, { concurrency: 3 })
    );

    expect(peak).toBeLessThanOrEqual(3);
  });

  it('collects a failure instead of cancelling the batch', async () => {
    const { fs } = memFs();
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes('bad')
          ? json({}, 404)
          : json({
              id: 'ok',
              source: 'flowchart\n A',
              dgmoVersion: '1',
              updatedAt: 1,
            })
      )
    ) as unknown as typeof fetch;

    const out = await resolveReferences(
      [{ ref: { id: 'dgm_bad' } }, { ref: { id: 'dgm_good' } }],
      opts(fetchImpl, fs)
    );

    expect(out.get('dgm_bad')).toBeInstanceOf(ReferenceBuildError);
    expect(out.get('dgm_good')).toMatchObject({ kind: 'source' });
  });
});
