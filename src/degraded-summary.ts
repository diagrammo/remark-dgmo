/**
 * One line at the END of a build, saying that a live link is not showing what
 * it names (#651).
 *
 * ## The warning was never missing — it was in the middle
 *
 * Every degraded live link already prints its own `console.warn` from
 * `render-fence.ts`, naming the diagram, the cause, the remedy and the file
 * and line. That is the right message in the right place and none of it
 * changes here.
 *
 * What it cannot do is survive scrollback. On the marketing site it lands
 * about a hundred lines before the end of roughly two hundred lines of build
 * output, and a blog post argued for live links over a placeholder card for
 * three weeks with nobody noticing — the build having said so, once, in the
 * middle (#651). The issue that came out of that asked for a warning to be
 * built; the warning existed. This is the part that was actually missing.
 *
 * 🔴 **It reports, it never fails.** A tombstone is the CORRECT render for a
 * diagram somebody took back, and a stale copy is the correct render for a
 * server that did not answer — failing a build on either would make our
 * availability their problem, which is the one thing this integration exists
 * not to do. The failure table in `reference-resolve.ts` is unchanged.
 *
 * ## Why the tally is on `globalThis`
 *
 * 🔴 Module scope is silently duplicated by `vi.resetModules()`, which hands
 * every re-imported module a fresh copy of its state. A tally in module scope
 * would be written by one copy and read by another — and it fails in the worst
 * direction, because the tests that reset modules are exactly the ones
 * exercising process-level state. A well-known symbol key is shared by every
 * copy, so the recorder and the reader are always the same object.
 */

interface Tally {
  /** Ids showing the tombstone card — the author withdrew the diagram. */
  placeholder: Set<string>;
  /** Ids showing a committed copy because the fetch did not succeed. */
  stale: Set<string>;
  /** Whether the exit hook is already registered; see `armExitNotice`. */
  armed: boolean;
}

const KEY = Symbol.for('remark-dgmo.degradedLiveLinks');

function tally(): Tally {
  const holder = globalThis as unknown as Record<symbol, Tally | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;
  const fresh: Tally = {
    placeholder: new Set(),
    stale: new Set(),
    armed: false,
  };
  holder[KEY] = fresh;
  return fresh;
}

/**
 * How a live link is falling short of what it names.
 *
 * ⚠️ Two kinds, because they want different things from the reader.
 * `placeholder` is somebody else's deliberate act and the page is showing no
 * diagram at all — it needs a decision. `stale` means the page is showing a
 * real diagram that may simply be behind, and it usually needs nothing.
 */
export type DegradedKind = 'placeholder' | 'stale';

/**
 * Record one degraded live link, and make sure the summary will be printed.
 *
 * Ids rather than a counter: one reference can be rendered more than once in a
 * build — the same fence on a paginated route, a component reused across
 * pages — and a count would report a number bigger than the number of things
 * to go and look at.
 */
export function noteDegradedLiveLink(kind: DegradedKind, id: string): void {
  const t = tally();
  t[kind].add(id);
  armExitNotice(t);
}

/**
 * The summary, or null when nothing is degraded — which is the common case and
 * must print nothing at all rather than "0 live links are degraded".
 *
 * Exported so it can be tested without an exiting process, which is the only
 * other way to observe it.
 */
export function degradedSummaryLine(): string | null {
  const t = tally();
  const parts: string[] = [];
  if (t.placeholder.size > 0) {
    parts.push(
      `${count(t.placeholder.size, 'live link')} showing a placeholder instead of ${t.placeholder.size === 1 ? 'its diagram' : 'their diagrams'} (${list(t.placeholder)})`
    );
  }
  if (t.stale.size > 0) {
    parts.push(
      `${count(t.stale.size, 'live link')} showing a committed copy rather than the current diagram (${list(t.stale)})`
    );
  }
  if (parts.length === 0) return null;
  // "This build finished" rather than "Warning:" — nothing here failed, and
  // the line is the last thing printed precisely so it reads as a state of the
  // finished build rather than as an event during it.
  return `[remark-dgmo] This build finished with ${parts.join(', and ')}. Each one is described in full further up this log.`;
}

/**
 * `1 live link` / `3 live links` — a noun phrase with NO verb.
 *
 * ⚠️ It carried "is"/"are" in the first version and the sentence around it
 * reads "This build finished with…", so the line came out as *"finished with 1
 * live link is showing a placeholder"*. Caught by reading the real build
 * output rather than the unit tests, which asserted the fragment they had been
 * given. The sentence owns the verb; this owns the count.
 */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Up to three ids, then a count. Naming them is what makes the line
 * actionable without scrolling; naming forty would make it the noise the
 * detailed warnings already are.
 */
function list(ids: ReadonlySet<string>): string {
  const all = [...ids];
  const shown = all.slice(0, 3);
  const rest = all.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ');
}

/**
 * Print the summary when the process ends, once.
 *
 * 🔴 `process.on('exit')` rather than anything the plugin could call itself: a
 * remark plugin is handed one file at a time and is never told the build is
 * over, so there is no other moment that is reliably LAST — and last is the
 * whole requirement. The handler is synchronous, which `exit` requires.
 *
 * ⚠️ Registered lazily, only once something has actually degraded. A plugin
 * that attaches a process listener on every build whether or not it has
 * anything to say is a plugin that leaks a listener into every consumer's
 * process for nothing, and Node warns about eleven of them.
 *
 * Guarded for the browser: this module is reachable from the client bundle
 * through the package index, where `process` does not exist.
 */
function armExitNotice(t: Tally): void {
  if (t.armed) return;
  const proc = (globalThis as { process?: NodeJS.Process }).process;
  if (typeof proc?.on !== 'function') return;
  t.armed = true;
  proc.on('exit', () => {
    const line = degradedSummaryLine();
    if (line) console.warn(line);
  });
}

/** Test seam: forget everything recorded this process. */
export function resetDegradedSummary(): void {
  const holder = globalThis as unknown as Record<symbol, Tally | undefined>;
  holder[KEY] = undefined;
}
