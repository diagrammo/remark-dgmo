/**
 * Cloud references — build-time resolution (Diagrammo Cloud story 10.4).
 *
 * A ```dgmo fence whose body is `cloud abc123` names a diagram living in
 * Diagrammo Cloud instead of carrying its own source. This module turns that
 * name into source at build time, writes what it got into a cache the site
 * COMMITS, and decides — for every way the fetch can go wrong — whether the
 * build carries on or stops.
 *
 * ## The cache is committed, and it holds source
 *
 * `.dgmo/references/<id>.json` lives in the repository, not in
 * `node_modules/.cache`. A node_modules cache makes a clean CI checkout hit the
 * network for every reference on every build, which turns OUR availability into
 * THEIR build success — the exact thing this integration must never do. A
 * committed cache means our worst case is a build that is quietly a little
 * stale, and its reviewable case is a source diff in a pull request.
 *
 * It holds SOURCE rather than the rendered SVG on purpose. SVG would be hundreds
 * of kilobytes of generated markup churning in every diff, and it buys nothing:
 * the site pins its `@diagrammo/dgmo` version and rendering is deterministic, so
 * source plus a pinned renderer reproduces the same bytes.
 *
 * ## The failure table IS the feature
 *
 * | Situation                        | Build             | Page                    |
 * |----------------------------------|-------------------|-------------------------|
 * | 200                              | writes cache      | current diagram         |
 * | network error, cache present     | succeeds + warns  | last known good         |
 * | network error, no cache          | FAILS             | —                       |
 * | 404, never cached                | FAILS             | —                       |
 * | 404, previously cached           | succeeds + warns  | last known good         |
 * | 410 tombstone                    | succeeds + warns  | the tombstone card      |
 * | 429                              | one retry, then treated as a network error |
 *
 * Two rows deserve their reasons written down:
 *
 * **A never-cached 404 fails the build.** It can only be a typo, it is the
 * author's own, and it is discovered one line away from where it was made.
 * Rendering a placeholder there would ship a broken reference to production and
 * call it a warning.
 *
 * **A 410 shows the tombstone, never the cached render.** The author revoked
 * that diagram deliberately; our local copy must not outlive their revocation.
 * Stale-but-still-shared is fine. Stale-after-revoked is publishing something
 * somebody took back.
 */

import type { CloudReference } from '@diagrammo/dgmo/cloud-reference';
import { referenceSourceUrl } from '@diagrammo/dgmo/cloud-reference';

import type { BlockLocation } from './render-block.js';

/** What a resolved reference is, on disk and in hand. */
export interface CachedReference {
  id: string;
  source: string;
  dgmoVersion: string;
  /** When the served revision was committed, per the Cloud. */
  updatedAt: number;
  /** When WE last fetched it. Cache bookkeeping, never shown to a reader. */
  fetchedAt: number;
}

/**
 * The filesystem seam. Injected so every row of the table above is testable
 * without a temp directory, and so a host with a virtual filesystem can supply
 * its own.
 */
export interface ReferenceCacheFs {
  // Declared as properties, not methods: the seam gets destructured and passed
  // around, and a method signature makes `this` part of the contract when it
  // never should be.
  read: (path: string) => Promise<string | null>;
  write: (path: string, contents: string) => Promise<void>;
}

export interface ReferenceOptions {
  /**
   * Resolve `cloud <id>` fences. **Default `false`.** Off means a cloud fence
   * renders exactly as it does today — as an error block — so the wrappers that
   * are not piloting this change behaviour by zero bytes.
   */
  enabled?: boolean;
  /** Cloud API origin. Default: the public one. */
  base?: string;
  /** Committed cache directory, relative to the project root. */
  cacheDir?: string;
  /** Never touch the network; cache only. For a CI runner with no egress. */
  offline?: boolean;
  /** Max concurrent fetches per build. The endpoint is rate-limited. */
  concurrency?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to `node:fs/promises`. */
  fs?: ReferenceCacheFs;
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number;
}

export interface ResolvedReferenceOptions {
  enabled: boolean;
  base: string | undefined;
  cacheDir: string;
  offline: boolean;
  concurrency: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  fs: ReferenceCacheFs;
  now: () => number;
}

export const DEFAULT_CACHE_DIR = '.dgmo/references';
export const DEFAULT_CONCURRENCY = 6;
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The build stopped because of a reference. Carries the location so the message
 * can name a file and a line — an error that says only `dgm_01H…` sends someone
 * grepping through a docs site.
 */
export class ReferenceBuildError extends Error {
  readonly id: string;
  readonly location: BlockLocation | undefined;

  constructor(message: string, id: string, location?: BlockLocation) {
    super(message);
    this.name = 'ReferenceBuildError';
    this.id = id;
    if (location) this.location = location;
  }
}

