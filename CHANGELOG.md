# Changelog

## 0.15.5

**A live link showing a placeholder instead of its diagram is now said again at
the END of the build.** Every degraded live link already printed a warning
naming the diagram, the cause, the remedy and the file and line — that has been
true since the module was written. What it could not do is survive scrollback:
measured on a real site, the detailed warning landed at line 105 of 228 lines
of build output, so a blog post argued for live links over a placeholder card
for three weeks and nobody noticed.

The build now finishes with a one-line summary:

```
[remark-dgmo] This build finished with 1 live link showing a placeholder
instead of its diagram (dgm_01KYRF…). Each one is described in full further
up this log.
```

This is a prominence change, not a reporting one — no new warning was added and
nothing that was silent before is louder now.

## 0.15.4

**Every diagram on a Tailwind v4 host was blank in dark mode.** A dual-render
fence ships a light SVG and a dark one and lets `client.css` pick; the dark
wrapper carried the `hidden` attribute so a host that never imported the
stylesheet showed one diagram rather than two. Tailwind v4's preflight hides
`[hidden]` with `!important` from inside `@layer base`, and for important
declarations a layered rule outranks an unlayered one at any specificity — so
the reveal could not win at any strength. The light wrapper was hidden by
`client.css`, the dark one by Tailwind, and the block collapsed to a
zero-height empty box.

`@diagrammo/dgmo` 0.82.0 hides the dark wrapper with an inline `display: none`
instead, and the two reveal rules here are now `!important` so they beat it.
**If you wrote your own color-mode selector**, add `!important` to your
`display: block` rule — an inline declaration outranks every normal author
rule. The README's recipe is updated.

The no-stylesheet floor is unchanged. One host is worse off than before: a site
whose Content-Security-Policy forbids inline styles drops the attribute, and
its floor goes back to both diagrams. A page that imported the stylesheet is
unaffected either way.

## 0.15.3

**Verified against `@diagrammo/dgmo` 0.81.0.** The dev range moves to
`>=0.81.0 <1`, and that move is the release: a range this package already
satisfied is never re-resolved, so 0.15.2 was built and tested against 0.80.0
and would never have seen 0.81.0 at all.

What that version brings to a rendered page: boxes-and-lines arrowheads are no
longer painted at the node centres under the boxes they point at, an edge label
lands on the line it names, a two-way pair of edges stops drawing as an X,
`color:` on an edge reaches the stroke, and a numbered heatmap row label is read
as a label rather than the row's first value. A first line that almost names a
chart type now says so instead of silently inferring a different chart.

## 0.15.2

**Verified against `@diagrammo/dgmo` 0.79.0.** The dev range moves to
`>=0.79.0 <1`, and that move is the release: a range this package already
satisfied is never re-resolved, so 0.15.1 was built and tested against 0.77.0
and never saw 0.78.0 at all.

### Fixed

- **The error card's docs link is bold again.** `styles/client.css` is a
  byte-for-byte copy of the library's canonical block stylesheet, and it had
  drifted by one declaration — dgmo made the link `bold` rather than weight 600
  as part of a sweep that gave forty-eight chart types one visual language, and
  this copy stayed on the old weight. Nothing here had changed; the stale
  dependency range is what kept the copy stale. The drift guard is what caught
  it, on the first build after the range moved.

### Changed

- Formatting only across eight files that had drifted from Prettier, and
  `format:check` now runs as part of `check:all` so the next drift fails a push
  instead of accumulating.

## 0.15.0

**Verified against `@diagrammo/dgmo` 0.76.0**, which is where the change
actually comes from — `client.css` is a byte-for-byte copy of dgmo's
`BLOCK_CSS`, guarded by a drift test.

### Fixed

