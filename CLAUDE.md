# remark-dgmo

Framework-agnostic core that renders ` ```dgmo ` fences at build time. Published unscoped to npm as `remark-dgmo`. Five packages sit on top of it — `astro-dgmo`, `docusaurus-plugin-dgmo`, `fumadocs-dgmo`, `nextra-dgmo`, `vitepress-dgmo` — so **a change here ships to all five**, and a break here surfaces in someone else's repo.

`WRAPPER-CONVENTIONS.md` is authoritative for anything wrapper-shaped: repo layout, the `defineConfig`/`withDgmo` pattern, export maps, the `tests/fixture/` contract, the four canonical diagram shapes, per-host CSS and client-JS delivery, CI and issue templates. This file is authoritative for the core itself — its dgmo coupling, its client runtime, its build shape. Don't restate one in the other.

## Depending on dgmo

`@diagrammo/dgmo` is a **peerDependency** with a floor plus a matching `devDependency` so tests have something to resolve — read both out of `package.json` rather than from a number written here. The floor is set by the subpath imports, not by taste:

- `@diagrammo/dgmo/block` — `errorBlockHtml`, the embed renderer, `BLOCK_CSS` (`remark-plugin.ts`, `render-block.ts`, `client-render.ts`)
- `@diagrammo/dgmo/cloud-reference` — the `CloudReference` type (`reference-resolve.ts`)
- `@diagrammo/dgmo/live-link-resolve` — `fetchLiveLink`, the request and the reading of 200/404/410/5xx (`reference-resolve.ts`). 🔴 **This package no longer owns that step.** It moved into dgmo on 2026-08-04 so the Obsidian plugin and the custom element could have it too; what stays here is the committed cache, the failure table, and what stops a build — a build's opinions, which a note being opened does not share. Re-implementing the response reading here would recreate exactly the split that shipped `vitepress-dgmo` announcing live links it could not render
- `@diagrammo/dgmo/countdown`, `@diagrammo/dgmo/clock` — `startCountdowns` / `startClocks` in `client.ts`
- `@diagrammo/dgmo/advanced` — `loadMapData`, reached by a **dynamic** import inside `render-block.ts` and nowhere else
- root `normalizeSvgForEmbed`, re-exported as `normalizeSvg`

🔴 **A new subpath import moves the peer floor.** Bump it here, then bump the same range on all five wrappers and their devDeps — a stale wrapper installs an older dgmo and dies at module-resolution time in a consumer's build, not in ours.

**Map fences: this package hands over the basemap data, and no wrapper has to.** dgmo reads nothing off disk on its own, so a ` ```dgmo ` map baked the "no basemap data" error card on all five wrappers until 2026-08-10. `render-block.ts` now passes `mapData` on every block — a thunk that dynamically imports `loadMapData`, so a docs site with no maps never resolves `/advanced`, and the assets are read only for a fence that turns out to be a map. This module only ever runs inside a build, so reaching for the Node loader is not an environment guess.

**Which dgmo a map fence actually needs.** The peer floor stays where it is on purpose, so this is the one feature whose behaviour varies across the accepted range: on **0.61** a map renders because dgmo still read the basemaps off disk itself; on **0.62 – 0.65** it renders the error card no matter what this package does, because `/block` had no way to accept them; from **0.66** it renders because of the passthrough here. Everything else this package does works across the whole range, which is why maps alone do not justify forcing every wrapper consumer onto a newer dgmo.

The dynamic import is what keeps `/advanced` **off** the peer floor: an older `@diagrammo/dgmo`, one whose `/block` predates the `mapData` option, still resolves and simply ignores the option. That is the opposite of the bundling argument governing `client-render.ts` — nothing ships `render-block.ts` to a browser, so a build-time dynamic import here costs an adopter nothing.

⚠️ The **browser** re-render path (`reference-refresh.ts` → the opt-in renderer) passes no `mapData` and has nowhere to get it, so a referenced map that changes after a build is re-rendered as the error card. Notify-not-render, the default, is unaffected. Fixing it needs a fetch-based loader, not this one.

## Client runtime — `client.js` / `client.css`

`vitepress-dgmo` imports `bindDgmo` from `remark-dgmo/client.js` and ships an adapted `client.css`, while **not using the remark plugin at all** (markdown-it host, its own pre-pass). Breaking the client runtime breaks a package that never imports the plugin — grep the wrappers, don't assume the plugin's test suite covers it. `reference-refresh.ts` must be inert on a page with no `[data-dgmo-ref]`; there's a test for exactly that.

`styles/client.css` is a **vendored copy of dgmo's `BLOCK_CSS`**, copied into `dist/` by the build script and guarded byte-for-byte by the drift test in `tests/client-css.test.ts` (BL-114, shared block chrome). Edit it here and the suite fails — change `BLOCK_CSS` in dgmo, rebuild dgmo, re-copy. Hosts that theme by class rather than `[data-theme="dark"]` (`CLIENT_CSS_DARK_SELECTOR`) call `adaptClientCssToClassToggle` from the dependency-free `./client-css` entry.