export type ReferenceOutcome =
  | {
      kind: 'source';
      source: string;
      dgmoVersion: string;
      updatedAt: number;
      /** True when the network was unavailable and the cache answered. */
      fromCache: boolean;
      warning?: string;
    }
  | { kind: 'tombstone'; warning: string };

export function resolveReferenceOptions(
  opts: ReferenceOptions = {}
): ResolvedReferenceOptions {
  return {
    enabled: opts.enabled ?? false,
    base: opts.base,
    cacheDir: opts.cacheDir ?? DEFAULT_CACHE_DIR,
    offline: opts.offline ?? false,
    concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    fs: opts.fs ?? nodeCacheFs(),
    now: opts.now ?? (() => Date.now()),
  };
}

/**
 * Lazily-imported `node:fs/promises`, so the client bundle never sees it.
 * Arrow properties rather than method shorthand: this object is destructured
 * and passed around, and a method that loses its `this` is a worse bug than the
 * two extra characters are a cost.
 */
function nodeCacheFs(): ReferenceCacheFs {
  return {
    read: async (path: string) => {
      // Namespace rather than destructured imports: pulling a function off a
      // module object detaches it from its `this`, which the lint rule objects
      // to and which is a real hazard for anything that turns out to be a
      // method.
      const fs = await import('node:fs/promises');
      try {
        return await fs.readFile(path, 'utf8');
      } catch {
        return null; // absent or unreadable — both mean "no cache"
      }
    },
    write: async (path: string, contents: string) => {
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      await fs.mkdir(nodePath.dirname(path), { recursive: true });
      await fs.writeFile(path, contents, 'utf8');
    },
  };
}

let noticed = false;

/**
 * Say the prerequisite out loud, once per build, the first time a reference is
 * actually resolved.
 *
 * A site whose Content-Security-Policy omits our origin bakes perfectly and
 * refreshes never — the diagram looks right, nothing errors, and **the client
 * cannot report being blocked because the report is blocked too**. That failure
 * is invisible to measurement by construction, so the only real mitigation is
 * telling somebody at the moment they are demonstrably paying attention: the
 * build where they first used the feature.
 */
export function noticeCspPrerequisite(base: string | undefined): void {
  if (noticed) return;
  noticed = true;
  const origin = base ?? 'https://api.diagrammo.app';
  console.info(
    `[remark-dgmo] Cloud references resolved. For diagrams to refresh in the browser, your Content-Security-Policy must allow \`connect-src ${origin}\` — without it the baked diagram still renders, but it will never update, and nothing can report that.`
  );
}

/** Test seam: reset the once-per-process notice. */
export function resetCspNotice(): void {
  noticed = false;
}

export function cachePath(dir: string, id: string): string {
  return `${dir.replace(/\/+$/, '')}/${id}.json`;
}

/**
 * Serialize a cache entry: pretty-printed, trailing newline, stable key order.
 * The point of this file is that a human reviews it in a diff, so it is
 * formatted for that rather than for bytes.
 */
export function serializeCache(entry: CachedReference): string {
  return `${JSON.stringify(
    {
      id: entry.id,
      source: entry.source,
      dgmoVersion: entry.dgmoVersion,
      updatedAt: entry.updatedAt,
      fetchedAt: entry.fetchedAt,
    },
    null,
    2
  )}\n`;
}

function parseCache(raw: string | null): CachedReference | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedReference>;
    if (typeof parsed.source !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      source: parsed.source,
      dgmoVersion:
        typeof parsed.dgmoVersion === 'string' ? parsed.dgmoVersion : '',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
    };
  } catch {
    // A corrupt cache file is not a build failure: it is treated as absent, so
    // the next successful fetch overwrites it. Failing here would make a bad
    // merge conflict in a JSON file break a docs build.
    return null;
  }
}

type FetchResult =
  | { kind: 'ok'; entry: CachedReference }
  | { kind: 'gone' } // 410 — withdrawn by its author
  | { kind: 'missing' } // 404 — no such published diagram
  | { kind: 'unavailable'; reason: string }; // network, timeout, 5xx, 429

