import {
  renderDgmoBlock as renderStandardBlock,
  type DgmoBlockOptions,
} from '@diagrammo/dgmo/block';
import {
  resolveOptions,
  type DgmoOptions,
  type ResolvedOptions,
} from './options.js';
import { parseFenceMeta } from './fence-meta.js';

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
 * Render a single ```dgmo block to inline HTML. Thin adapter since BL-114:
 * fence-meta parsing and option resolution live here; the canonical markup +
 * render pipeline is `@diagrammo/dgmo/block`'s standard embed block (shared
 * with /auto, `<dgmo-diagram>`, dgmo-mcp reports, the site, and Obsidian).
 *
 * The remark plugin calls this for every matched code node.
 */
export async function renderDgmoBlock(
  source: string,
  meta: string | null | undefined,
  integrationOptions: DgmoOptions = {},
  location?: BlockLocation,
  /**
   * Markup extras the caller controls. Today this carries the cloud-reference
   * markers (story 10.4) — passed through as block options rather than patched
   * onto the emitted HTML, because a wrapper editing rendered markup by regex is
   * how a rendering pipeline starts having two of them.
   */
  extra: { dataAttributes?: Record<string, string> } = {}
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
    background: block.background ?? base.background,
    showSource: block.showSource ?? (block.mode ? showcase : base.showSource),
    showCopy: block.showCopy ?? (block.mode ? showcase : base.showCopy),
    showExpand: block.showExpand ?? (block.mode ? showcase : base.showExpand),
    showOpenInEditor:
      block.showOpenInEditor ?? (block.mode ? showcase : base.showOpenInEditor),
  };

  const blockOptions: DgmoBlockOptions = {
    mode: opts.mode,
    palette: opts.palette,
    colorMode: opts.colorMode,
    background: opts.background,
    showSource: opts.showSource,
    showCopy: opts.showCopy,
    showExpand: opts.showExpand,
    showOpenInEditor: opts.showOpenInEditor,
    editorBaseUrl: opts.editorBaseUrl,
    wrapper: opts.wrapper,
    className: opts.className,
    legacyClassNames: opts.legacyClassNames,
    onWarn: (message) => {
      console.warn(`[remark-dgmo] ${message}${locationSuffix(location)}`);
    },
  };
  if (block.title !== undefined) blockOptions.title = block.title;
  if (extra.dataAttributes) {
    blockOptions.dataAttributes = {
      ...extra.dataAttributes,
      // A cloud-referenced block also carries the options it was baked with, so
      // a client refresh re-renders the diagram that is on the page rather than
      // reverting to defaults. A diagram that silently changes palette when it
      // refreshes reads as a bug, not as freshness.
      //
      // Written HERE because this is where per-block fence meta has already
      // been folded into the integration's options — the effective values exist
      // nowhere else, and reconstructing them in the caller would be a second
      // copy of the merge above.
      ...(extra.dataAttributes['dgmo-ref']
        ? {
            'dgmo-ref-opts': JSON.stringify({
              mode: opts.mode,
              palette: opts.palette,
              colorMode: opts.colorMode,
              background: opts.background,
              showSource: opts.showSource,
              showCopy: opts.showCopy,
              showExpand: opts.showExpand,
              showOpenInEditor: opts.showOpenInEditor,
              className: opts.className,
              wrapper: opts.wrapper,
            }),
          }
        : {}),
    };
  }

  return renderStandardBlock(source, blockOptions);
}

function locationSuffix(location: BlockLocation | undefined): string {
  if (!location) return '';
  if (location.path && location.line)
    return ` at ${location.path}:${location.line}`;
  if (location.line) return ` at line ${location.line}`;
  return '';
}
