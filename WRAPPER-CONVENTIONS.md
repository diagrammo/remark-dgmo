# Wrapper repo conventions

This document defines how a framework-specific wrapper for `remark-dgmo` is structured. It's the rulebook for `astro-dgmo`, `docusaurus-plugin-dgmo`, `fumadocs-dgmo`, and any future wrapper (Nuxt Content, Eleventy, VitePress, …). Reading it back-to-back with one of the existing wrappers should make a new wrapper a half-day's work, not a fishing trip.

If your wrapper deviates from this doc, write down why in the wrapper's README — drift is fine when it has a reason, surprise is not.

## 1. What a wrapper is for

`remark-dgmo` is the framework-agnostic core. Any framework that runs `unified` over `.md`/`.mdx` can use it directly. A wrapper exists when one or more of the host's idiomatic touchpoints can be hidden:

- The host has a config-shape convention (Astro integration, Docusaurus plugin, Next.js MDX plugin). Wrap it so users don't write 30 lines of glue.
- The host needs special handling for the shipped CSS + client script (some hosts emit `<link>`, some inline `<style>`, some need a `<Script>`).
- The host has a navigation/route-update hook the client script must subscribe to.

If none of those apply, point users at `remark-dgmo` directly — don't ship a thin re-export just because it would look symmetric.

## 2. Repo layout

```
your-wrapper/
├── .github/
│   ├── ISSUE_TEMPLATE/bug.yml         # cross-repo triage hints (see below)
│   ├── PULL_REQUEST_TEMPLATE.md       # links to RELEASE_CHECKLIST
│   ├── RELEASE_CHECKLIST.md           # pre-flight + smoke
│   └── workflows/
│       ├── ci.yml                     # typecheck/test/build + fixture build
│       └── release.yml                # tag-driven npm publish with guards
├── src/
│   ├── index.ts                       # main host-shaped export
│   ├── config.ts                      # defineConfig / withDgmo helper (if applicable)
│   └── remark.ts                      # re-export of remark-dgmo for explicitness
├── tests/
│   ├── *.test.ts                      # unit tests
│   └── fixture/                       # working consumer site, see §6
├── scripts/
│   └── assert-build-output.mjs        # fixture build assertions
├── LICENSE
├── README.md                          # see §3 for required sections
├── package.json
├── tsconfig.json                      # `allowImportingTsExtensions: true` if tests import fixture .ts files
├── tsup.config.ts
└── vitest.config.ts
```

## 3. README structure

Both `astro-dgmo` and `docusaurus-plugin-dgmo` follow the same heading order. Stick to it; users searching across wrappers should find the same section in the same place.

```
# wrapper-name

[one-paragraph hook with sample dgmo block]

## Install
## Quick start            ← `defineConfig`/`withDgmo` one-liner
## Configure (manual)     ← only if the host *can't* be wrapped in one line
## Use                    ← what a fenced block looks like in a host file
## Per-block overrides    ← table of fence-info tokens (links to remark-dgmo for full)
## Working reference site ← link to ./tests/fixture/
## How CSS is delivered   ← host-specific story (link vs inline vs <Script>)
## Custom color-mode selector
## How it works           ← numbered list, build-time flow
## License
```

Sections that don't add information for your host's users (e.g., manual Configure when the helper is the only path) get dropped. Do not invent new top-level sections — if you need to document something host-specific that doesn't fit, add it as a subsection.

## 4. The defineConfig pattern

Hosts that take a config object expose a one-liner helper. Two existing flavors:

- **Docusaurus**: `defineConfig(config, options?)` returns `Promise<Config>`. Auto-imports the ESM-only remark plugin, sets `markdown.format = 'md'`, adds itself to `plugins[]`, prepends `remarkDgmo` into every classic preset slot and any standalone `@docusaurus/plugin-content-*` entry. Idempotent.
- **Astro**: no separate helper — the integration _is_ the helper. `integrations: [dgmo(options?)]` is the one-line install.

When you build a new wrapper:

- If the host's config is an object literal, ship a `defineConfig`. Take the config + an options bag, return the augmented config (Promise if you need async imports).
- If the host's config takes a plugins array of factories (Astro-style), the factory itself is the one-liner. No extra helper needed.
- Be idempotent: re-running the helper on an already-wired config must not double-inject.
- Forward host-agnostic options through to `remark-dgmo`. Wrappers don't invent their own option surface unless they own a host-specific knob.

## 5. Export map (`package.json`)

Every wrapper's `exports` field must include at least:

```json
{
  ".": "./dist/index.js", // main host-shaped export (integration / plugin factory)
  "./remark": "./dist/remark.js", // re-export of remark-dgmo for power users
  "./config": "./dist/config.js" // defineConfig / withDgmo (omit if N/A)
}
```

