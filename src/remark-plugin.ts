import { visit } from 'unist-util-visit';
import type { Root, Code, Html, Parent } from 'mdast';
import { errorBlockHtml } from '@diagrammo/dgmo/block';
import type { CloudReference } from '@diagrammo/dgmo/cloud-reference';
import type { BlockLocation } from './render-block.js';
import { resolveOptions, type DgmoOptions } from './options.js';
import { ReferenceBuildError, resolveReferences } from './reference-resolve.js';
import {
  classifyFence,
  locatedError,
  renderClassifiedFence,
  type ClassifiedFence,
} from './render-fence.js';
import { htmlToMdxJsxNode } from './mdx-node.js';

export type RemarkDgmoOptions = DgmoOptions;

interface Target {
  parent: Parent;
  index: number;
  payload: ClassifiedFence;
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
    const liveLink = resolveOptions(options).liveLink;

    const targets: Target[] = [];
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'dgmo') return;
      if (!parent || index === undefined) return;
      const loc: BlockLocation = {};
      if (file?.path) loc.path = file.path;
      const line = node.position?.start.line;
      if (typeof line === 'number') loc.line = line;
      const payload = classifyFence(
        node.value,
        node.meta ?? null,
        loc,
        options
      );
      targets.push({ parent: parent as Parent, index, payload });
    });
    if (targets.length === 0) return;

    // Resolved first, as a batch: one fetch per distinct id no matter how many
    // blocks name it, with a concurrency cap, because a rate-limited endpoint
    // cannot tell a forty-page docs build from abuse.
    const resolved = await resolveReferences(
      targets
        .filter((t) => t.payload.reference)
        .map((t) => ({
          ref: t.payload.reference as CloudReference,
          location: t.payload.location,
        })),
      liveLink
    );

    // A reference that could not be resolved AT ALL fails the build, and it
    // fails it here rather than per-block: the errors are collected across the
    // batch so one bad id doesn't cancel the fetches already in flight, and the
    // first one is thrown with its file and line attached.
    for (const outcome of resolved.values()) {
      if (outcome instanceof ReferenceBuildError) throw locatedError(outcome);
    }

    // The render half is shared with the hosts that have no batch phase —
    // see render-fence.ts. Everything above this line is what batching buys.
    const rendered = await Promise.all(
      targets.map((t) => {
        const id = t.payload.reference?.id;
        const outcome = id === undefined ? undefined : resolved.get(id);
        return renderClassifiedFence(t.payload, outcome, options).catch(
          (err) => ({
            html: errorBlockHtml(err, t.payload.source, options),
            diagnostics: [],
          })
        );
      })
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