- **Dark mode is keyed on `html.dark` as well as `[data-theme="dark"]`.**
  Tailwind, next-themes, Fumadocs UI and VitePress all mark dark with a class;
  Docusaurus and Starlight use the attribute. Shipping only the attribute left
  the other half of the ecosystem with a diagram that never toggled unless the
  host rewrote the selector at its own build step. Both now work as shipped;
  the rewrite (`adaptClientCssToClassToggle`) stays for hosts on a third
  signal.
- **The dark wrapper carries `hidden`** (emitted by `@diagrammo/dgmo` 0.76.0),
  so a page that never loads this stylesheet shows the light diagram rather
  than both of them stacked. That was the failure reported from a live Astro
  site: two of the five framework wrappers made the consumer import the
  stylesheet by hand, and a site that did not know to renders every diagram
  twice on a green build.

## 0.14.7

**Verified against `@diagrammo/dgmo` 0.75.0.**

Nothing in the tarball changes: dgmo is `external` here, so the built output is
the same bytes at a new version number. What moved is what the suite runs
against — the dev floor goes to `>=0.75.0`, because a range that is already
satisfied is never re-resolved and the tests would otherwise have gone on
resolving 0.74.0. The peer range stays at `>=0.61.0 <1`: no new subpath import
was added, and that floor is set by imports rather than by recency.

## 0.14.6

Version-only release, cut alongside the dgmo 0.74.0 cascade so the wrapper line
stayed in step. No source change, and the dev floor was still `>=0.72.0`, so the
suite went on resolving 0.72.0 — which is what 0.14.7 fixes.

## 0.14.5

**Verified against `@diagrammo/dgmo` 0.72.0.**

Nothing in the tarball changes: dgmo is `external` here, so the built output is
the same bytes at a new version number. What moved is what the suite runs
against — the dev floor goes to `>=0.72.0`, because a range that is already
satisfied is never re-resolved and the tests would otherwise have gone on
resolving 0.71.0. The peer range stays at `>=0.61.0 <1`: no new subpath import
was added, and that floor is set by imports rather than by recency.

## 0.14.4

**Verified against `@diagrammo/dgmo` 0.71.0, and the first release of this
package published by GitHub Actions.**

Nothing in the tarball changes: dgmo is `external` here, so the built output is
the same bytes at a new version number. What moved is what the suite runs
against. The dev floor had been left at `>=0.66.0`, and a range that is already
satisfied is never re-resolved — so every test and every wrapper build had gone
on resolving dgmo **0.66.0** through five of its releases. The peer range is
deliberately untouched at `>=0.61.0 <1`, because no new subpath import was
added and that floor is set by imports rather than by recency.

The publish now authenticates over npm trusted publishing, so this tarball
carries a provenance attestation that 0.14.3 does not.

## 0.14.2

🔴 **`import 'remark-dgmo/client-render.js'` was being deleted from builds, and
that is why re-rendering a moved live link only ever worked on `astro-dgmo`.**

The module registers a renderer by running and exports nothing, so the
documented opt-in is a side-effect import — and this package declared
`"sideEffects": false`, which is a bundler's licence to drop exactly that.
Measured with esbuild against 0.14.0 on 2026-08-06: the import compiled to **75
bytes carrying zero registrations**, with no error and no warning. The page kept
showing _"This diagram has been updated"_ forever, and nothing anywhere could
say why.

`astro-dgmo` escaped it only because it injects the file's BYTES rather than an
import, which is precisely how the defect stayed invisible while four wrappers
were unable to honour the setting at all.

`sideEffects` now names `./dist/client-render.js`, and a test fails if it goes
back to a blanket `false`. Nothing else changes: no new exports, no behaviour
change for a site on the default `refresh: 'notify'`.

## 0.14.1

**`![[live-link:<id>]]` is no longer accepted as the body of a `dgmo` fence.**

It is the host document's markdown — Obsidian's transclusion syntax — and a
fence's content is DGMO, so writing it there nests markdown inside a code fence
that is itself inside markdown. It parsed cleanly and read as the category error
it is. `classifyFence` reached for the union parser, which spans all three
spellings; it takes `parseCloudReferenceFence` now, which is the keyword form or
a plain link.

