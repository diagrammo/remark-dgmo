# Changelog

## Unreleased

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
`![[live-link:<id>]]`. `cloud` named *where the thing lives*; `live-link` names
*what it is*, and it is the phrase the publish dialog itself uses, so one word
now spans both sides of the exchange.

**2. The option is `liveLink`, not `references`.**

```js
remarkDgmo({ liveLink: { enabled: false } });
```

Named for the word people type in the fence. It also resolves a collision: in
Diagrammo Cloud a *reference* already means a third-party site embedding a
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
a hover-revealed *"Show this diagram here"* link to the guide, and the build logs
a warning naming the option and the source line. It is no
longer an error block; since `live-link` became a real chart type, calling a
valid fence broken would take deliberate work.

`refresh` is unchanged and still defaults to `notify`. Turning live links on is
cheap; turning them *fully* on is not — `render` pulls the client renderer into
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
