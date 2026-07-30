// ============================================================
// remark-dgmo — Public API
// ============================================================
//
// Framework-agnostic remark plugin for rendering DGMO fenced code blocks at
// build time. Used by astro-dgmo, docusaurus-plugin-dgmo, and any direct
// unified pipeline consumer.

export { default, default as remarkDgmo } from './remark-plugin.js';
export type { RemarkDgmoOptions } from './remark-plugin.js';

export { renderDgmoBlock } from './render-block.js';
export type { RenderBlockResult, BlockLocation } from './render-block.js';

export { parseFenceMeta } from './fence-meta.js';
export type { BlockOptions } from './fence-meta.js';

export { normalizeSvg } from './svg-normalize.js';

export { resolveOptions } from './options.js';
export type {
  Mode,
  Theme,
  DgmoOptions,
  ReferenceOptions,
  ResolvedOptions,
} from './options.js';

// Cloud references (story 10.4). The build-time half; the client half ships in
// `remark-dgmo/client.js` and needs no wiring.
export {
  cachePath,
  DEFAULT_CACHE_DIR,
  ReferenceBuildError,
  resetCspNotice,
  resolveReference,
  resolveReferences,
} from './reference-resolve.js';
export type {
  CachedReference,
  ReferenceCacheFs,
  ReferenceOutcome,
} from './reference-resolve.js';
export { TOMBSTONE_TEXT, tombstoneCardHtml } from './tombstone-card.js';

export {
  adaptClientCssToClassToggle,
  CLIENT_CSS_DARK_SELECTOR,
} from './client-css.js';