Pasting a **share link** into a fence still works, and should — a URL is not
markup, and it is what a person does with a link they were handed. The note
spelling is unaffected in a note **body**, which is the surface it was designed
for.

⚠️ The shared showcase intro in `dgmo-content` had been advertising the removed
form, so five docs sites were teaching it. Fixed there in the same pass; rebuild
a showcase to stop serving it.

🔴 **A patch, deliberately.** On `0.x` a caret locks the MINOR, so every wrapper
pinning `^0.14.0` reaches this and would never have reached 0.15.0 — a minor
would have stranded exactly the consumers the fix is for.

⚠️ **The `@diagrammo/dgmo` peer floor rises to `>=0.61.0 <1`**, because
`parseCloudReferenceFence` first ships in dgmo 0.61.0. The five wrappers still
declare `>=0.60.0 <1` of their own, which is now looser than what this package
requires — nothing validates a peer range against a dependency's peers, so that
is a latent trap for anyone who pins dgmo at 0.60.x.

## 0.14.0

**The step that asks the Cloud what a pointer points at now lives in dgmo.**

Nothing changes for a site that uses this package: the build resolves live links
exactly as it did, the committed `.dgmo/references/` cache has the same format,
and the failure table that decides whether a build stops is unchanged. All 128
tests pass against the moved code without one of them being edited, which is the
evidence that it is the same behaviour and not a rewrite of it.

What changed is who can reach it. The request, the timeout, the retry, and the
reading of 200/404/410/5xx into four outcomes used to live here — where four of
the five docs wrappers could get at it and nothing else could. That is how
`vitepress-dgmo`, which runs markdown-it and no remark plugin, came to ship a
release announcing live links it could not render; the Obsidian plugin hit the
same wall from the other side. It is now `fetchLiveLink` in
`@diagrammo/dgmo/live-link-resolve`, beside the parser and the card renderer,
where a live link is a chart type rather than a markdown feature.

What stayed here is everything that is genuinely a **build's** opinion — the
committed cache, the failure table, the dedupe pool, the CSP notice — because a
note being opened has no build to stop and no reviewable diff to write into.

🔴 **The `@diagrammo/dgmo` peer floor rises to `>=0.60.0 <1`.** That is the
release adding the subpath, so an older dgmo fails at module resolution in a
consumer's build rather than here. A caret on a `0.x` version locks the minor, so
every wrapper needs an explicit bump — `^0.13.0` will not take 0.14.0.

## 0.13.2

**🔴 A live link has never once refreshed in a reader's browser. Now it does.**

The build-time half always worked — the diagram bakes into the page correctly.
The client half, the part that notices the author has edited since your last
build, threw on its very first call in every release of this feature, on every
wrapper, and told nobody.

`fetch` is a WebIDL operation on `Window`: it throws `Illegal invocation` unless
its `this` **is** the global. The implementation held it on an options object and
called it as `ctx.fetchImpl(url)` — a method call, so `this` was that plain
object. The throw landed in a `catch` whose job is to treat a failed request as
"offline, or blocked by CSP, all the same answer: keep the diagram you have".
So the page did nothing: no re-render, no _"This diagram has been updated"_
notice, no console error. Indistinguishable from a diagram that had not changed.

Fixed by binding the default to the global, and by reading the function off the
object before calling it rather than through it. `reference-resolve.ts` had the
identical shape at build time; Node's `fetch` tolerates it, which is a large part
of why the browser half went unexamined for so long, and it is now bound too.

**Why every test passed.** They all injected `vi.fn()`, an ordinary function that
does not care what `this` is — so the suite could never fail the way the browser
did. The new test models the real thing: a `fetch` that throws unless `this` is
the global, reached through the default path with nothing injected. It fails
against 0.13.1.

Found by driving a real browser at the deployed showcase and instrumenting the
shipped bundle, after the server side — deployed artifact, API revision, CORS
headers, the lazy renderer chunk — had each been verified correct.

