import {
  type ReferenceOptions,
  type ResolvedReferenceOptions,
  resolveReferenceOptions,
} from './reference-resolve.js';

export type { ReferenceOptions } from './reference-resolve.js';

export type Mode = 'diagram' | 'showcase';

export type Theme = 'light' | 'dark' | 'transparent';

/**
 * Framework-agnostic options for `remarkDgmo` / `renderDgmoBlock`.
 *
 * Wrapper packages (`astro-dgmo`, `docusaurus-plugin-dgmo`) re-export this
 * shape under their own conventional names (`DgmoIntegrationOptions`,
 * `DocusaurusDgmoOptions`).
 */
export interface DgmoOptions {
  /**
   * Output mode for `dgmo` fenced blocks.
   * - `diagram` (default): render the SVG only, in a `<figure>`.
   * - `showcase`: render syntax-highlighted source + SVG + copy + open-in-editor.
   *
   * Override per-block via the fence info string: ```dgmo showcase
   */
  mode?: Mode;

  /** Default palette name. Default: `slate`. */
  palette?: string;

  /**
   * Default theme (`light` | `dark` | `transparent`). Default: `dark`.
   *
   * NOTE: under the default `colorMode: 'auto'`, this option is unreachable —
   * dual-render emits both light and dark SVGs regardless. `theme` is consulted
   * only when `colorMode` is explicitly set to `'light'` or `'dark'`.
   */
  theme?: Theme;

  /**
   * Color-mode strategy for emitted SVG(s). Default: `auto`.
   *
   * - `auto` — render every block twice (light + dark palettes) and wrap each
   *   SVG in a `<div class="dgmo-light">` / `<div class="dgmo-dark">` so the
   *   shipped CSS can flip visibility based on the host site's color-mode
   *   signal (`[data-theme="dark"]` by default).
   * - `light` / `dark` — single-render with the matching theme. Halves the
   *   emitted SVG bytes; recommended only for single-mode sites.
   */
  colorMode?: 'auto' | 'light' | 'dark';

  /**
   * Embed background. Default: `auto`.
   *
   * - `auto` — strip the theme's opaque root background so diagrams blend into
   *   the host page surface, except background-meaningful types like `map`
   *   (whose background is the ocean), which stay opaque.
   * - `transparent` / `opaque` — force the choice for every block regardless of
   *   type. Override per-block via the fence info string: ```dgmo opaque
   */
  background?: 'auto' | 'transparent' | 'opaque';

  /**
   * Show source code above the diagram. Defaults to `true` in showcase mode,
   * `false` in diagram mode.
   */
  showSource?: boolean;

  /**
   * Show a copy-to-clipboard button. Defaults to `true` in showcase mode,
   * `false` in diagram mode.
   */
  showCopy?: boolean;

  /**
   * Show the expand (full-screen lightbox) button. Defaults to `true` in
   * showcase mode, `false` in diagram mode. Needs the client script loaded to
   * do anything.
   */
  showExpand?: boolean;

  /**
   * Show an "Open in online editor" link. Defaults to `true` in showcase mode,
   * `false` in diagram mode.
   */
  showOpenInEditor?: boolean;

  /**
   * Base URL for the "Open in editor" link. Default: `https://online.diagrammo.app`.
   * The plugin appends `?dgmo=...` (compressed source) to the base.
   */
  editorBaseUrl?: string;

  /**
   * Wrapper element. Default: `figure`.
   */
  wrapper?: 'figure' | 'div';

  /**
   * Class added to the outer wrapper. Defaults to `dgmo`.
   * Useful as a styling hook.
   */
  className?: string;

  /**
   * Additional class names appended to every emitted wrapper's `class`
   * attribute. Used by `astro-dgmo` v0.3.0 to emit both the new `dgmo-*` class
   * names and the legacy `astro-dgmo-*` ones for one minor cycle of backward
   * compatibility. Default: `[]`.
   */
  legacyClassNames?: string[];

  /**
   * Emit MDX-compatible output. Default: `false` (raw `html` mdast node).
   *
   * When `true`, every replaced ```dgmo block becomes an `mdxJsxFlowElement`
   * (`<div dangerouslySetInnerHTML={{__html: …}} />`) so MDX-format files
   * accept the output. Use this when the host pipeline routes files through
   * `@mdx-js/mdx` — Docusaurus with `markdown.format: 'mdx'`, Astro `.mdx`
   * files, Fumadocs, etc. MDX rejects raw `html` nodes with
   * `Cannot handle unknown node "raw"`; this option is the fix.
   */
  mdx?: boolean;

  /**
   * Resolve live links — a ```dgmo fence whose body is `live-link abc123`,
   * naming a diagram in Diagrammo Cloud instead of carrying its own source.
   *
   * **On by default since the rename.** The old `references` option defaulted
   * to OFF so that non-piloting wrappers changed behaviour by zero bytes. That
   * promise costs more than it protects: a pointer that does not resolve is not
   * a feature someone opted into, it is a broken page. Pre-1.0 the default
   * flips, and turning it off becomes something a site owner chooses.
   *
   * Named for the word people type in the fence. It also resolves a collision:
   * in Cloud a *reference* already means a third-party site embedding a
   * published diagram, and the two senses sat a paragraph apart in this repo.
   *
   * With it OFF, a `live-link` fence renders the reference card — the same card
   * the CLI and the desktop app draw — wrapped in a hover-revealed link to the
   * live diagram, and the build warns naming this option and the source line.
   *
   * See `reference-resolve.ts` for what happens when the fetch goes wrong — that
   * table is the part of this feature worth reading.
   */
  liveLink?: ReferenceOptions;
}

export type ResolvedOptions = Required<
  Omit<
    DgmoOptions,
    | 'showSource'
    | 'showCopy'
    | 'showExpand'
    | 'showOpenInEditor'
    | 'mdx'
    | 'liveLink'
  >
> & {
  showSource: boolean;
  showCopy: boolean;
  showExpand: boolean;
  showOpenInEditor: boolean;
  mdx: boolean;
  liveLink: ResolvedReferenceOptions;
};

/**
 * Apply defaults, including mode-dependent defaults for
 * showSource/showCopy/showExpand/showOpenInEditor.
 */
export function resolveOptions(opts: DgmoOptions = {}): ResolvedOptions {
  const mode: Mode = opts.mode ?? 'diagram';
  const showcase = mode === 'showcase';
  return {
    mode,
    palette: opts.palette ?? 'slate',
    theme: opts.theme ?? 'dark',
    colorMode: opts.colorMode ?? 'auto',
    background: opts.background ?? 'auto',
    showSource: opts.showSource ?? showcase,
    showCopy: opts.showCopy ?? showcase,
    showExpand: opts.showExpand ?? showcase,
    showOpenInEditor: opts.showOpenInEditor ?? showcase,
    editorBaseUrl: opts.editorBaseUrl ?? 'https://online.diagrammo.app',
    wrapper: opts.wrapper ?? 'figure',
    className: opts.className ?? 'dgmo',
    legacyClassNames: opts.legacyClassNames ?? [],
    mdx: opts.mdx ?? false,
    liveLink: resolveReferenceOptions(opts.liveLink),
  };
}
