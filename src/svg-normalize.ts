/**
 * Normalize an SVG produced by `@diagrammo/dgmo` for inline embedding:
 *
 * - Ensure the root `<svg>` has a `viewBox` so it scales responsively.
 * - Strip fixed `width="N"` / `height="N"` so CSS controls sizing.
 * - Remove any inline `background:` from the root style so the page background
 *   shows through.
 */
export function normalizeSvg(input: string): string {
  let svg = input;
  const rootMatch = svg.match(/<svg[^>]*>/);
  const rootTag = rootMatch?.[0] ?? '';
  if (rootTag && !rootTag.includes('viewBox')) {
    const wh = rootTag.match(/width="(\d+)"[^>]*height="(\d+)"/);
    if (wh) {
      svg = svg.replace(/<svg/, `<svg viewBox="0 0 ${wh[1]} ${wh[2]}"`);
    }
  }
  svg = svg.replace(/(<svg[^>]*?) width="[^"]*"/g, '$1');
  svg = svg.replace(/(<svg[^>]*?) height="[^"]*"/g, '$1');
  svg = svg.replace(/(<svg[^>]*?style="[^"]*?)background:[^;"]*;?\s*/g, '$1');
  svg = svg.replace(/<svg\s{2,}/g, '<svg ');
  return svg;
}