## 0.13.1

**A live link on a busy page could go unchecked forever.**

The client asks once, after load, whether a referenced diagram has changed. It
scheduled that question with `requestIdleCallback(cb)` and **no deadline** — a
request the browser is free to defer for as long as it likes. A page carrying
dozens of diagrams, which is exactly the kind of page that has a live link on it,
can keep a browser busy long enough that "idle" never arrives.

The symptom is the feature appearing dead rather than broken: the diagram had
changed, the API said so, and the page did nothing — no re-render, and no
_"This diagram has been updated"_ notice either, because the callback that
produces both had not run.

The asymmetry was the tell. A browser **without** `requestIdleCallback` fell
through to `setTimeout(run, 1000)` and always worked; a browser **with** it got no
guarantee at all. Now both paths are bounded at the same 1 s.

Found on Safari against the `astro-dgmo` showcase — ~64 dual-rendered charts,
550 KB of gzipped HTML. Every existing test injected its own scheduler, so the
real one had never run in CI; two tests now cover it, and the first fails against
0.13.0.

## 0.13.0

**A live link now works on a host that has no remark plugin.**

Everything that turns a fence body into a diagram — recognising a share URL,
fetching the published source, the withdrawn-diagram card, the markers the
client refresh reads back — lived inside the remark transformer. `vitepress-dgmo`
is a markdown-it host: it never runs that transformer, it calls `renderDgmoBlock`
per fence from its own async pre-pass. So on VitePress a share URL was handed to
the DGMO parser as if the URL were diagram source and came back **"Unsupported
chart type"**, while the `live-link <id>` spelling drew a static reference card
that never fetched anything. Neither failed a build; both simply looked wrong on
the page.

Three new exports, and one existing one that is now the wrong default:

```js
import { renderDgmoFence } from 'remark-dgmo';

// Classifies the body, fetches if it names a published diagram, renders.
const { html } = await renderDgmoFence(source, meta, options, location);
```

- **`renderDgmoFence(source, meta, options?, location?)`** — the one-shot path.
  Call this, not `renderDgmoBlock`, whenever the fence body might be a live link.
- **`classifyFence` + `renderClassifiedFence`** — the same work split in two, for
  a host that has a document-wide phase to batch the fetches in. The remark
  plugin now uses exactly these; its `renderTarget` was the original of this code
  and is gone, so there is one implementation rather than two that drift.
- `renderDgmoBlock` is unchanged and still renders a body as diagram **source**.
  It remains correct for a host that has already resolved the reference itself.

Nothing changes for the four remark-based wrappers: same plugin, same output,
117 existing tests unmoved.

## 0.12.0

**🔴 Two breaking changes, plus a default flip.** All three land together and all
three are visible to a site that upgrades and changes nothing.

**1. The fence keyword is `live-link`, not `cloud`.**

````md
```dgmo
live-link dgm_01HQ3RSTUV
```
````

`cloud <id>` no longer resolves — it is not deprecated, it simply stops being a
live link. Same for the note spelling: `![[cloud:<id>]]` becomes
`![[live-link:<id>]]`. `cloud` named _where the thing lives_; `live-link` names
_what it is_, and it is the phrase the publish dialog itself uses, so one word
now spans both sides of the exchange.

**2. The option is `liveLink`, not `references`.**

```js
remarkDgmo({ liveLink: { enabled: false } });
```

Named for the word people type in the fence. It also resolves a collision: in
Diagrammo Cloud a _reference_ already means a third-party site embedding a
published diagram, and the two senses sat a paragraph apart in this package.

**3. 🔴 Live links now resolve by DEFAULT.** A site that upgrades and does
nothing will start fetching from `api.diagrammo.app` at build time, and a
`.dgmo/references/` directory will appear in the repository wanting to be
committed. That is correct by design — the cache belongs in your repo so a clean
CI checkout never depends on our uptime, and a diagram changing arrives as a
reviewable diff — but it is an unexplained directory until you know why it is
there.