## Cloud references — why the renderer is its own entry

🔴 **A dynamic `import()` is not a free import.** Bundlers resolve a static-analyzable `import()` at BUILD time — "lazy" says when the reader downloads it, never whether the adopter ships it. Measured on `astro-dgmo`'s fixture 2026-07-30: one `await import('@diagrammo/dgmo/block')` inside `reference-refresh.ts` took the built site from **1 chunk / 7,990 gzipped bytes to 90 chunks / 634,199**, and the wrapper's size assertion failed on the spot.

So the default is **notify, not re-render**: a moved diagram gets a link to the live one. Re-rendering is opt-in via the separate `remark-dgmo/client-render.js` entry — the only module that names the renderer, so the only graph a bundler can follow. That file imports nothing, not even from this package, and declares nothing at top level, because hosts concatenate both client files into one script scope (Astro's `injectScript`) and a second declaration fails the build. The handshake is a `globalThis.__dgmoReferenceRenderer` thunk plus a `dgmo:renderer-ready` event. Keep it that way.

🔴 **`sideEffects` must keep naming `./dist/client-render.js`.** That module exports nothing and registers by running, so the documented `import 'remark-dgmo/client-render.js'` is a side-effect import — and a blanket `"sideEffects": false` is a bundler's licence to delete it. It did: measured with esbuild against 0.14.0 on 2026-08-06, the import compiled to **75 bytes with zero registrations**, silently, so `refresh: 'render'` did nothing on every host that imports rather than inlines. `astro-dgmo` was unaffected only because `injectScript` ships the file's bytes, which is exactly why nobody saw it. `tests/side-effects.test.ts` fails if the field reverts. A **dynamic** `import()` survives on any version — that is what the four other wrappers use.

Referenced diagrams need `connect-src https://api.diagrammo.app` in a host's CSP; without it the baked diagram still renders and simply never refreshes.

## Build shape

`tsup`, ESM only, five entries (`index`, `remark-plugin`, `client`, `client-render`, `client-css`). `splitting: false` is load-bearing for the same inlining reason — an inlined module cannot resolve a relative `./chunk-*.js` sibling. `@diagrammo/dgmo` is `external`, so it resolves from the consumer's own install and never gets bundled twice. `postbuild` asserts `dist/client.css`, `dist/client.js` and `dist/theme-nord.css` exist, since two of the three arrive by `cp`, not from tsup.

## Publishing

This publishes **before** the host wrappers and must be live on npm first — their CI installs the new version at build time, so a wrapper released in the same breath builds against the old one. `scripts/release.sh` verifies the registry actually serves the new version at the end of a run, and that — not a green run — is what says the wrappers may go.

**The publish happens in CI, not on the laptop, as of 2026-08-14.** `scripts/release.sh remark-dgmo X.Y.Z` bumps, commits, tags, pushes, then dispatches `release.yml` **at that tag** and watches it. The workflow is `workflow_dispatch` only (optional `tag` input) so a release cannot run twice — a bare tag push ships nothing — and it publishes `npm publish --access public --provenance` under `permissions: id-token: write`, i.e. **npm Trusted Publishing (OIDC)**, with no stored credential on the path. The same shape applies to all five wrappers, each from its own repo's `release.yml`.

🔴 **A trusted publisher has to be registered by a human at npmjs.com per package, and as of 2026-08-14 none of the six is** — package → Settings → Trusted Publisher → GitHub Actions, organization `diagrammo`, repository the package's own, workflow filename `release.yml`, environment blank, allowed action `npm publish`. `scripts/npm-trusted-publishing.sh` walks them; there is no API and it cannot be automated, so until it is done the publish step fails to **authenticate**. A non-empty `npm view <pkg> dist.attestations` is the proof it published from CI.

⚠️ **A caret on a `0.x` version locks the minor**, so every wrapper needs an explicit dependency bump on each minor here — `^0.10.0` will not take 0.11.0. Landing a minor here is not done until those bumps are done. All five wrappers were caught up as of 2026-08-03 (`remark-dgmo ^0.12.0`, peer `@diagrammo/dgmo >=0.58.0 <1`); 0.13.0 needs the same sweep again — check with the `jq` sweep rather than trusting this sentence:

```bash
for d in astro-dgmo docusaurus-plugin-dgmo fumadocs-dgmo nextra-dgmo vitepress-dgmo; do
  jq -r --arg d "$d" '"\($d) remark=\(.dependencies["remark-dgmo"]) peer=\(.peerDependencies["@diagrammo/dgmo"])"' ../$d/package.json
done
```

## Before committing

`pnpm build && pnpm test && pnpm typecheck`. `pnpm check:all` (knip, jscpd, depcheck) catches dead exports — this package's whole surface is `src/index.ts`, so an unreferenced export is usually a wrapper that was never updated.
