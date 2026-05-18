import {
  render,
  encodeDiagramUrl,
  palettes,
  type PaletteConfig,
} from '@diagrammo/dgmo';
import { highlightDgmo, NORD_ROLE_STYLES } from '@diagrammo/dgmo/highlight';
import {
  resolveOptions,
  type DgmoOptions,
  type ResolvedOptions,
  type Theme,
} from './options.js';
import { parseFenceMeta } from './fence-meta.js';
import { normalizeSvg } from './svg-normalize.js';
import { escapeHtml, escapeAttr } from './escape.js';

export interface RenderBlockResult {
  html: string;
  diagnostics: Array<{ message: string; line?: number; severity?: string }>;
}

/**
 * Optional source-location hint, passed through from the remark transformer so
 * palette-fallback warnings can point at the offending block.
 */
export interface BlockLocation {
  path?: string;
  line?: number;
}

/**
 * Render a single ```dgmo block to inline HTML. Pure function: takes source +
 * options and returns the HTML string and any diagnostics from the parser.
 *
 * The remark plugin calls this for every matched code node.
 */
export async function renderDgmoBlock(
  source: string,
  meta: string | null | undefined,
  integrationOptions: DgmoOptions = {},
  location?: BlockLocation
): Promise<RenderBlockResult> {
  const block = parseFenceMeta(meta);
  const base = resolveOptions(integrationOptions);
  const effectiveMode = block.mode ?? base.mode;
  const showcase = effectiveMode === 'showcase';
  const opts: ResolvedOptions = {
    ...base,
    mode: effectiveMode,
    palette: block.palette ?? base.palette,
    theme: block.theme ?? base.theme,
    colorMode: block.colorMode ?? base.colorMode,
    showSource: block.showSource ?? (block.mode ? showcase : base.showSource),
    showCopy: block.showCopy ?? (block.mode ? showcase : base.showCopy),
    showOpenInEditor:
      block.showOpenInEditor ?? (block.mode ? showcase : base.showOpenInEditor),
  };

  const trimmed = source.trim();
  const palette = resolvePaletteWithWarning(opts.palette, location);

  // collect diagnostics from however many render passes we end up doing
  const allDiagnostics: RenderBlockResult['diagnostics'] = [];

  if (opts.colorMode === 'auto') {
    const [lightSvgRaw, darkSvgRaw] = await Promise.all([
      renderForTheme(trimmed, palette, 'light', opts.palette, location),
      renderForTheme(trimmed, palette, 'dark', opts.palette, location),
    ]);
    allDiagnostics.push(...lightSvgRaw.diagnostics, ...darkSvgRaw.diagnostics);

    const lightSvg = normalizeSvg(lightSvgRaw.svg);
    const darkSvg = normalizeSvg(darkSvgRaw.svg);

    let editorUrl: string | undefined;
    if (opts.showOpenInEditor) {
      const url = encodeDiagramUrl(trimmed, { baseUrl: opts.editorBaseUrl });
      editorUrl = url ?? opts.editorBaseUrl;
    }

    const html =
      opts.mode === 'showcase'
        ? renderShowcaseDual(
            trimmed,
            lightSvg,
            darkSvg,
            editorUrl,
            opts,
            block.title
          )
        : renderSimpleDual(lightSvg, darkSvg, opts, block.title);

    return { html, diagnostics: allDiagnostics };
  }

  // Single-render path. colorMode is narrowed to 'light' | 'dark' here since
  // 'auto' is handled above. The dgmo render() also accepts 'transparent', but
  // we don't surface that via colorMode — it's reachable via `theme`.
  const themeForRender: Theme = opts.colorMode === 'light' ? 'light' : 'dark';
  const { svg: rawSvg, diagnostics } = await render(trimmed, {
    palette,
    theme: themeForRender,
  });
  allDiagnostics.push(...diagnostics);
  const svg = normalizeSvg(rawSvg);

  let editorUrl: string | undefined;
  if (opts.showOpenInEditor) {
    const url = encodeDiagramUrl(trimmed, { baseUrl: opts.editorBaseUrl });
    editorUrl = url ?? opts.editorBaseUrl;
  }

  const html =
    opts.mode === 'showcase'
      ? renderShowcase(trimmed, svg, editorUrl, opts, block.title)
      : renderSimple(svg, opts, block.title);

  return { html, diagnostics: allDiagnostics };
}

function locationSuffix(location: BlockLocation | undefined): string {
  if (!location) return '';
  if (location.path && location.line)
    return ` at ${location.path}:${location.line}`;
  if (location.line) return ` at line ${location.line}`;
  return '';
}

