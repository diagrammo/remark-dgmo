/**
 * The tombstone card — what a withdrawn cloud reference renders as.
 *
 * Not an error card. Nothing went wrong here: an author unshared a diagram they
 * had shared, which is a thing they are allowed to do, and the document that
 * referenced it is now simply pointing at something that is no longer public.
 * Rendering our cached copy instead would mean publishing content somebody took
 * back, so this card is what stands in its place.
 *
 * 🔴 It carries NO identifying content — no title, no space, no author, no
 * thumbnail. That is a requirement, not a style choice (Cloud story 7.13 T5):
 * once the response carries nothing sensitive there is nothing to opt out of,
 * which is what keeps a per-diagram privacy setting out of the product. The copy
 * matches the API's own `TOMBSTONE_DETAIL`, deliberately — a reader who follows
 * the link should not be told two different stories.
 */

/** The whole of it. Do not add attribution here without reading 7.13 first. */
export const TOMBSTONE_TEXT = 'This diagram is no longer shared.';

/**
 * Local, four-line attribute escape rather than an import from dgmo's block
 * entry, which does not export one. The values here are all ours (class names
 * from options), but they are host-supplied strings landing in markup, and the
 * one place that rule gets relaxed is the place it eventually bites.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface TombstoneCardOptions {
  /** Base class, matching the surrounding blocks (default `dgmo`). */
  className?: string;
  wrapper?: 'figure' | 'div';
  /** Extra classes, for wrappers still emitting legacy names. */
  legacyClassNames?: string[];
}

export function tombstoneCardHtml(options: TombstoneCardOptions = {}): string {
  const base = options.className ?? 'dgmo';
  const wrapper = options.wrapper ?? 'figure';
  const classes = [
    base,
    `${base}--tombstone`,
    ...(options.legacyClassNames ?? []),
  ].join(' ');
  return (
    `<${wrapper} class="${escapeAttr(classes)}" role="note">` +
    `<p class="${escapeAttr(base)}-tombstone-text">${TOMBSTONE_TEXT}</p>` +
    `</${wrapper}>`
  );
}
