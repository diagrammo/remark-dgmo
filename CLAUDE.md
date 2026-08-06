# remark-dgmo

Framework-agnostic core that renders ` ```dgmo ` fences at build time. Published unscoped to npm as `remark-dgmo`. Five packages sit on top of it — `astro-dgmo`, `docusaurus-plugin-dgmo`, `fumadocs-dgmo`, `nextra-dgmo`, `vitepress-dgmo` — so **a change here ships to all five**, and a break here surfaces in someone else's repo.

`WRAPPER-CONVENTIONS.md` is authoritative for anything wrapper-shaped: repo layout, the `defineConfig`/`withDgmo` pattern, export maps, the `tests/fixture/` contract, the four canonical diagram shapes, per-host CSS and client-JS delivery, CI and issue templates. This file is authoritative for the core itself — its dgmo coupling, its client runtime, its build shape. Don't restate one in the other.

## Depending on dgmo

`@diagrammo/dgmo` is a **peerDependency** with a floor plus a matching `devDependency` so tests have something to resolve — read both out of `package.json` rather than from a number written here. The floor is set by the subpath imports, not by taste:

- `@diagrammo/dgmo/block` — `errorBlockHtml`, the embed renderer, `BLOCK_CSS` (`remark-plugin.ts`, `render-block.ts`, `client-render.ts`)
- `@diagrammo/dgmo/cloud-reference` — the `CloudReference` type (`reference-resolve.ts`)
- `@diagrammo/dgmo/live-link-resolve` — `fetchLiveLink`, the request and the reading of 200/404/410/5xx (`reference-resolve.ts`). 🔴 **This package no longer owns that step.** It moved into dgmo on 2026-08-04 so the Obsidian plugin and the custom element could have it too; what stays here is the committed cache, the failure table, and what stops a build — a build's opinions, which a note being opened does not share. Re-implementing the response reading here would recreate exactly the split that shipped `vitepress-dgmo` announcing live links it could not render
- `@diagrammo/dgmo/countdown`, `@diagrammo/dgmo/clock` — `startCountdowns` / `startClocks` in `client.ts`
- root `normalizeSvgForEmbed`, re-exported as `normalizeSvg`

🔴 **A new subpath import moves the peer floor.** Bump it here, then bump the same range on all five wrappers and their devDeps — a stale wrapper installs an older dgmo and dies at module-resolution time in a consumer's build, not in ours.

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

This publishes **before** the host wrappers and must be live on npm first — their CI installs the new version at build time, so a wrapper tagged in the same breath builds against the old one.

⚠️ **A caret on a `0.x` version locks the minor**, so every wrapper needs an explicit dependency bump on each minor here — `^0.10.0` will not take 0.11.0. Landing a minor here is not done until those bumps are done. All five wrappers were caught up as of 2026-08-03 (`remark-dgmo ^0.12.0`, peer `@diagrammo/dgmo >=0.58.0 <1`); 0.13.0 needs the same sweep again — check with the `jq` sweep rather than trusting this sentence:

```bash
for d in astro-dgmo docusaurus-plugin-dgmo fumadocs-dgmo nextra-dgmo vitepress-dgmo; do
  jq -r --arg d "$d" '"\($d) remark=\(.dependencies["remark-dgmo"]) peer=\(.peerDependencies["@diagrammo/dgmo"])"' ../$d/package.json
done
```

## Before committing

`pnpm build && pnpm test && pnpm typecheck`. `pnpm check:all` (knip, jscpd, depcheck) catches dead exports — this package's whole surface is `src/index.ts`, so an unreferenced export is usually a wrapper that was never updated.
