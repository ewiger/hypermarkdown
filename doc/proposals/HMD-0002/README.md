# HMD-0002: MkDocs book-mode rendering

**Status**: drafted (implemented; three open questions block acceptance)
**Created**: 2026-08-06
**Source**: [HMD-0001 §9](../HMD-0001/README.md), open questions 8 and 9

## Abstract

This proposal maps a HyperMarkDown namespace onto a MkDocs site. It pins the
output URL for a card, derives the nav from the namespace tree with an optional
`nav` frontmatter key, fixes embed expansion at `on_page_markdown` so the `toc`
extension sees the finished document, and defines how unresolved links and plain
`.md` files behave in a build. It adds `hmd render` and the embed expander that
the plugin depends on. Wiki mode, backlinks, and generated pages stay out.

## Motivation

`hmd lint` proves a tree resolves; it does not produce anything a reader can
use. MkDocs is the shortest path from a linted tree to a site, and the plugin is
small because §5 already decided every link's destination.

The gap is that a resolver answers *which file* a name means, and a site needs
*which URL*. Nothing in HMD-0001 answers that, so the plugin cannot be written
without deciding it here.

## Goals

- One card maps to one stable URL, and a link rewrite is pure arithmetic on it.
- Nav order is derived by default and declarable when the default is wrong.
- A tree with red links still builds green.

## Non-goals

- Wiki mode, backlinks, category and special pages, health reports.
- Templates, queries, and the plugin API.
- Round-tripping flat markdown back into `.hmd`.

## Specification

### 1. Output URLs

- A card at root-relative `a/b.hmd` MUST render to `a/b/index.html`, served at
  `a/b/`. A folder note `a/b/index.hmd` MUST render to the same URL, since
  §5.1 already makes the two names address the same page.
- The plugin MUST therefore require `use_directory_urls: true`, and MUST fail
  the build with a usage error otherwise rather than emitting links it knows are
  wrong.
- Link rewriting MUST emit a path relative to the **source file**, not to the
  page's URL — `kanban.md`, not `../kanban/`. MkDocs resolves and validates every
  link against the source tree and computes the final URL itself, so a
  source-relative path gets the URL for free *and* gets the link checked.
  Emitting the finished URL bypasses validation and duplicates arithmetic MkDocs
  is already doing.
- A fragment MUST be appended unchanged; §3 of HMD-0001 already guarantees the
  slug the resolver matched is the slug the renderer emits.

### 2. Nav

- Nav MUST be derived from the namespace tree. A directory becomes a section,
  its `index.hmd` becomes that section's landing page, and cards become entries.
- Default order within a directory is folder notes first, then cards sorted by
  root-relative POSIX path. Deterministic, and stable under filesystem
  iteration order (P1).
- A fourth reserved frontmatter key, **`nav`**, MAY carry a mapping describing
  where a card sits in a published site. Its only key so far is **`order`**, an
  integer. Cards with `nav.order` sort ahead of cards without, ascending; ties
  fall back to the default order. This amends the closed reserved set of
  HMD-0001 §5.3 to `tags`, `use`, `import`, `nav`.
- `nav` is a mapping rather than a bare integer so that a second placement key
  can be added without inventing a second spelling for the first. A scalar
  `nav: 10` MUST therefore be reported rather than accepted: the two forms would
  otherwise both have to be honoured forever, and a card that carries the old
  spelling asked to be ordered and would silently sort last instead.
- A second key, **`visibility`**, gates publication. It takes `public` or
  `private`; any other value MUST be reported as HMD013 rather than coerced,
  because guessing publishes a card nobody asked to publish.
- Publication is **opt-in**. A card reaches a built site only if its effective
  visibility is `public`, and the default is `private`. A card that says nothing
  about itself has not asked to be published, and the cost of guessing the other
  way is a leak rather than a missing page.
- An unpublished card MUST NOT be registered at all: no page, no URL, nothing in
  the output directory. Omitting it from the nav alone is not sufficient — a
  page reachable by typing its address is published, whatever the sidebar says.
