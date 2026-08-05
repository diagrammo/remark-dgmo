import {
  parseCloudReferenceFence,
  type CloudReference,
} from '@diagrammo/dgmo/cloud-reference';
import {
  renderDgmoBlock,
  type BlockLocation,
  type RenderBlockResult,
} from './render-block.js';
import { resolveOptions, type DgmoOptions } from './options.js';
import {
  ReferenceBuildError,
  resolveReferences,
  type ReferenceOutcome,
} from './reference-resolve.js';
import { tombstoneCardHtml } from './tombstone-card.js';
import { liveLinkOffWarning, wrapLiveLinkOff } from './live-link-off.js';

/**
 * One ```dgmo fence, told apart from the two other things a fence body can be.
 *
 * Splitting classification from rendering is what lets the remark plugin batch:
 * it classifies every fence in a document first, fetches the distinct ids once,
 * and only then renders. A host with no batch phase calls `renderDgmoFence`
 * below and gets the same behaviour a fence at a time.
 */
export interface ClassifiedFence {
  source: string;
  meta: string | null;
  location: BlockLocation;
  /** The fence body named a published diagram instead of carrying source. */
  reference?: CloudReference;
  /**
   * It named one, but live links are switched off. The card still renders —
   * it is simply never fetched.
   */
  unresolvedLiveLink?: CloudReference;
}

/**
 * Read a fence body without touching the network.
 *
 * A live link is recognised whether or not the feature is on; what changes is
 * whether it gets FETCHED. Off, the fence still renders its reference card
 * rather than falling through to an error block: since `live-link` became a
 * real chart type, calling a valid fence broken would take deliberate work.
 */
export function classifyFence(
  source: string,
  meta: string | null,
  location: BlockLocation,
  options: DgmoOptions = {}
): ClassifiedFence {
  const fence: ClassifiedFence = { source, meta, location };
  // 🔴 The FENCE parser, not the union. `![[live-link:<id>]]` is the host
  // document's markdown and a fence's content is DGMO — accepting it here nested
  // markdown inside a code fence that is itself in markdown. Withdrawn
  // 2026-08-05 along with the showcase content that taught it.
  const ref = parseCloudReferenceFence(source);
  if (ref) {
    if (resolveOptions(options).liveLink.enabled) fence.reference = ref;
    else fence.unresolvedLiveLink = ref;
  }
  return fence;
}

/**
 * Render one classified fence — pasted source, or a live link whose fetch has
 * already happened.
 *
 * A reference goes through the SAME `renderDgmoBlock` call as pasted source, so
 * the two are indistinguishable in the output. That is the whole design: every
 * showcase feature, every palette, every fence-meta token keeps working on a
 * live link without being reimplemented for it.
 */
export async function renderClassifiedFence(
  fence: ClassifiedFence,
  outcome: ReferenceOutcome | ReferenceBuildError | undefined,
  options: DgmoOptions = {}
): Promise<RenderBlockResult> {
  const { reference, unresolvedLiveLink, source, meta, location } = fence;

  if (unresolvedLiveLink) {
    warn(liveLinkOffWarning(unresolvedLiveLink), location);
    // 🔴 Render the CANONICAL fence spelling, not `source`. Three spellings
    // reach here — `live-link <id>`, `![[live-link:<id>]]` and a plain share URL
    // — but only the first is a chart-type declaration dgmo can route. Passing
    // the raw body through would hand two of the three an "Unsupported chart
    // type" error card while the warning promised a reference card.
    const result = await renderDgmoBlock(
      `live-link ${unresolvedLiveLink.id}`,
      meta,
      options,
      location
    );
    return {
      ...result,
      html: wrapLiveLinkOff(result.html, unresolvedLiveLink),
    };
  }

  if (!reference) {
    return renderDgmoBlock(source, meta, options, location);
  }

  // Unresolvable references throw in the resolve phase; anything missing here
  // is a bug in the caller's batch, not a user error.
  if (!outcome || outcome instanceof ReferenceBuildError) {
    throw outcome ?? new Error(`Unresolved live link ${reference.id}`);
  }

  if (outcome.kind === 'tombstone') {
    warn(outcome.warning, location);
    const resolved = resolveOptions(options);
    return {
      html: tombstoneCardHtml({
        className: resolved.className,
        wrapper: resolved.wrapper,
        legacyClassNames: resolved.legacyClassNames,
      }),
      diagnostics: [],
    };
  }

  if (outcome.warning) warn(outcome.warning, location);

  // The markers the client refresh reads back: the id, the revision this page
  // was baked from, and the renderer version that baked it. Nothing else — no
  // source, no space, no author.
  return renderDgmoBlock(outcome.source, meta, options, location, {
    dataAttributes: {
      'dgmo-ref': reference.id,
      'dgmo-ref-updated': String(outcome.updatedAt),
      'dgmo-ref-version': outcome.dgmoVersion,
    },
  });
}

/**
 * Classify, resolve and render one fence in a single call.
 *
 * For hosts that render a fence at a time and have no document-wide batch phase
 * to hang resolution off — `vitepress-dgmo`, whose markdown-it fence rule is
 * synchronous and is fed by a per-fence async cache warm. Those hosts used to
 * call `renderDgmoBlock` directly, which meant a live link was handed to the
 * parser as if the URL were diagram source.
 *
 * The cost of the missing batch is per-id deduplication and the concurrency
 * cap: N distinct live links on one page are N calls here. Identical fences are
 * still cheap on any host that caches by fence content, which is why this is
 * acceptable rather than a second batching mechanism.
 */
export async function renderDgmoFence(
  source: string,
  meta: string | null | undefined,
  options: DgmoOptions = {},
  location: BlockLocation = {}
): Promise<RenderBlockResult> {
  const fence = classifyFence(source, meta ?? null, location, options);
  if (!fence.reference) return renderClassifiedFence(fence, undefined, options);

  const resolved = await resolveReferences(
    [{ ref: fence.reference, location }],
    resolveOptions(options).liveLink
  );
  const outcome = resolved.get(fence.reference.id);
  if (outcome instanceof ReferenceBuildError) throw locatedError(outcome);
  return renderClassifiedFence(fence, outcome, options);
}

function warn(message: string, location: BlockLocation): void {
  console.warn(`[remark-dgmo] ${message}${locationSuffix(location)}`);
}

/** Put the file and line INTO the message — an error naming only an id sends someone grepping. */
export function locatedError(err: ReferenceBuildError): ReferenceBuildError {
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
