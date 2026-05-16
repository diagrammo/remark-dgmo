# remark-dgmo

Framework-agnostic [remark](https://github.com/remarkjs/remark) plugin that renders [DGMO](https://diagrammo.app) diagrams from `` ```dgmo `` fenced code blocks at build time. Powered by [`@diagrammo/dgmo`](https://www.npmjs.com/package/@diagrammo/dgmo). Zero client JavaScript by default.

```dgmo
sequence
Client -POST /login-> API
API -validate-> Auth
Auth -JWT-> API
API -200 OK-> Client
```

Drop a fenced block with the language `dgmo` into any markdown or MDX file processed by a unified-style pipeline — Astro, Docusaurus, Starlight, Vitepress, eleventy-with-remark, or your own custom toolchain — and it becomes an inline `<svg>` at build time.

By default, every diagram is rendered **twice** (once with the palette's light mode, once with its dark mode) and wrapped in `<div class="dgmo-light">` / `<div class="dgmo-dark">`. A tiny shipped stylesheet hides the wrong one based on `[data-theme="dark"]` (the convention used by Docusaurus, Starlight, and most other docs frameworks). The result: your diagrams follow the host page's color-mode toggle without any client-side rendering.

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

You'll also need to import the color-mode stylesheet in your global layout:

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
          remarkPlugins: [(await import('docusaurus-plugin-dgmo/remark')).default],
        },
        blog: {
          remarkPlugins: [(await import('docusaurus-plugin-dgmo/remark')).default],
        },
        pages: {
          remarkPlugins: [(await import('docusaurus-plugin-dgmo/remark')).default],
        },
      },
    ],
  ],
};

export default config;
```

The plugin registers `client.css` + `client.js` via `getClientModules()`. You still wire `remarkPlugins` into each preset slot manually — Docusaurus's plugin API has no hook to auto-inject into a sibling preset.

### Pattern 3: Vanilla unified pipeline

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkDgmo from 'remark-dgmo';

const out = await unified()
  .use(remarkParse)
  .use(remarkDgmo, { mode: 'showcase', palette: 'dracula' })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true })
  .process(source);
```

In your output HTML's `<head>`, add the shipped stylesheet (or inline its three rules):

```html
<link rel="stylesheet" href="/path/to/node_modules/remark-dgmo/dist/client.css" />
<script type="module" src="/path/to/node_modules/remark-dgmo/dist/client.js"></script>
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

  // Showcase chrome — enabled automatically in showcase mode.
  showSource: undefined,        // boolean; default = (mode === 'showcase')
  showCopy: undefined,          // boolean; default = (mode === 'showcase')
  showOpenInEditor: undefined,  // boolean; default = (mode === 'showcase')

  // Where the "Open in editor" link points.
  editorBaseUrl: 'https://online.diagrammo.app',

  // Outer wrapper element + class hook.
  wrapper: 'figure',
  className: 'dgmo',

  // Append additional class names to every emitted wrapper. Used by
  // astro-dgmo v0.3.0 to keep the legacy `astro-dgmo*` class names for one
  // minor cycle of backward compat.
  legacyClassNames: [],
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

| Token | Effect |
|---|---|
| `diagram` / `showcase` | Set `mode` for this block |
| `palette=<name>` | Override palette |
| `theme=light` / `theme=dark` / `theme=transparent` | Override theme (single-render only) |
| `colorMode=auto` / `colorMode=light` / `colorMode=dark` | Override color-mode strategy |
| `title="…"` | Add a caption (`<figcaption>`) |
| `source` / `noSource` | Force source listing on/off |
| `copy` / `noCopy` | Force copy button on/off |
| `openInEditor` / `noOpenInEditor` | Force editor link on/off |

## Working reference site

For an end-to-end example of `remark-dgmo` running inside a real
framework, see [`docusaurus-plugin-dgmo`'s `tests/fixture/`](https://github.com/diagrammo/docusaurus-plugin-dgmo/tree/main/tests/fixture)
— a minimal Docusaurus 3 site that wires this plugin into every preset
slot and exercises plain, tagged, showcase, and per-block-override
blocks. The `astro-dgmo` repo has an equivalent Astro 6 fixture at
[`tests/fixture/`](https://github.com/diagrammo/astro-dgmo/tree/main/tests/fixture).

Both fixtures pin to `link:../..` against the wrapper plugin's source,
so they're the canonical reference for the smallest correct config —
including the non-obvious gotchas (Docusaurus's async-function default
export + `markdown: { format: 'md' }`, Astro's manual `import
'remark-dgmo/client.css'`).

## Custom color-mode selector

The shipped `client.css` keys on `[data-theme="dark"]` — the convention used by Docusaurus and Starlight. For Tailwind-style sites that signal dark mode via a `.dark` class on `<html>` (or any other selector), don't import `client.css`. Inline these three rules in your own CSS instead, swapping the selector:

```css
.dgmo-dark { display: none; }
html.dark .dgmo-light { display: none; }
html.dark .dgmo-dark  { display: block; }
```

For `data-color-scheme="dark"`, `:root[data-mode="dark"]`, etc. — same three rules, swap the selector to match what your toggle sets.

## How it works

1. The remark transformer walks the mdast, finding `code` nodes with `lang === 'dgmo'`.
2. For each block, `renderDgmoBlock()` calls `render()` from `@diagrammo/dgmo` — twice if `colorMode: 'auto'` (one light, one dark), once otherwise.
3. Each SVG is normalized: width/height stripped, `viewBox` added, inline background removed.
4. The original `code` node is replaced with an `html` node carrying the rendered wrapper(s).
5. The optional client script (`dist/client.js`) tightens viewBoxes and binds showcase-mode copy buttons.

Rendering happens at build time. The browser sees only the inline SVG and the small color-mode CSS.

## License

MIT