The old default was `false`, so wrappers that were not piloting the feature
changed behaviour by zero bytes. Pre-1.0 that promise costs more than it
protects: a pointer that does not resolve is not a feature someone opted into,
it is a broken page. Turning it off is now a choice a site owner makes:

```js
remarkDgmo({ liveLink: { enabled: false } });
```

On that path a live-link fence renders the **reference card** — the same card the
CLI and the desktop app draw — linking through to the diagram at `/d/<id>`, plus
a hover-revealed _"Show this diagram here"_ link to the guide, and the build logs
a warning naming the option and the source line. It is no
longer an error block; since `live-link` became a real chart type, calling a
valid fence broken would take deliberate work.

`refresh` is unchanged and still defaults to `notify`. Turning live links on is
cheap; turning them _fully_ on is not — `render` pulls the client renderer into
your bundle, which took the astro fixture from 1 chunk / 7,990 gzipped bytes to
90 chunks / 634,199.

**Requires `@diagrammo/dgmo` 0.58.0 or later**, which is where `live-link`
became a chart type.

## 0.11.0

**Cloud references — point a fence at a diagram instead of pasting one.**

````md
```dgmo
cloud dgm_01HQ3RSTUV
```
````

The build resolves that id against Diagrammo Cloud, renders it exactly like any
other block, and writes what it fetched into `.dgmo/references/<id>.json` — a
cache you **commit**. Three spellings are accepted (`cloud <id>` in a fence,
`![[cloud:<id>]]` in a note, or the plain share URL), all parsed by one resolver
shipped in `@diagrammo/dgmo/cloud-reference`.

**Off by default.** With `references.enabled` unset, a cloud fence renders
exactly as it did in 0.10 and no host's output changes by a byte.

**Your build never fails because of us — except when it should.** The cache is
committed rather than kept in `node_modules` precisely so a clean CI checkout
does not depend on our uptime: if we are unreachable, your site builds from the
committed copy and warns. A reference that has _never_ resolved does fail the
build, because that can only be a typo and it is found one line from where it
was made. A diagram whose author unshared it renders a placeholder — never the
cached copy, because our cache must not outlive their revocation.

**When a diagram changes after you build, the page notices rather than
re-rendering.** A small link to the live diagram, and nothing extra in your
bundle. Re-rendering means shipping the dgmo renderer to the browser, and on
`astro-dgmo`'s fixture that is the difference between 1 chunk / 8.9 KB gzipped
and 88 chunks / 634 KB — lazy for your readers, not free for your `dist/`. Opt in
by also loading `remark-dgmo/client-render.js`.

⚠️ **If your site sets a Content-Security-Policy, it must allow
`connect-src https://api.diagrammo.app`.** Without it a referenced diagram still
renders — it was baked at build time — but never refreshes, and nothing on the
page can report that, because the report would be blocked too.

### Requires dgmo ≥ 0.57.0

The peer range moves from `>=0.45.0` to `>=0.57.0`: this release calls
`@diagrammo/dgmo/cloud-reference` and passes the block's new `dataAttributes`
option, neither of which exists in earlier versions. A refused install is a
better failure than a runtime module-not-found.

## 0.10.0

Build against dgmo 0.53.0 — the language-consistency release (decision #48).

Every legacy spelling still parses, so this is a non-breaking bump. It lets you
write the new canonical forms in fenced `dgmo` blocks: `direction-lr` /
`direction-tb` everywhere, bare `collapsed`, universal `no-legend`,
`start-date`, `sp`, `workweek`, treemap `active-tag`, and state-diagram tag
groups. See the dgmo changelog for the full list.

Also re-syncs the vendored `styles/client.css` with dgmo's canonical
`BLOCK_CSS`, which moved the embed toolbar from the diagram's top-right to its
bottom-right so it no longer collides with a host's own top-right chrome (for
example Obsidian's code-block copy button).