async function fetchOnce(
  ref: CloudReference,
  opts: ResolvedReferenceOptions
): Promise<FetchResult> {
  const url = referenceSourceUrl(
    ref,
    opts.base === undefined ? {} : { base: opts.base }
  );
  try {
    const res = await opts.fetchImpl(url, {
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { accept: 'application/json' },
    });
    if (res.status === 410) return { kind: 'gone' };
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) {
      return { kind: 'unavailable', reason: `HTTP ${String(res.status)}` };
    }
    const body = (await res.json()) as Partial<CachedReference>;
    if (typeof body.source !== 'string') {
      return { kind: 'unavailable', reason: 'malformed response' };
    }
    return {
      kind: 'ok',
      entry: {
        id: ref.id,
        source: body.source,
        dgmoVersion:
          typeof body.dgmoVersion === 'string' ? body.dgmoVersion : '',
        updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : 0,
        fetchedAt: opts.now(),
      },
    };
  } catch (err) {
    return {
      kind: 'unavailable',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** One fetch, plus a single retry when the answer was "not right now" (429/5xx). */
async function fetchWithRetry(
  ref: CloudReference,
  opts: ResolvedReferenceOptions
): Promise<FetchResult> {
  const first = await fetchOnce(ref, opts);
  if (first.kind !== 'unavailable') return first;
  return fetchOnce(ref, opts);
}

/**
 * Resolve one reference to something renderable, or throw.
 *
 * Network first, cache as the floor: every build tries the endpoint, and only a
 * 2xx updates the cache. A build that cannot reach us is a build that renders
 * what it rendered last time.
 */
export async function resolveReference(
  ref: CloudReference,
  opts: ResolvedReferenceOptions,
  location?: BlockLocation
): Promise<ReferenceOutcome> {
  noticeCspPrerequisite(opts.base);
  const path = cachePath(opts.cacheDir, ref.id);
  const cached = parseCache(await opts.fs.read(path));

  if (opts.offline) {
    if (cached) return fromCache(cached);
    throw new ReferenceBuildError(
      `Cloud reference ${ref.id} has no cached copy and references are set to offline. Run a build with network access once so \`${path}\` exists, and commit it.`,
      ref.id,
      location
    );
  }

  const result = await fetchWithRetry(ref, opts);

  if (result.kind === 'ok') {
    await opts.fs.write(path, serializeCache(result.entry));
    return {
      kind: 'source',
      source: result.entry.source,
      dgmoVersion: result.entry.dgmoVersion,
      updatedAt: result.entry.updatedAt,
      fromCache: false,
    };
  }

  if (result.kind === 'gone') {
    // Deliberately NOT falling back to the cache. See the module comment.
    return {
      kind: 'tombstone',
      warning: `Cloud reference ${ref.id} has been unshared by its author — showing a placeholder instead of the diagram. Remove the reference, or ask them to publish it again.`,
    };
  }

  if (result.kind === 'missing') {
    if (cached) {
      return {
        ...fromCache(cached),
        warning: `Cloud reference ${ref.id} no longer resolves (404) — rendering the last copy from ${path}. It may have been deleted.`,
      };
    }
    throw new ReferenceBuildError(
      `Cloud reference ${ref.id} does not exist, or is not published. Check the id.`,
      ref.id,
      location
    );
  }

  if (cached) {
    return {
      ...fromCache(cached),
      warning: `Cloud reference ${ref.id} could not be fetched (${result.reason}) — rendering the cached copy from ${path}.`,
    };
  }
  throw new ReferenceBuildError(
    `Cloud reference ${ref.id} could not be fetched (${result.reason}) and has no cached copy at ${path}.`,
    ref.id,
    location
  );
}

function fromCache(entry: CachedReference): ReferenceOutcome {
  return {
    kind: 'source',
    source: entry.source,
    dgmoVersion: entry.dgmoVersion,
    updatedAt: entry.updatedAt,
    fromCache: true,
  };
}

/**
 * Resolve many references with at most `concurrency` in flight, one fetch per
 * distinct id however many blocks name it.
 *
 * The dedupe is not an optimisation: a docs site referencing one diagram from
 * forty pages would otherwise arrive at a rate-limited endpoint as forty
 * simultaneous requests, which is indistinguishable from abuse.
 */
export async function resolveReferences(
  refs: Array<{ ref: CloudReference; location?: BlockLocation }>,
  opts: ResolvedReferenceOptions
): Promise<Map<string, ReferenceOutcome | ReferenceBuildError>> {
  const unique = new Map<
    string,
    { ref: CloudReference; location?: BlockLocation }
  >();
  for (const item of refs)
    if (!unique.has(item.ref.id)) unique.set(item.ref.id, item);

  const queue = [...unique.values()];
  const out = new Map<string, ReferenceOutcome | ReferenceBuildError>();

  async function worker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        out.set(
          item.ref.id,
          await resolveReference(item.ref, opts, item.location)
        );
      } catch (err) {
        // Collected rather than thrown: the transformer decides what a failure
        // means for the document as a whole, and one bad reference should not
        // cancel the fetches already in flight for the good ones.
        out.set(
          item.ref.id,
          err instanceof ReferenceBuildError
            ? err
            : new ReferenceBuildError(
                err instanceof Error ? err.message : String(err),
                item.ref.id,
                item.location
              )
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(opts.concurrency, queue.length)) },
      () => worker()
    )
  );
  return out;
}
