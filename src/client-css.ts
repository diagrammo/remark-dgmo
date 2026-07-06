// Build-time helper for host integrations (Fumadocs, Nextra, VitePress, and
// the marketing site) that theme via a CLASS on <html> — next-themes
// `attribute="class"`, VitePress's `.dark`, or a bespoke class toggle — rather
// than the `[data-theme="dark"]` attribute that remark-dgmo's shipped
// `client.css` keys on. Each integration's build step reads `client.css`,
// rewrites the dark selector, and emits an adapted stylesheet it can import.
//
// Kept as its own dependency-free entry so a build script can pull just this
// string transform without loading the remark plugin (and, transitively, the
// dgmo render pipeline).

/** The dark-mode selector remark-dgmo's `client.css` keys its rules on. */
export const CLIENT_CSS_DARK_SELECTOR = '[data-theme="dark"]';

/**
 * Rewrite every `[data-theme="dark"]` selector in remark-dgmo's `client.css`
 * to a class-toggle selector, for hosts that flip a class on `<html>` instead
 * of the `data-theme` attribute. Pure string transform — literal replace, not
 * regex (the bracket/quote characters would otherwise need escaping, and the
 * substring is unambiguous in `client.css`).
 *
 * @param source        the raw `client.css` contents
 * @param toggleSelector the class selector to key dark rules on (default `html.dark`)
 */
export function adaptClientCssToClassToggle(
  source: string,
  toggleSelector = 'html.dark'
): string {
  return source.split(CLIENT_CSS_DARK_SELECTOR).join(toggleSelector);
}
