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
export type { Mode, Theme, DgmoOptions, ResolvedOptions } from './options.js';
