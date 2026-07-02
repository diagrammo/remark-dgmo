/**
 * Normalize an SVG produced by `@diagrammo/dgmo` for inline embedding:
 *
 * - Compute a tight content bounding box and set the root `viewBox` to
 *   bbox+padding so the diagram's aspect ratio matches its CONTENT.
 * - Ensure the root `<svg>` has a `viewBox` so it scales responsively.
 * - Strip fixed `width`/`height` so CSS controls sizing.
 * - Remove any inline `background:` so the page background shows through.
 *
 * This is a thin re-export of dgmo's `normalizeSvgForEmbed` so the doc-site
 * wrappers (astro/docusaurus/fumadocs), which consume this package, share the
 * EXACT embed-sizing logic used by dgmo + the Obsidian plugin — including the
 * within-canvas over-shoot guard, the coverage under-shoot guard, and
 * text-anchor–aware width estimation. This file used to carry its own fork of
 * that logic, which drifted and re-introduced clipping (word-cloud collapse,
 * arc-path over-shoot, start-anchored text undercount) that dgmo had already
 * fixed. Single-sourcing removes the drift permanently. The `normalizeSvg`
 * name is preserved for backward compatibility with existing consumers.
 */
export { normalizeSvgForEmbed as normalizeSvg } from '@diagrammo/dgmo';
