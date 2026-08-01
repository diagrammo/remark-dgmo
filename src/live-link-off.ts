/**
 * What a `live-link` fence renders as when live-link resolution is switched OFF.
 *
 * Before the default flip this path did not need to exist: the feature was off
 * everywhere, and a `cloud abc123` fence produced an error block only because
 * the body failed to parse. That was never a decision — it was a side effect.
 * Now that `live-link` is a real chart type, calling a valid fence broken takes
 * deliberate work, and doing so would be the wrong answer anyway.
 *
 * So the off path renders the REFERENCE CARD — the same card the CLI and the
 * desktop app draw, produced by the ordinary render path because `live-link` is
 * an ordinary chart type — wrapped in one affordance:
 *
 *   a hover-revealed link reading "Show this diagram here ↗"
 *
 * 🔴 The affordance belongs HERE and not in dgmo. Only the wrapper knows the
 * feature is off; dgmo's renderer cannot tell a docs site from the desktop app,
 * and a card that always carried a "turn this on" link would be addressed to
 * the wrong person on every other surface.
 *
 * Hover-only is the point. A reader never meets it. Anyone mousing over a
 * diagram-shaped thing on their own docs site is almost certainly its author —
 * so this is the fix for a build warning nobody reads.
 */

import type { CloudReference } from '@diagrammo/dgmo/cloud-reference';

/** Where the affordance points. Written in this change; a button to a 404 is worse than no button. */
export const LIVE_LINK_DOCS_URL = 'https://diagrammo.app/docs/live-links/';

export const LIVE_LINK_AFFORDANCE_TEXT = 'Show this diagram here ↗';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface LiveLinkOffOptions {
  /** Base class, matching the surrounding blocks (default `dgmo`). */
  className?: string;
}

/**
 * Wrap already-rendered card markup with the hover affordance.
 *
 * The precedent is `embed/index.ts`, which already wraps a rendered SVG in HTML
 * carrying a docs anchor — this reuses that convention rather than inventing
 * new chrome.
 */
export function wrapLiveLinkOff(
  cardHtml: string,
  options: LiveLinkOffOptions = {}
): string {
  const base = options.className ?? 'dgmo';
  return (
    `<div class="${escapeAttr(`${base}-live-link-off`)}">` +
    cardHtml +
    `<a class="${escapeAttr(`${base}-live-link-enable`)}" href="${escapeAttr(
      LIVE_LINK_DOCS_URL
    )}" target="_blank" rel="noopener noreferrer">${LIVE_LINK_AFFORDANCE_TEXT}</a>` +
    `</div>`
  );
}

/**
 * The build warning. Names the option and — via the caller's location suffix —
 * the file and line, because a warning naming only an id sends someone grepping
 * through a docs site.
 */
export function liveLinkOffWarning(ref: CloudReference): string {
  return (
    `live-link ${ref.id} was not resolved: live links are switched off ` +
    `(\`liveLink: { enabled: false }\`). The reference card is rendered instead. ` +
    `Remove that option to bake the diagram into the page — see ${LIVE_LINK_DOCS_URL}`
  );
}