function resolvePaletteWithWarning(
  name: string,
  location: BlockLocation | undefined
): PaletteConfig {
  const found = Object.values(palettes).find((p) => p.id === name);
  if (!found) {
    // eslint-disable-next-line no-console
    console.warn(
      `[remark-dgmo] palette "${name}" not registered, falling back to "nord"${locationSuffix(location)}`
    );
    return palettes.nord;
  }
  return found;
}

/**
 * Render one theme. If `colorMode: 'auto'` is requested but the palette is
 * missing the requested mode, fall back to nord's mode and emit a warning.
 *
 * Today this is defensive: dgmo's palette registry validates both modes at
 * registration time, so every registered palette has both pairs by
 * construction. User-supplied palettes via `registerPalette()` that slip past
 * validation would hit this path; tests exercise it via mocking.
 */
async function renderForTheme(
  source: string,
  palette: PaletteConfig,
  theme: 'light' | 'dark',
  requestedName: string,
  location: BlockLocation | undefined
): Promise<{ svg: string; diagnostics: RenderBlockResult['diagnostics'] }> {
  if (!palette[theme]) {
    // eslint-disable-next-line no-console
    console.warn(
      `[remark-dgmo] palette "${requestedName}" has no ${theme} mode; using nord ${theme} for the missing pair${locationSuffix(location)}`
    );
    // Build a synthetic palette where the missing mode is borrowed from nord.
    const filled: PaletteConfig = {
      ...palette,
      [theme]: palettes.nord[theme],
    } as PaletteConfig;
    return render(source, { palette: filled, theme });
  }
  return render(source, { palette, theme });
}

function buildWrapperClasses(
  resolved: Pick<ResolvedOptions, 'className' | 'legacyClassNames'>,
  variant: 'diagram' | 'showcase' | 'error'
): string {
  const base = `${resolved.className} ${resolved.className}--${variant}`;
  const legacy = resolved.legacyClassNames.join(' ');
  return legacy ? `${base} ${legacy}` : base;
}

function buildInnerClasses(
  resolved: Pick<ResolvedOptions, 'legacyClassNames'>,
  primary: string
): string {
  const legacy = resolved.legacyClassNames.join(' ');
  return legacy ? `${primary} ${legacy}` : primary;
}

function renderSimple(
  svg: string,
  opts: ResolvedOptions,
  title?: string
): string {
  const Wrapper = opts.wrapper;
  const wrapperClass = buildWrapperClasses(opts, 'diagram');
  const captionHtml = title
    ? `<figcaption class="dgmo-caption">${escapeHtml(title)}</figcaption>`
    : '';
  const captionFallback =
    title && Wrapper !== 'figure'
      ? `<div class="dgmo-caption">${escapeHtml(title)}</div>`
      : '';
  return (
    `<${Wrapper} class="${escapeAttr(wrapperClass)}">` +
    (Wrapper === 'figure' ? captionHtml : captionFallback) +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-svg'))}">${svg}</div>` +
    `</${Wrapper}>`
  );
}

function renderSimpleDual(
  lightSvg: string,
  darkSvg: string,
  opts: ResolvedOptions,
  title?: string
): string {
  const Wrapper = opts.wrapper;
  const wrapperClass = buildWrapperClasses(opts, 'diagram');
  const captionHtml = title
    ? `<figcaption class="dgmo-caption">${escapeHtml(title)}</figcaption>`
    : '';
  const captionFallback =
    title && Wrapper !== 'figure'
      ? `<div class="dgmo-caption">${escapeHtml(title)}</div>`
      : '';
  return (
    `<${Wrapper} class="${escapeAttr(wrapperClass)}">` +
    (Wrapper === 'figure' ? captionHtml : captionFallback) +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-light'))}">${lightSvg}</div>` +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-dark'))}">${darkSvg}</div>` +
    `</${Wrapper}>`
  );
}

function renderShowcase(
  source: string,
  svg: string,
  editorUrl: string | undefined,
  opts: ResolvedOptions,
  title?: string
): string {
  const Wrapper = opts.wrapper;
  const wrapperClass = buildWrapperClasses(opts, 'showcase');
  const cardClass = buildInnerClasses(opts, 'dgmo-card');

  const captionHtml = title
    ? Wrapper === 'figure'
      ? `<figcaption class="dgmo-caption">${escapeHtml(title)}</figcaption>`
      : `<div class="dgmo-caption">${escapeHtml(title)}</div>`
    : '';

  return (
    `<${Wrapper} class="${escapeAttr(wrapperClass)}">` +
    captionHtml +
    `<div class="${escapeAttr(cardClass)}">` +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-svg'))}">${svg}</div>` +
    renderSourceDisclosure(source, editorUrl, opts) +
    `</div>` +
    `</${Wrapper}>`
  );
}