- `visibility` **inherits** the way `use` does: a card's own value, then the
  nearest ancestor `index.hmd` that sets one, then the default. A folder is the
  unit an author thinks in, so publishing one MUST NOT require editing every
  card inside it. The corollary is worth stating plainly: `public` on a root
  folder note publishes that entire subtree, and a card opts out with its own
  `private`.
- A published card that links to an unpublished one MUST render as a red link
  and MUST be reported as HMD017, a warning. The build stays green: this is a
  work item, not a defect that should stop a deploy.
- A published card that **embeds** an unpublished one MUST NOT expand it —
  expansion copies the target's bytes into the page, which is the one outcome
  the gate exists to prevent. It degrades to the same red link and the same
  HMD017. Expansion itself stays policy-free and takes the predicate from its
  caller, since rendering a card named directly on the command line is not the
  same situation as building a site.
- A malformed `nav` value, an unknown key inside it, or a non-integer
  `nav.order`, MUST be reported as HMD013.
- An explicit `nav:` in `mkdocs.yml` MUST win, except where it names the wiki:
  a nav entry whose value is `hmd://wiki` MUST be replaced by the derived
  section — as a mapping value it becomes that entry's children, as a list item
  it is spliced in place. Without this a site is a book *or* a wiki; the
  placeholder is what lets it be a book *with* a wiki in it.
- A page the authored nav already names MUST NOT appear again in the derived
  section. An authored placement is still a placement, and the derived section
  is what is left over. Listing one page twice is not a harmless repetition:
  MkDocs gives a page a single parent, so the card renders its own URL with the
  wrong section open, and every title after the first is silently discarded.
- The namespace root MAY be a subtree of `docs_dir`, named by the plugin's
  `root` option. Pages then serve under that subtree's path. A site therefore
  covers a whole documentation tree while `[[…]]` stays restricted to the part
  that is a namespace, and the rest builds as ordinary MkDocs pages.

### 3. Expansion

- Embeds MUST be expanded in `on_page_markdown`, before Python-Markdown runs, so
  `toc`, `footnotes`, and the rest see one finished document.
- Expansion is textual and MUST NOT shift heading levels (HMD-0001 §6).
- Heading slugs introduced by expansion MUST participate in the page's normal
  `toc` deduplication. A section embedded twice therefore yields `#s` and
  `#s_1`, and the page reports HMD011.

### 4. Red links and `.md`

- An unresolved link MUST render as `<a class="hmd-redlink">` carrying the link
  text and no `href`, and MUST NOT fail the build. Lint tracks the work item;
  the site stays viewable.
- Plain `.md` files under the docs dir MUST build as ordinary MkDocs pages. They
  remain invisible to the resolver (§4) and are therefore not wikilink targets;
  a `[[…]]` naming one is a red link.

### 5. Commands

- **`hmd render PATH [--to markdown|html]`** — expand embeds and rewrite
  resolved links. `markdown` is a one-way build product with no round-trip
  guarantee.
- `mkdocs serve` MUST watch the namespace root for `.hmd` changes via `on_serve`.

## Backwards Compatibility

`nav` is a new reserved key, so a card already using `nav` for its own purposes
changes meaning. Nothing is released and no card in this tree uses it.

## Security Considerations

The build reads the same tree `hmd lint` already reads under the containment
rules of HMD-0001 §4. Expansion is bounded by the depth limit of 16 and cycle
detection, which the plugin inherits rather than reimplements.

## Deployment / Activation

1. **M4** — `embed.py` (expansion, HMD007, HMD008), `render/flat.py`,
   `hmd render`. Independently testable, no MkDocs involved.
2. **M5** — `mkdocs_plugin.py` (`on_files`, nav, `on_page_markdown`, `on_serve`),
   `render/markdown_ext.py`, `mkdocs.yml`, the entry point in `pyproject.toml`.
3. Add `mkdocs build --strict` to CI.

## Reference Implementation

- `tools/hmd/src/hypermarkdown/embed.py` — expansion, cycle detection, depth limit
- `tools/hmd/src/hypermarkdown/render/flat.py` — the flat-markdown emitter
- `tools/hmd/src/hypermarkdown/mkdocs_plugin.py` — `on_files`, nav, `on_page_markdown`
- `tools/hmd/src/hypermarkdown/urls.py` — §1, the one place a URL is computed
- `pyproject.toml` — `[project.entry-points."mkdocs.plugins"]`

