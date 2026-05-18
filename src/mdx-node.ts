/**
 * Build an mdast node that an MDX pipeline accepts in place of a raw `html`
 * node. The output corresponds to authoring this in MDX:
 *
 *     <div dangerouslySetInnerHTML={{ __html: "…html…" }} />
 *
 * MDX rejects mdast `html` nodes ("Cannot handle unknown node `raw`"), so when
 * the host pipeline is MDX-format (Docusaurus with `markdown.format: 'mdx'`,
 * Astro `.mdx`, Fumadocs, etc.) the plugin emits this node instead.
 *
 * The `data.estree` field is what survives MDX → React compilation —
 * `@mdx-js/mdx` reads attribute values from the estree, not the string-form
 * `value`. Without it, the expression silently evaluates to `undefined` and
 * the diagram disappears.
 */

import { valueToEstree } from 'estree-util-value-to-estree';
import type { ObjectExpression, Program } from 'estree';

interface MdxJsxAttributeValueExpression {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
  data: { estree: Program };
}

interface MdxJsxAttribute {
  type: 'mdxJsxAttribute';
  name: string;
  // `null` is the bare-prop form: `<div foo>` rather than `<div foo="…">`.
  value: MdxJsxAttributeValueExpression | null;
}

export interface MdxJsxFlowElement {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: MdxJsxAttribute[];
  children: [];
}

export function htmlToMdxJsxNode(html: string): MdxJsxFlowElement {
  const objectExpression = valueToEstree({ __html: html }) as ObjectExpression;
  // valueToEstree emits ObjectExpression with `Property` entries — exactly the
  // shape MDX expects, so we use it verbatim and just wrap in a Program.
  const program: Program = {
    type: 'Program',
    body: [
      {
        type: 'ExpressionStatement',
        expression: objectExpression,
      },
    ],
    sourceType: 'module',
  };

  return {
    type: 'mdxJsxFlowElement',
    name: 'div',
    attributes: [
      {
        type: 'mdxJsxAttribute',
        name: 'dangerouslySetInnerHTML',
        value: {
          type: 'mdxJsxAttributeValueExpression',
          // String form is what `mdast-util-mdx-jsx` uses if it re-parses; we
          // also ship the estree on `data` for compilers that prefer it.
          value: `{__html: ${JSON.stringify(html)}}`,
          data: { estree: program },
        },
      },
      // Boolean attribute — `<div suppressHydrationWarning>`. The
      // `bindDgmo()` client script intentionally mutates the SSR HTML
      // (tightens each <svg>'s viewBox to real getBBox() bounds after
      // layout). React 19's reconciler walks into dangerouslySetInnerHTML
      // subtrees during hydration and would otherwise flag the post-mount
      // viewBox rewrite as a server-vs-client attribute mismatch. The
      // suppression is scoped to this wrapper only.
      // mdxJsxAttribute with `value: null` compiles to the bare-prop form.
      {
        type: 'mdxJsxAttribute',
        name: 'suppressHydrationWarning',
        value: null,
      },
    ],
    children: [],
  };
}
