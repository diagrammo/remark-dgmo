import { visit } from 'unist-util-visit';
import type { Root, Code, Html, Parent } from 'mdast';
import { renderDgmoBlock, type BlockLocation } from './render-block.js';
import type { DgmoOptions } from './options.js';
import { htmlToMdxJsxNode } from './mdx-node.js';

export type RemarkDgmoOptions = DgmoOptions;

interface FencePayload {
  source: string;
  meta: string | null;
  location: BlockLocation;
}

interface Target {
  parent: Parent;
  index: number;
  payload: FencePayload;
}

/**
 * Remark plugin that finds ```dgmo fenced code blocks and replaces them with
 * an HTML node containing the rendered SVG (and optional showcase chrome).
 *
 * The `lang` field on the code node is the fence language (the word after the
 * backticks). The `meta` field is everything that follows on the same line,
 * which we use to allow per-block options like ```dgmo showcase palette=catppuccin.
 *
 * Replaces the code node entirely (parent.children[index] = newNode) rather
 * than mutating it in place — otherwise downstream rehype/Shiki plugins still
 * see the lingering `lang: 'dgmo'` and `value: '...source...'` properties and
 * may re-process the block as a plaintext code listing, clobbering our
 * syntax-highlighted output.
 *
 * Async-safe: replacement is collected first, applied after parsing finishes.
 */
export default function remarkDgmo(options: RemarkDgmoOptions = {}) {
  return async function transformer(
    tree: Root,
    file?: { path?: string }
  ): Promise<void> {
    const targets: Target[] = [];
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'dgmo') return;
      if (!parent || index === undefined) return;
      const loc: BlockLocation = {};
      if (file?.path) loc.path = file.path;
      const line = node.position?.start.line;
      if (typeof line === 'number') loc.line = line;
      targets.push({
        parent: parent as Parent,
        index,
        payload: { source: node.value, meta: node.meta ?? null, location: loc },
      });
    });
    if (targets.length === 0) return;

    const rendered = await Promise.all(
      targets.map(t =>
        renderDgmoBlock(
          t.payload.source,
          t.payload.meta,
          options,
          t.payload.location
        ).catch(err => ({
          html: errorHtml(err, t.payload.source, options),
          diagnostics: [],
        }))
      )
    );

    // Replace in reverse index order per parent so earlier replacements don't
    // shift indices of later targets in the same parent. (Visit walks in tree
    // order, so within a single parent's children targets are also ordered;
    // reversing is sufficient.)
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      // MDX rejects raw `html` nodes ("Cannot handle unknown node `raw`"),
      // so under `mdx: true` we emit an `mdxJsxFlowElement` (a
      // `<div dangerouslySetInnerHTML={{__html: …}} />` JSX wrapper) which
      // the MDX → React compiler accepts. Default stays raw HTML to keep
      // every existing wrapper (astro, plain remark, remark-html) untouched.
      const replacement = options.mdx
        ? htmlToMdxJsxNode(rendered[i].html)
        : ({ type: 'html', value: rendered[i].html } as Html);
      t.parent.children[t.index] = replacement as unknown as Html;
    }
  };
}

function errorHtml(
  err: unknown,
  source: string,
  options: RemarkDgmoOptions
): string {
  const msg =
    err instanceof Error ? err.message : 'Failed to render dgmo block.';
  const safeMsg = msg.replace(/[<>&]/g, ch =>
    ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&amp;'
  );
  const safeSrc = source.replace(/[<>&]/g, ch =>
    ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&amp;'
  );
  const baseClass = options.className ?? 'dgmo';
  const legacy = (options.legacyClassNames ?? []).join(' ');
  const cls = legacy
    ? `${baseClass} ${legacy} ${baseClass}--error`
    : `${baseClass} ${baseClass}--error`;
  return (
    `<div class="${cls}" role="alert">` +
    `<strong>dgmo render error:</strong> ${safeMsg}` +
    `<pre>${safeSrc}</pre></div>`
  );
}
