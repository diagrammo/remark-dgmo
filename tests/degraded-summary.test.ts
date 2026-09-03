/**
 * The one line at the end of a build (#651).
 *
 * 🔴 The warning this summarises was never missing. Every degraded live link
 * already prints its own `console.warn` naming the diagram, the cause, the
 * remedy and the file and line. What it could not do is survive scrollback: on
 * a real site it lands ~100 lines before the end of ~200 lines of build
 * output, and a blog post argued for live links over a placeholder card for
 * three weeks with nobody noticing. The issue asked for a warning to be built;
 * the warning existed, and this is the part that did not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'mdast';

import remarkDgmo from '../src/remark-plugin.js';
import {
  degradedSummaryLine,
  noteDegradedLiveLink,
  resetDegradedSummary,
} from '../src/degraded-summary.js';
import {
  serializeCache,
  type ReferenceCacheFs,
} from '../src/reference-resolve.js';

beforeEach(() => {
  resetDegradedSummary();
});

describe('degradedSummaryLine', () => {
  // 🔴 Null, not "0 live links are degraded". This is the answer on every
  // healthy build, and a plugin that prints a line per build saying nothing
  // happened is a line every consumer learns to skip — which is exactly the
  // failure being fixed, rebuilt one level up.
  it('says nothing at all when nothing is degraded', () => {
    expect(degradedSummaryLine()).toBeNull();
  });

  it('names a placeholder and what it is showing instead', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    const line = degradedSummaryLine();
    expect(line).toContain('1 live link showing');
    expect(line).toContain('placeholder');
    expect(line).toContain('dgm_a');
  });

  // ⚠️ Two kinds because they ask different things of the reader: a
  // placeholder is somebody else's deliberate act and the page shows no
  // diagram at all, while a stale copy is a real diagram that may just be
  // behind. Collapsing them would make the urgent one look routine.
  it('keeps a stale copy separate from a placeholder', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    noteDegradedLiveLink('stale', 'dgm_b');
    const line = degradedSummaryLine() ?? '';
    expect(line).toContain('placeholder');
    expect(line).toContain('committed copy');
    expect(line).toContain('dgm_a');
    expect(line).toContain('dgm_b');
  });

  // One reference can render more than once in a build — the same fence on a
  // paginated route, a component reused across pages. A count would report a
  // bigger number than there are things to go and look at.
  it('counts a reference once however often it is rendered', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    noteDegradedLiveLink('placeholder', 'dgm_a');
    noteDegradedLiveLink('placeholder', 'dgm_a');
    expect(degradedSummaryLine()).toContain('1 live link showing');
  });

  it('agrees with itself about number', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    expect(degradedSummaryLine()).toContain('its diagram');
    noteDegradedLiveLink('placeholder', 'dgm_b');
    const line = degradedSummaryLine() ?? '';
    expect(line).toContain('2 live links showing');
    expect(line).toContain('their diagrams');
  });

  // Naming them is what makes the line actionable without scrolling; naming
  // forty would make it the noise the detailed warnings already are.
  it('names three, then counts the rest', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      noteDegradedLiveLink('placeholder', `dgm_${id}`);
    }
    const line = degradedSummaryLine() ?? '';
    expect(line).toContain('dgm_a, dgm_b, dgm_c, +2 more');
    expect(line).not.toContain('dgm_d');
  });

  it('points at the detail rather than repeating it', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    expect(degradedSummaryLine()).toContain('further up this log');
  });
});

// 🔴 The tally lives on `globalThis` under a well-known symbol, not in module
// scope, because `vi.resetModules()` hands every re-imported module a fresh
// copy of its state — the recorder would write to one object and the reader
// would read another. It fails in the worst direction, since the tests that
// reset modules are exactly the ones exercising process-level state.
describe('the tally survives a module reset', () => {
  it('is still readable after the modules are thrown away', async () => {
    noteDegradedLiveLink('placeholder', 'dgm_survivor');
    vi.resetModules();
    const fresh = await import('../src/degraded-summary.js');
    expect(fresh.degradedSummaryLine()).toContain('dgm_survivor');
  });
});

describe('what the plugin records', () => {
  const ID = 'dgm_01HQ3';

  function tree(value: string): Root {
    return {
      type: 'root',
      children: [{ type: 'code', lang: 'dgmo', meta: null, value }],
    } as Root;
  }

  function memFs(seed: Record<string, string> = {}): ReferenceCacheFs {
    const files = new Map(Object.entries(seed));
    return {
      read: async (p: string) => files.get(p) ?? null,
      write: async (p: string, v: string) => void files.set(p, v),
    };
  }

  const cache = serializeCache({
    id: ID,
    source: 'piechart Old\n  A 1',
    dgmoVersion: '0.56.0',
    updatedAt: 1,
    fetchedAt: 1,
  });

  it('records a withdrawn diagram as a placeholder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await remarkDgmo({
      colorMode: 'light',
      liveLink: {
        enabled: true,
        fetchImpl: vi.fn(() =>
          Promise.resolve(new Response('{}', { status: 410 }))
        ) as unknown as typeof fetch,
        fs: memFs({ [`.dgmo/references/${ID}.json`]: cache }),
      },
    })(tree(`live-link ${ID}`));

    const line = degradedSummaryLine() ?? '';
    expect(line).toContain('placeholder');
    expect(line).toContain(ID);
    warn.mockRestore();
  });

  // The common case, and the one that must stay silent: a live link that
  // resolved is not something to go and look at.
  it('records nothing for a reference that resolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await remarkDgmo({
      colorMode: 'light',
      liveLink: {
        enabled: true,
        fetchImpl: vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                source: 'piechart New\n  A 1',
                updatedAt: 2,
                dgmoVersion: '0.56.0',
              }),
              { status: 200 }
            )
          )
        ) as unknown as typeof fetch,
        fs: memFs(),
      },
    })(tree(`live-link ${ID}`));

    expect(degradedSummaryLine()).toBeNull();
    warn.mockRestore();
  });
});

// 🔴 The bug the unit tests missed and the real build caught: the sentence
// says "This build finished with…", so a fragment carrying its own verb came
// out as "finished with 1 live link IS showing a placeholder". Asserting the
// whole line rather than a fragment is what makes that visible here.
describe('the whole sentence reads', () => {
  it('never puts a verb inside the count', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    expect(degradedSummaryLine()).toBe(
      '[remark-dgmo] This build finished with 1 live link showing a placeholder instead of its diagram (dgm_a). Each one is described in full further up this log.'
    );
  });

  it('reads correctly with both kinds and a plural', () => {
    noteDegradedLiveLink('placeholder', 'dgm_a');
    noteDegradedLiveLink('placeholder', 'dgm_b');
    noteDegradedLiveLink('stale', 'dgm_c');
    expect(degradedSummaryLine()).toBe(
      '[remark-dgmo] This build finished with 2 live links showing a placeholder instead of their diagrams (dgm_a, dgm_b), and 1 live link showing a committed copy rather than the current diagram (dgm_c). Each one is described in full further up this log.'
    );
  });
});
