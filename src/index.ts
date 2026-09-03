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

// `renderDgmoBlock` renders a fence body as diagram SOURCE. `renderDgmoFence`
// is the one to call when the body might instead be a live link — it classifies,
// fetches and renders. Hosts with a document-wide batch phase (the remark plugin)
// use `classifyFence` + `renderClassifiedFence` to fetch each distinct id once;
// hosts without one (`vitepress-dgmo`) call `renderDgmoFence` per fence.
export {
  classifyFence,
  renderClassifiedFence,
  renderDgmoFence,
} from './render-fence.js';
export type { ClassifiedFence } from './render-fence.js';

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
export {
  type DegradedKind,
  degradedSummaryLine,
  noteDegradedLiveLink,
  resetDegradedSummary,
} from './degraded-summary.js';
export { TOMBSTONE_TEXT, tombstoneCardHtml } from './tombstone-card.js';
export {
  LIVE_LINK_AFFORDANCE_TEXT,
  LIVE_LINK_DOCS_URL,
  liveLinkOffWarning,
  wrapLiveLinkOff,
} from './live-link-off.js';

export {
  adaptClientCssToClassToggle,
  CLIENT_CSS_DARK_SELECTOR,
} from './client-css.js';
