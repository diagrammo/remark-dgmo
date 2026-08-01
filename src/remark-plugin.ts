import { visit } from 'unist-util-visit';
import type { Root, Code, Html, Parent } from 'mdast';
import { errorBlockHtml } from '@diagrammo/dgmo/block';
import {
  parseCloudReference,
  type CloudReference,
} from '@diagrammo/dgmo/cloud-reference';
import { renderDgmoBlock, type BlockLocation } from './render-block.js';
import { resolveOptions, type DgmoOptions } from './options.js';
import {
  ReferenceBuildError,
  resolveReferences,
  type ReferenceOutcome,
} from './reference-resolve.js';
import { tombstoneCardHtml } from './tombstone-card.js';
import { liveLinkOffWarning, wrapLiveLinkOff } from './live-link-off.js';
import { htmlToMdxJsxNode } from './mdx-node.js';

export type RemarkDgmoOptions = DgmoOptions;

interface FencePayload {
  source: string;
  meta: string | null;
  location: BlockLocation;
  /** Set when the fence body named a cloud diagram instead of carrying source. */
  reference?: CloudReference;
  /**
   * Set when the fence names a diagram but live links are switched OFF. The
   * card still renders (see live-link-off.ts) — it is just never fetched.
   */
  unresolvedLiveLink?: CloudReference;
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
    const liveLink = resolveOptions(options).liveLink;

    const targets: Target[] = [];
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'dgmo') return;
      if (!parent || index === undefined) return;
      const loc: BlockLocation = {};
      if (file?.path) loc.path = file.path;
      const line = node.position?.start.line;
      if (typeof line === 'number') loc.line = line;
      const payload: FencePayload = {
        source: node.value,
        meta: node.meta ?? null,
        location: loc,
      };
      // A live link is recognised either way — what changes is whether it gets
      // FETCHED. Off, the fence still renders its reference card (with a
      // click-through) rather than falling through to an error block: since
      // `live-link` became a real chart type, calling a valid fence broken
      // would take deliberate work and would be the wrong answer anyway.
      const ref = parseCloudReference(node.value);
      if (ref) {
        if (liveLink.enabled) payload.reference = ref;
        else payload.unresolvedLiveLink = ref;
      }
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

    const rendered = await Promise.all(
      targets.map((t) =>
        renderTarget(t, resolved, options).catch((err) => ({
          html: errorBlockHtml(err, t.payload.source, options),
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

/**
 * Render one fence — a pasted diagram, or a resolved live link.
 *
 * A reference goes through the SAME `renderDgmoBlock` call as pasted source, so
 * the two are indistinguishable in the output. That is the whole design: every
 * showcase feature, every palette, every fence-meta token keeps working on a
 * reference without being reimplemented for it.
 */
async function renderTarget(
  target: Target,
  resolved: Map<string, ReferenceOutcome | ReferenceBuildError>,
  options: RemarkDgmoOptions
): Promise<{ html: string; diagnostics: unknown[] }> {
  const { reference, unresolvedLiveLink, source, meta, location } =
    target.payload;

  // Live links switched off: render the card the ordinary way — `live-link` is
  // a registered chart type, so the render path already produces one — then
  // wrap it with the hover affordance and say so in the build log.
  if (unresolvedLiveLink) {
    warn(liveLinkOffWarning(unresolvedLiveLink), location);
    const result = await renderDgmoBlock(source, meta, options, location);
    return {
      ...result,
      html: wrapLiveLinkOff(result.html, {
        className: resolveOptions(options).className,
      }),
    };
  }

  if (!reference) {
    return renderDgmoBlock(source, meta, options, location);
  }

  const outcome = resolved.get(reference.id);
  // Unresolvable references already threw above; anything missing here is a
  // bug in the batch, not a user error.
  if (!outcome || outcome instanceof ReferenceBuildError) {
    throw outcome ?? new Error(`Unresolved live link ${reference.id}`);
  }

  if (outcome.kind === 'tombstone') {
    warn(outcome.warning, location);
    const resolvedOpts = resolveOptions(options);
    return {
      html: tombstoneCardHtml({
        className: resolvedOpts.className,
        wrapper: resolvedOpts.wrapper,
        legacyClassNames: resolvedOpts.legacyClassNames,
      }),
      diagnostics: [],
    };
  }

  if (outcome.warning) warn(outcome.warning, location);

  // The markers the client refresh reads back (story 10.4 P11): the id, the
  // revision this page was baked from, and the renderer version that baked it.
  // Nothing else — no source, no space, no author.
  return renderDgmoBlock(outcome.source, meta, options, location, {
    dataAttributes: {
      'dgmo-ref': reference.id,
      'dgmo-ref-updated': String(outcome.updatedAt),
      'dgmo-ref-version': outcome.dgmoVersion,
    },
  });
}

function warn(message: string, location: BlockLocation): void {
  console.warn(`[remark-dgmo] ${message}${locationSuffix(location)}`);
}

/** Put the file and line INTO the message — a build error naming only an id sends someone grepping. */
function locatedError(err: ReferenceBuildError): ReferenceBuildError {
  const suffix = locationSuffix(err.location);
  if (!suffix) return err;
  return new ReferenceBuildError(
    `${err.message}${suffix}`,
    err.id,
    err.location
  );
}

function locationSuffix(location: BlockLocation | undefined): string {
  if (!location) return '';
  if (location.path && location.line)
    return ` (${location.path}:${String(location.line)})`;
  if (location.path) return ` (${location.path})`;
  if (location.line) return ` (line ${String(location.line)})`;
  return '';
}
