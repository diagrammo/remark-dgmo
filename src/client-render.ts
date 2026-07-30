/**
 * Cloud references — the OPT-IN renderer (Diagrammo Cloud story 10.4).
 *
 * Load this alongside `remark-dgmo/client.js` if you want a referenced diagram
 * that has changed since your last build to be **re-rendered in the reader's
 * browser** rather than merely flagged as updated.
 *
 * ```js
 * import 'remark-dgmo/client.js';
 * import 'remark-dgmo/client-render.js'; // opt in to the swap
 * ```
 *
 * ## Why it is a separate file
 *
 * Because the cost is real and it lands on the adopter. Measured on
 * `astro-dgmo`'s fixture (2026-07-30): with this one dynamic import living in
 * the base client, the built site went from **1 chunk / 7,990 gzipped bytes to
 * 90 chunks / 634,199**. Bundlers resolve a static-analyzable dynamic import at
 * BUILD time — "lazy" says when the reader downloads it, not whether the site
 * ships it. Keeping the renderer in a module nobody imports by default is the
 * only way a bundler can decline to follow it.
 *
 * ## Why it imports nothing, not even from this package
 *
 * Hosts INLINE both files into one script scope (Astro's `injectScript`
 * concatenates them), so anything this module pulled in would be declared twice
 * and the build would fail with `Identifier … has already been declared`. The
 * handshake is therefore a global plus an event, both deliberately named, and
 * the whole file is wrapped so it declares nothing at the top level.
 */

(() => {
  const g = globalThis as {
    __dgmoReferenceRenderer?: () => Promise<unknown>;
    dispatchEvent?: (event: Event) => boolean;
  };

  g.__dgmoReferenceRenderer = () => import('@diagrammo/dgmo/block');

  // The base client has almost certainly already made its pass and found no
  // renderer. Tell it to look again, so a diagram that moved is swapped on this
  // load rather than the next one.
  if (typeof Event === 'function' && typeof g.dispatchEvent === 'function') {
    g.dispatchEvent(new Event('dgmo:renderer-ready'));
  }
})();
