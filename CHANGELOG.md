# Changelog

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