No `render/markdown_ext.py`. Once §3 fixed expansion at `on_page_markdown`, a
Python-Markdown extension had nothing left to do: expansion and link rewriting
share a single walk over the source, because a link inside embedded content must
be resolved from the card it was written in while the text it becomes belongs to
the host page. Splitting that across two components would have meant resolving
twice.

## Test Plan

Unit tests MUST include:

- URLs: `a/b.hmd` and `a/b/index.hmd` produce the same URL; a rewrite between
  two cards is relative and correct in both directions.
- Nav: default order is deterministic; `nav.order: 10` sorts ahead of an unkeyed
  sibling; a scalar `nav`, an unknown key inside it, and a non-integer `order`
  each raise HMD013.
- Visibility: a card with no `nav.visibility` and no ancestor that sets one
  produces no file in the output directory; a public folder note publishes its
  subtree; a card under it may still opt out with `private`; a link from a
  published card to an unpublished one renders `hmd-redlink` and raises HMD017;
  an embed of one does not appear in the built HTML.
- Expansion: section embed stops at the next same-or-higher heading; a two-page
  cycle raises HMD007; a 17-deep chain raises HMD008.
- A section embedded twice yields `#s` and `#s_1` and reports HMD011.

Integration tests MUST include:

- A build of `examples/small/` succeeding, with every `.hmd` present in the
  output and the deliberate red link carrying `class="hmd-redlink"`.
- `use_directory_urls: false` failing the build with a usage error.

```bash
python -m pytest
hmd render examples/small/specs/auth/login.hmd --to markdown
mkdocs build --strict
```

## Open Questions

- Does the plugin own `mkdocs.yml`'s extension list, or only document it?
- Should `nav` inherit down a subtree the way `use` does, so a folder can order
  itself relative to its siblings in one place?
- Is a red link with no `href` right, or should it link to a "create this page"
  target once one exists?

## Changelog

- 2026-08-06: drafted
- 2026-08-07: implemented. Three corrections forced by the implementation:
  §1 link rewriting is relative to the **source path** rather than the page URL,
  because MkDocs validates links against the source tree and computes URLs
  itself; `render/markdown_ext.py` is dropped, since fixing expansion at
  `on_page_markdown` left a Python-Markdown extension nothing to do; and a site
  needs `exclude_docs: "*.hmd"` plus `validation.links.not_found: info`, the
  latter because cards link out to the repository — proposals, styles, source —
  with ordinary relative links whose targets are real files but not site pages
- 2026-08-07: §2 gains the `hmd://wiki` nav placeholder and a namespace root
  that may be a subtree of `docs_dir`, so one build holds a book and a wiki.
  Implemented directly as a feature (issue 0001), not respecified.
- 2026-08-08: §2's `nav` becomes a mapping whose only key is `order`, where it
  was a bare integer. A breaking change to a key shipped in 0.1.0, taken while
  the format is pre-1.0 and while `doc/wiki` was its first user: placement has
  more than one plausible dimension, and a scalar would have needed a second
  spelling the moment a second key was wanted. The old form is reported as
  HMD013 rather than accepted, so no card silently loses its ordering.
- 2026-08-08: §2 gains `nav.visibility`, and with it the second key that
  justified the mapping the same day. Publication becomes opt-in and defaults to
  private, an unpublished card is not registered at all, and the key inherits
  from folder notes. HMD017 is added for a published card reaching into an
  unpublished one. The expander grows a `can_embed` predicate so a site can
  refuse to inline unpublished content while `embed.py` stays free of
  publication policy.
- 2026-08-08: §2 gains the rule that the derived section leaves out whatever the
  authored nav has already placed. Promoting the language specification to the
  top bar left it listed twice — once as its own tab and once inside the wiki —
  and its own page then rendered with the wiki section open under a duplicated
  title. Deriving the leftovers rather than everything also retires the ordering
  constraint that a promoted card had to be listed before the placeholder or
  lose its title.