Hosts that need a separately-bundled client module (Docusaurus's `./client`) add their own subpath. Wrappers MUST mark themselves `"sideEffects": false`.

Peer-dependencies — pinned in lockstep:

```json
"peerDependencies": {
  "@diagrammo/dgmo": "^0.X.0",   // matches what remark-dgmo declares
  "<host>": "^Y.0.0"
}
```

`@diagrammo/dgmo`'s version range is the same on every wrapper and on `remark-dgmo`. Bump them all together when dgmo cuts a major.

## 6. `tests/fixture/` contract

Every wrapper ships a complete minimal consumer site under `tests/fixture/`. It serves three audiences: maintainers (regression net), reviewers (visual sanity), and consumers (copy-paste template).

### Required files

- `package.json` — host's minimum versions; `"astro-dgmo": "link:../.."` (or equivalent) for `link:` dep on own source; private; type: module.
- `.npmrc` — `recursive-install=false` + `shared-workspace-lockfile=false`. The fixture lives outside the parent's pnpm install.
- `.gitignore` — `node_modules`, `dist`, host-specific cache dirs (`.astro`, `.docusaurus`).
- The host's config file using the wrapper's `defineConfig`/`withDgmo`.
- One source file (`src/pages/index.md`, `docs/diagrams.md`, etc.) with the four canonical diagram shapes from §7.
- A layout/wrapper file if the host requires manual CSS import (Astro does, Docusaurus doesn't).
- `README.md` — explains gotchas, the run command, what to look for.

### Required fixture README structure

```
# tests/fixture/ — working <Host> reference

Two purposes:

1. Consumer copy-paste template …
2. Test fixture for plugin development. <list of four shapes>

## Running it
<commands>

## What to look for
<bullet list — should produce dual-render, single-render, etc.>

## Not shipped to npm
"files" in package.json excludes tests/. Zero added bytes for consumers.
```

### Required: excluded from npm tarball

```json
"files": ["dist", "README.md", "LICENSE"]
```

Verify with `npm pack --dry-run` — the tarball should be < 10 KB and contain no fixture files.

### Required: dev + build both work locally

`pnpm exec <host>-dev` boots a server with all four diagrams visible. `pnpm exec <host>-build` produces a static output that contains light + dark wrappers. If the host's build is currently blocked by an upstream bug (cf. Docusaurus 3.10's SSG `resolveWeak`), document the blocker in the fixture README with the exact error trace and a link to the upstream issue, and disable the e2e step in CI with a comment pointing at the same doc.

## 7. Four canonical diagram shapes

The fixture's source file exercises exactly these four shapes, in this order. The shape coverage is what makes regressions surface uniformly across hosts.

```dgmo
sequence
Browser -GET /-> Server
Server -200 OK-> Browser
```

_Shape 1 — plain block under default `colorMode: 'auto'`. Tests dual-render emission._

```dgmo
sequence Treasure Hunt App
active-tag Layer

tag Layer as l
  Frontend teal
  Backend purple
  Data red

User is an actor
WebApp | l: Frontend
API | l: Backend
MapDB is a database | l: Data

User -Search nearby loot-> WebApp
WebApp -GET /loot?lat&lon-> API
API -SELECT-> MapDB
MapDB -rows-> API
API -200 OK-> WebApp
WebApp -render markers-> User
```

_Shape 2 — `tag` block with explicit colors. Tests palette color resolution under both light and dark modes._

````dgmo
```dgmo showcase title="Login flow"
sequence
Client -POST /login-> API
API -validate-> Auth
Auth -JWT-> API
API -200 OK-> Client
```
````

_Shape 3 — showcase mode. Tests source listing, copy button, open-in-editor link, caption rendering._

````dgmo
```dgmo palette=catppuccin colorMode=light
pie
TypeScript  45
Python       30
Rust         25
```
````

_Shape 4 — per-block override. Tests fence-meta parsing, single-render path, palette override._

The fixture's `pie` block stays put when the theme toggle fires — that's the "no-toggle-on-locked-mode" sanity check.

## 8. CSS delivery — host-specific stories

`remark-dgmo/client.css` contains three rules that gate visibility of the light/dark wrappers via `[data-theme="dark"]`. How the wrapper gets that CSS to the browser depends on the host:

| Host                              | Strategy                                                                                                                                                                                                                                             | Result in `<head>`                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Astro**                         | Document `import 'remark-dgmo/client.css'` in a global layout's frontmatter. Astro's Vite pipeline inlines it.                                                                                                                                       | `<style>…</style>` inside `<head>`                                         |
| **Docusaurus**                    | Wrapper's `getClientModules()` returns the CSS path; Docusaurus's webpack config emits a separate stylesheet file.                                                                                                                                   | `<link rel="stylesheet" href="…remark-dgmo…client.css">`                   |
| **Fumadocs (Next.js app router)** | Wrapper ships its own `fumadocs-dgmo/client.css` — a build-time copy of upstream with `[data-theme="dark"]` rewritten to `html.dark` (Fumadocs UI's `next-themes` default). User `@import`s it in `app/global.css`; Next's CSS pipeline extracts it. | `<link rel="stylesheet">` in `<head>` pointing at `_next/static/css/*.css` |

The fixture-build assertion script must check the host-appropriate form. See `astro-dgmo/scripts/assert-build-output.mjs` (regex on inline `<style>`) and `docusaurus-plugin-dgmo/scripts/assert-build-output.mjs` (regex on `<link>` href).

## 9. Client JS delivery — host-specific stories

`remark-dgmo/client.js` exports `bindDgmo()` — the function that tightens each diagram's `viewBox` to content bounds and binds showcase-mode copy buttons. Wrappers route it to the host's idiomatic navigation hook:

- **Astro**: `injectScript('page', readFileSync(remark-dgmo/client.js))` inlines the bytes into every page. The script self-attaches a `MutationObserver` on `<html>` and runs once on `DOMContentLoaded`.
- **Docusaurus**: wrapper ships `docusaurus-client.ts` (a tiny file in the wrapper itself, not in `remark-dgmo`) that imports `bindDgmo` and re-exports it as `onRouteDidUpdate` — the symbol Docusaurus calls on every SPA route change.
- **Fumadocs (Next.js app router)**: wrapper ships `fumadocs-client.tsx` (a `'use client'` React component, kept in the wrapper, not in `remark-dgmo`) that calls `bindDgmo()` inside a `useEffect` keyed on `usePathname()`. Mounted once inside `<RootProvider>` in `app/layout.tsx`. Next's app router does NOT refire `DOMContentLoaded` semantics on soft navigation, so the explicit pathname dep is what keeps showcase-mode buttons + viewBox tightening alive after the first SPA transition. `<Script strategy="afterInteractive">` doesn't work here because it fires once per hard load only.

Wrappers are responsible for keeping host-specific symbols (`onRouteDidUpdate`, `Script`, `IntegrationHook`) out of `remark-dgmo`'s code.

## 10. CI workflows

`ci.yml` runs on push + PR to `main`:

```yaml
- pnpm install --frozen-lockfile
- pnpm typecheck
- pnpm test # unit
- pnpm build
- pnpm test:e2e # fixture build + assert-build-output.mjs
```

Disable `test:e2e` only when the host's static build is broken upstream. Document the reason inline in the workflow with the exact error trace.

`release.yml` runs on `v*` tag push:

```yaml
- Verify tag version matches package.json
- Guard against dev-loop leakage:
    grep for `file:`/`link:` deps on remark-dgmo → fail
    grep for `pnpm.overrides` key in package.json → fail
- pnpm install / typecheck / test / build
- npm publish --access public --provenance # Trusted Publishers via OIDC
- Wait for npm registry to surface the new version (6× retry, 10s sleep)
- Create GitHub release with auto-generated notes
```

## 11. Issue templates

`bug.yml` includes the cross-repo triage block — pasted verbatim across all wrappers:

```yaml
**Triage hint:** if your symptom looks like one of these, you may be in the wrong repo —
- "Diagram looks wrong regardless of host site" → file in `dgmo`
- "Fenced block isn't being processed at all" → file in `remark-dgmo`
- "Color-mode toggle doesn't switch diagrams" → file in `remark-dgmo` (CSS lives there)
- "`<host> build` errors" → file in `<your wrapper>`
```

The "wrong repo" hints catch most mis-routed bugs at file-time.

## 12. Adopting in a new wrapper — checklist

- [ ] Clone the closest-shaped existing wrapper (`astro-dgmo` for plugin-factory hosts, `docusaurus-plugin-dgmo` for config-helper hosts).
- [ ] Update `package.json` name, description, peer-deps for the new host.
- [ ] Implement the host-shaped main export (integration / plugin / hook). Forward options through to `remark-dgmo`.
- [ ] Implement `defineConfig` / `withDgmo` if the host's config is a config object (skip if Astro-style factory).
- [ ] Decide CSS delivery (host-specific — see §8) and update the fixture's layout file accordingly.
- [ ] Decide client-JS delivery (host-specific — see §9) and wire it through the host's idiomatic hook.
- [ ] Copy `tests/fixture/` from the donor wrapper. Swap the host's config + layout files. Keep the four diagram shapes verbatim.
- [ ] Adapt `scripts/assert-build-output.mjs` for the host's HTML/CSS shape.
- [ ] Copy `.github/{ISSUE_TEMPLATE/bug.yml,PULL_REQUEST_TEMPLATE.md,RELEASE_CHECKLIST.md,workflows/}` and swap the host name.
- [ ] Verify dev server + production build both render the four shapes. If build is broken upstream, document inline and disable the e2e CI step.
- [ ] Verify `npm pack --dry-run` excludes `tests/`.
- [ ] Cross-link the new fixture from `remark-dgmo`'s README "Working reference site" section.

Done. The new wrapper inherits the same regression net, install ergonomics, and bug-routing as the existing two.
