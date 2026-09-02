# remark-dgmo

Framework-agnostic [remark](https://github.com/remarkjs/remark) plugin that renders [DGMO](https://diagrammo.app) diagrams from ` ```dgmo ` fenced code blocks at build time. Powered by [`@diagrammo/dgmo`](https://www.npmjs.com/package/@diagrammo/dgmo). Zero client JavaScript by default.

📖 **Setup guides for Astro, Docusaurus & Fumadocs:** [diagrammo.app/embed](https://diagrammo.app/embed)

```dgmo
sequence
Client -POST /login-> API
API -validate-> Auth
Auth -JWT-> API
API -200 OK-> Client
```

Drop a fenced block with the language `dgmo` into any markdown or MDX file processed by a unified-style pipeline — Astro, Docusaurus, Starlight, Vitepress, eleventy-with-remark, or your own custom toolchain — and it becomes an inline `<svg>` at build time.

By default, every diagram is rendered **twice** (once with the palette's light mode, once with its dark mode) and wrapped in `<div class="dgmo-light">` / `<div class="dgmo-dark">`. A tiny shipped stylesheet hides the wrong one, keyed on `[data-theme="dark"]` (Docusaurus, Starlight) and on `html.dark` (Tailwind, next-themes, VitePress) — so both conventions work as shipped. The result: your diagrams follow the host page's color-mode toggle without any client-side rendering.

The dark wrapper also carries the `hidden` attribute, so a page that never loads the stylesheet shows the light diagram rather than both of them. `hidden` is user-agent origin, so every rule in `client.css` still overrides it.

## Install

```bash
pnpm add remark-dgmo @diagrammo/dgmo
# or
npm install remark-dgmo @diagrammo/dgmo
```

`@diagrammo/dgmo` is a peer dependency.

ESM-only. Your config file must be `.mjs`, `.ts`, or `.mts` — or your `package.json` must have `"type": "module"`.

## Use — three integration patterns

### Pattern 1: Astro

Use [`astro-dgmo`](https://www.npmjs.com/package/astro-dgmo) — it wraps this plugin and handles the integration plumbing.

```bash
pnpm add astro-dgmo @diagrammo/dgmo
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import dgmo from 'astro-dgmo';

export default defineConfig({
  integrations: [dgmo()],
});
```

`astro-dgmo` injects the color-mode stylesheet itself from 0.11.0, so there is nothing else to wire. Wiring the remark plugin by hand instead? Import it yourself:

```astro
---
// src/layouts/Base.astro
import 'remark-dgmo/client.css';
---
```

### Pattern 2: Docusaurus

Use [`docusaurus-plugin-dgmo`](https://www.npmjs.com/package/docusaurus-plugin-dgmo) — it handles `getClientModules()` registration for the CSS + client script.

```bash
pnpm add docusaurus-plugin-dgmo @diagrammo/dgmo
```

```ts
// docusaurus.config.ts
import type { Config } from '@docusaurus/types';

const config: Config = {
  // …
  plugins: ['docusaurus-plugin-dgmo'],
  presets: [
    [
      'classic',
      {
        docs: {
          remarkPlugins: [
            (await import('docusaurus-plugin-dgmo/remark')).default,
          ],
        },
        blog: {
          remarkPlugins: [
            (await import('docusaurus-plugin-dgmo/remark')).default,
          ],
        },
        pages: {
          remarkPlugins: [
            (await import('docusaurus-plugin-dgmo/remark')).default,
          ],
        },
      },
    ],
  ],
};

export default config;
```

The plugin registers `client.css` + `client.js` via `getClientModules()`. You still wire `remarkPlugins` into each preset slot manually — Docusaurus's plugin API has no hook to auto-inject into a sibling preset.

### Pattern 3: Fumadocs (Next.js app router)

Use [`fumadocs-dgmo`](https://www.npmjs.com/package/fumadocs-dgmo) — it wraps `mdxOptions` for `fumadocs-mdx`, ships a `.dark`-rewritten stylesheet (Fumadocs UI's `next-themes` default), and provides a Client Component that re-binds on every soft navigation.

```bash
pnpm add fumadocs-dgmo @diagrammo/dgmo
```

```ts
// source.config.ts
import { defineConfig } from 'fumadocs-mdx/config';
import { withDgmo } from 'fumadocs-dgmo/config';

export default defineConfig({
  mdxOptions: withDgmo(),
});
```

```css
/* app/global.css */
@import 'fumadocs-ui/css/preset.css';
@import 'fumadocs-dgmo/client.css';
```

```tsx
// app/layout.tsx — add <DgmoClient /> inside <RootProvider>
import { DgmoClient } from 'fumadocs-dgmo/client';
// …
<RootProvider>
  {children}
  <DgmoClient />
</RootProvider>;
```

### Pattern 4: Vanilla unified pipeline

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkDgmo from 'remark-dgmo';

const out = await unified()
  .use(remarkParse)
  .use(remarkDgmo, { mode: 'showcase', palette: 'catppuccin' })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true })
  .process(source);
```

In your output HTML's `<head>`, add the shipped stylesheet (or inline its three rules):

```html
<link
  rel="stylesheet"
  href="/path/to/node_modules/remark-dgmo/dist/client.css"
/>
<script
  type="module"
  src="/path/to/node_modules/remark-dgmo/dist/client.js"
></script>
```

The client script is optional — it tightens each diagram's `viewBox` to its content bounds and wires up showcase-mode copy buttons. Without it, diagrams still render but may have extra whitespace and copy buttons won't function.

## Options

```js
remarkDgmo({
  // Output mode for `dgmo` blocks. 'diagram' (default) = SVG only.
  // 'showcase' = syntax-highlighted source + diagram + copy + open-in-editor.
  mode: 'diagram',

  // Default palette name (any registered @diagrammo/dgmo palette).
  palette: 'nord',

  // Color-mode strategy. 'auto' (default) renders both light and dark and
  // toggles via CSS. 'light' or 'dark' single-renders with the matching theme.
  colorMode: 'auto',

  // Default theme when colorMode is 'light' or 'dark' (single-render). Ignored under 'auto'.
  theme: 'dark',

  // Showcase chrome — each toolbar button toggles independently. Enabled
  // automatically in showcase mode; set any to false to hide just that button.
  showSource: undefined, // boolean; default = (mode === 'showcase')
  showCopy: undefined, // boolean; default = (mode === 'showcase')
  showExpand: undefined, // boolean; default = (mode === 'showcase')
  showOpenInEditor: undefined, // boolean; default = (mode === 'showcase')

  // Where the "Open in editor" link points.
  editorBaseUrl: 'https://online.diagrammo.app',

  // Outer wrapper element + class hook.
  wrapper: 'figure',
  className: 'dgmo',

  // Append additional class names to every emitted wrapper. Used by
  // astro-dgmo v0.3.0 to keep the legacy `astro-dgmo*` class names for one
  // minor cycle of backward compat.
  legacyClassNames: [],

  // Emit MDX-compatible output. Default: false (raw `html` mdast node).
  // Set to true when the host pipeline routes files through @mdx-js/mdx —
  // Docusaurus with `markdown.format: 'mdx'`, Astro `.mdx`, Fumadocs, etc.
  // The plugin then emits an `mdxJsxFlowElement` instead of an `html` node,
  // so MDX accepts the output without "Cannot handle unknown node `raw`".
  mdx: false,
});
```

## Per-block overrides

Append options to the fence info string. Tokens are space-separated; values may be quoted.

````markdown
```dgmo showcase title="Login flow" palette=catppuccin theme=light
sequence
A -> B
```
````

| Token                                                   | Effect                              |
| ------------------------------------------------------- | ----------------------------------- |
| `diagram` / `showcase`                                  | Set `mode` for this block           |
| `palette=<name>`                                        | Override palette                    |
| `theme=light` / `theme=dark` / `theme=transparent`      | Override theme (single-render only) |
| `colorMode=auto` / `colorMode=light` / `colorMode=dark` | Override color-mode strategy        |
| `title="…"`                                             | Add a caption (`<figcaption>`)      |
| `source` / `noSource`                                   | Force source view + toggle on/off   |
| `copy` / `noCopy`                                       | Force copy button on/off            |
| `expand` / `noExpand`                                   | Force expand (full-screen) on/off   |
| `openInEditor` / `noOpenInEditor`                       | Force editor link on/off            |

Each toolbar button is independent — e.g. ` ```dgmo showcase noSource noExpand `
keeps just the copy + open-in-editor buttons, and ` ```dgmo copy ` adds only a
copy button to an otherwise bare diagram.

## Live links (on by default)

A fence can name a diagram living in [Diagrammo Cloud](https://diagrammo.app)
instead of carrying its own source:

````md
```dgmo
live-link dgm_01HQ3RSTUV
```
````

The build fetches that diagram's source, renders it exactly like a pasted one
(fence-meta and per-block overrides all still apply), and writes what it fetched
into `.dgmo/references/<id>.json`. **Commit that directory.** Three spellings are
accepted — `live-link <id>` in a fence, `![[live-link:<id>]]` in a note, or the
plain share URL.

```js
// on by default — this turns it OFF
remarkDgmo({ liveLink: { enabled: false } });
```

Switched off, a live-link fence renders a small card naming the diagram and
linking through to it, plus a hover-revealed _"Show this diagram here"_ link to
the guide, and the build warns naming the file and line. Nothing is fetched. See
the [live links guide](https://diagrammo.app/docs/live-links/).

**Only published diagrams can be referenced.** A private diagram is not
fetchable at all — there are no tokens, no signed links, and no origin
allowlists to configure, which is also why every referenced byte is cacheable.

### Why the cache is committed

So that our availability is never your build's problem. A clean CI checkout
renders from the committed copy if we are unreachable, and a diagram changing
shows up in your pull request as a source diff you can read.

| What happened                    | Your build                        | Your page                 |
| -------------------------------- | --------------------------------- | ------------------------- |
| all well                         | writes the cache                  | the current diagram       |
| we're unreachable, cache present | succeeds, with a warning          | last known good           |
| we're unreachable, no cache      | **fails**                         | —                         |
| unknown id, never cached         | **fails** (it can only be a typo) | —                         |
| id gone, cache present           | succeeds, with a warning          | last known good           |
| the author unshared it           | succeeds, with a warning          | a "no longer shared" card |

A withdrawn diagram is also taken down **between** builds, by the client script
— see [When an author stops showing a diagram](#when-an-author-stops-showing-a-diagram).

Set `liveLink: { offline: true }` to skip the network entirely and build from
the cache alone.

### ⚠️ Content-Security-Policy

If your site sets a CSP, it must allow `connect-src https://api.diagrammo.app`.
Without it the diagram still renders — it was baked at build time — but it will
**never refresh**, and nothing on the page can tell you so, because the report
would be blocked too. This is the one thing to get right before shipping
live links.

### How the refresh works

`remark-dgmo/client.js` checks, once the page is idle, whether any referenced
diagram has moved since the build. Almost always it hasn't, and the check costs
one edge-cached request.

When one has, the default is to **say so** — a small link to the live diagram —
rather than to re-render it. That default is about your bundle, not about
laziness: re-rendering needs the dgmo renderer in the browser, and a bundler
that can see the import ships it whether or not it is ever used. On this repo's
own Astro fixture the difference is **1 chunk / 8.9 KB gzipped versus 88 chunks
/ 634 KB**. Lazy for your readers; not free for your `dist/`.

If you want the swap anyway — a docs site that publishes far more often than it
rebuilds is the case that wants it — opt in:

```js
import 'remark-dgmo/client.js';
import 'remark-dgmo/client-render.js'; // adds the renderer to your bundle
```

That second line registers a renderer by running and exports nothing, so it
needs a `remark-dgmo` **newer than 0.14.1** to survive your build: up to and
including that version the package declared itself free of side effects, which
licensed bundlers to delete the import outright — silently, leaving you the link and no renderer. If
you are wiring this from application code rather than a side-effect import, a
dynamic `import('remark-dgmo/client-render.js')` works on any version and is
what the framework wrappers do.

Using a wrapper? Each one has its own way in, and setting `refresh: 'render'`
without it now tells you so at build time: `astro-dgmo` and
`docusaurus-plugin-dgmo` inject the runtime for you, while `fumadocs-dgmo` and
`nextra-dgmo` want `<DgmoRenderClient />` mounted and `vitepress-dgmo` wants
`setupDgmoRender()` called in your theme.

Even then, the client refuses a swap it cannot make safely: a renderer version
that disagrees with the one that baked the page, or a new diagram that would
reflow your layout. Those fall back to the same small link, and your diagram is
left exactly as it was.

### When an author stops showing a diagram

One answer is not a refresh at all. If the author has **withdrawn** the diagram,
the page replaces it with the same _"This diagram is no longer shared."_ card
your build draws — without the renderer, and without waiting for your next
build. A site that builds weekly would otherwise keep publishing withdrawn work
for a week, and one that has stopped building would keep publishing it forever.

It is the only case where this script takes something off your page rather than
adding a note beside it, and it needs nothing from you. Every other answer — a
missing diagram, an outage, a timeout, a request your CSP blocked — leaves the
baked diagram exactly where it is, because those mean _cannot say_ rather than
_taken back_.

## Working reference site

For an end-to-end example of `remark-dgmo` running inside a real
framework, see [`docusaurus-plugin-dgmo`'s `tests/fixture/`](https://github.com/diagrammo/docusaurus-plugin-dgmo/tree/main/tests/fixture)
— a minimal Docusaurus 3 site that wires this plugin into every preset
slot and exercises plain, tagged, showcase, and per-block-override
blocks. The `astro-dgmo` repo has an equivalent Astro 6 fixture at
[`tests/fixture/`](https://github.com/diagrammo/astro-dgmo/tree/main/tests/fixture);
the `fumadocs-dgmo` repo has a Next.js app-router fixture at
[`tests/fixture/`](https://github.com/diagrammo/fumadocs-dgmo/tree/main/tests/fixture).

All three fixtures pin to `link:../..` against the wrapper plugin's
source, so they're the canonical reference for the smallest correct
config — including the non-obvious gotchas (Docusaurus's async-function
default export + `markdown: { format: 'md' }`, Fumadocs's `mdx: true`
requirement and `html.dark` selector mapping). The Astro fixture
deliberately imports no stylesheet, because `astro-dgmo` injects it.

## Custom color-mode selector

The shipped `client.css` covers both mainstream conventions, so neither of these needs anything from you:

- `data-theme="dark"` on `<html>` — Docusaurus, Starlight
- `class="dark"` on `<html>` — Tailwind, next-themes, Fumadocs UI, VitePress

For any other selector (`data-color-scheme="dark"`, `:root[data-mode="dark"]`), add this pair alongside the shipped stylesheet — they layer on top, so there is no need to opt out of it:

```css
[data-mode='dark'] .dgmo-light {
  display: none;
}
[data-mode='dark'] .dgmo-dark {
  display: block !important;
}
```

The `!important` is required, not decoration: the dark wrapper ships with an inline `display: none`, and only an important rule outranks an inline declaration.

If your site has no dark mode at all, there is nothing to do: the dark wrapper ships inline-hidden and stays that way until one of these rules overrides it. That was the `hidden` attribute until `@diagrammo/dgmo` 0.82.0 — Tailwind v4 hides `[hidden]` with `!important` from inside `@layer base`, and a layered important declaration outranks an unlayered one whatever its specificity, so on a Tailwind v4 site no rule could reveal the dark diagram and every block was a blank box in dark mode.

## How it works

1. The remark transformer walks the mdast, finding `code` nodes with `lang === 'dgmo'`.
2. For each block, `renderDgmoBlock()` calls `render()` from `@diagrammo/dgmo` — twice if `colorMode: 'auto'` (one light, one dark), once otherwise.
3. Each SVG is normalized: width/height stripped, `viewBox` added, inline background removed.
4. The original `code` node is replaced with an `html` node carrying the rendered wrapper(s).
5. The optional client script (`dist/client.js`) tightens viewBoxes and binds showcase-mode copy buttons.

Rendering happens at build time. The browser sees only the inline SVG and the small color-mode CSS.

## License

MIT