function renderShowcaseDual(
  source: string,
  lightSvg: string,
  darkSvg: string,
  editorUrl: string | undefined,
  opts: ResolvedOptions,
  title?: string
): string {
  const Wrapper = opts.wrapper;
  const wrapperClass = buildWrapperClasses(opts, 'showcase');
  const cardClass = buildInnerClasses(opts, 'dgmo-card');

  const captionHtml = title
    ? Wrapper === 'figure'
      ? `<figcaption class="dgmo-caption">${escapeHtml(title)}</figcaption>`
      : `<div class="dgmo-caption">${escapeHtml(title)}</div>`
    : '';

  return (
    `<${Wrapper} class="${escapeAttr(wrapperClass)}">` +
    captionHtml +
    `<div class="${escapeAttr(cardClass)}">` +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-light'))}">${lightSvg}</div>` +
    `<div class="${escapeAttr(buildInnerClasses(opts, 'dgmo-dark'))}">${darkSvg}</div>` +
    renderSourceDisclosure(source, editorUrl, opts) +
    `</div>` +
    `</${Wrapper}>`
  );
}

/**
 * Source listing wrapped in a native <details>/<summary> disclosure, collapsed
 * by default. The summary doubles as the toolbar row (label + chevron + copy /
 * open-in-editor buttons). Clicks on the toolbar buttons are stopped from
 * propagating to the summary in `client.ts`, so they don't also toggle the
 * disclosure.
 *
 * Returns '' when `showSource` is false (matches the prior noSource behavior).
 */
function renderSourceDisclosure(
  source: string,
  editorUrl: string | undefined,
  opts: ResolvedOptions
): string {
  if (!opts.showSource) return '';

  const sourceHtml = renderSource(source);

  const openButton =
    opts.showOpenInEditor && editorUrl
      ? `<a href="${escapeAttr(editorUrl)}" target="_blank" rel="noopener noreferrer" class="dgmo-toolbar-btn dgmo-open" aria-label="Open in online editor" title="Open in online editor">
         <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M9.5 2.5h4v4"/>
           <path d="M13.5 2.5 7 9"/>
           <path d="M12.5 9.5v3a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3"/>
         </svg>
       </a>`
      : '';

  const copyButton = opts.showCopy
    ? `<button type="button" class="dgmo-toolbar-btn dgmo-copy" aria-label="Copy to clipboard" title="Copy to clipboard" data-dgmo-source="${escapeAttr(source)}">
         <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/>
           <path d="M10.5 5.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h2.5"/>
         </svg>
       </button>`
    : '';

  const toolbarActions =
    openButton || copyButton
      ? `<div class="dgmo-toolbar-actions">${openButton}${copyButton}</div>`
      : '';

  const chevron = `<svg class="dgmo-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>`;

  return (
    `<details class="dgmo-source-wrap">` +
    `<summary class="dgmo-toolbar"><span class="dgmo-toolbar-label">${chevron}<span>source</span></span>${toolbarActions}</summary>` +
    `<div class="dgmo-source-inner">${sourceHtml}</div>` +
    `</details>`
  );
}

function renderSource(source: string): string {
  const tokens = highlightDgmo(source);
  const inner = tokens
    .map((t) => {
      const styles = NORD_ROLE_STYLES[t.role];
      const text = escapeHtml(t.text);
      if (!styles || Object.keys(styles).length === 0) return text;
      const styleStr = Object.entries(styles)
        .map(
          ([k, v]) =>
            `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`
        )
        .join(';');
      return `<span style="${escapeAttr(styleStr)}">${text}</span>`;
    })
    .join('');
  // NOTE: We deliberately use <pre><span> rather than <pre><code> here. Astro's
  // Shiki rehype plugin (and Docusaurus's MDX pipeline) walk the hast and
  // post-process any <pre><code> pair (even ones we emit from a remark plugin
  // via raw HTML), which clobbers our pre-rendered highlight spans with a
  // plaintext listing. Using a <span> as the inner element bypasses the
  // matcher while preserving preformatted-text semantics on the outer <pre>.
  return `<pre class="dgmo-pre"><span class="dgmo-code">${inner}</span></pre>`;
}
