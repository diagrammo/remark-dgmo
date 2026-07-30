# Changelog

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
