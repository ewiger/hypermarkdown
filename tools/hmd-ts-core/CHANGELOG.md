# Changelog — `@hypermarkdown/core`

Notable changes to the TypeScript implementation, newest first. This file covers
**this package only**; the other tools in the monorepo version themselves and
keep their own changelogs, and [the repository's index](../../CHANGELOG.md)
lists them.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with
the usual `0.x` caveat: **the format itself may change between minor versions.**

Published to npm as
[`@hypermarkdown/core`](https://www.npmjs.com/package/@hypermarkdown/core), and
released on its own tag — `ts-core-vX.Y.Z`, where the extension uses
`vsc-ext-vX.Y.Z` and the Python tool `vX.Y.Z`. The VS Code extension resolves
this package from the workspace and bundles it, so a version here is not
something the extension waits for. Implementation state is tracked per work
point in
[`doc/status/ts-core.md`](../../doc/status/ts-core.md), against
[HMD-0020](../../doc/proposals/HMD-0020/README.md).

## [Unreleased]

The HyperMarkDown 0.1 rules for encoding, the lexical model, and heading
anchors, matching the canonical implementation case for case.

### Added

- **HMD012 is a warning.** A card beside a module's folder note of the same name
  shadows the note, which stays reachable by its `index` path; like HMD018,
  that is a shadow decided by a fixed order, not a content bug.
- **An anchored repeat heading is not HMD011.** A heading whose key equals an
  earlier one's is reported only when it carries no block anchor, as in the
  canonical implementation.
- **Setext headings are headings.** `Setup` over a line of `===` or `---` is
  indexed and addressable like `# Setup`, at level 1 or 2, and ends an embedded
  section the way an ATX heading does. A `---` after a blank line is still a
  thematic break, and no line inside a fence, a comment, a block quote, a list
  item, an HTML block, or indented code is ever part of one.
- **HMD019**, an error: a file with a card extension that is not valid UTF-8,
  reported at line 1, column 1 with the first byte that cannot be decoded. The
  file is then not a card: not parsed, not a page, not a link target.
  `Workspace.undecodable()` lists them, and `Workspace.addUndecodable` records
  one for a host that feeds files incrementally.
- `WorkspaceHost.readBytes`, optional and preferred when present: the core
  decodes the bytes itself, fatally, which is the only way it can tell a file
  that is not UTF-8. `MemoryHost` takes bytes as well as text. `decodeCard`,
  `cardText`, and `firstInvalidByte` are exported.
- `headingKey`, `caseFold`, `nfc`, `visibleText`, `headingContent`,
  `columnOffset`, and `splitLines` are exported, and `findHeading` replaces
  `headingSlugs`. Full case folding comes from a table generated from the
  canonical implementation's `str.casefold` by `scripts/casefold.py`, because
  `toLowerCase` is a different mapping: it leaves `ß` alone and keeps final
  sigma apart.

### Changed

- **An unclosed `[[` is text, not HMD010.** A `[[` with no `]]` after it on
  its line, or with a `[` or `]` first, begins no link and is ordinary
  Markdown, so a matrix in maths such as `$[[1,2],[3,4]]$` no longer reports an
  error. A link that is closed but malformed is still HMD010.
  `findUnterminated` is gone from the scanner.
- **`:` is reserved in a link target**, for namespace-qualified references
  such as `[[namespace:article]]`. A target containing one is HMD010.
- **A heading fragment matches by key, not by slug.** The key is the text in
  NFC, case-folded, with every character that is not a letter, mark, or number
  turned into a space and the spaces collapsed: `[[card#ошибка 404]]` reaches
  `# Ошибка 404!`, `[[card#STRASSE]]` reaches `Straße`, and `[[card#Cafe]]` no
  longer reaches `Café`. A fragment matches the first heading with its key;
  the `_1` suffix that reached a repeat is gone, and a repeat is reached by a
  block anchor on its line.
- **HMD011 reports headings with the same key**, at each repeat, naming the
  line of the heading a fragment reaches instead, in the canonical wording.
- **HMD004 names the fragment as written**, `has no heading '#Cafe Menu'`.
- A heading's text is what a reader sees, inline markup removed: `## The *fast*
  path` is `The fast path`. `Heading.slug` is replaced by `Heading.key`, and the
  IR moves to version 4: `HeadingRef` and `FragmentRef` carry a `key` in place
  of a `slug`.
- **Columns count code points; span offsets count UTF-8 bytes** from byte 0
  of the card. `Span.index` and `Span.indexEnd` keep the UTF-16 range for
  slicing the text.
- **A line ends at `\n`, `\r\n`, or a lone `\r`**, in the scanner, the
  frontmatter fence, expansion, and the renderer. A form feed or U+2028 does
  not end one, and a code span cannot cross a blank line in any of the three
  spellings.
- **A leading byte-order mark is ignored**, so frontmatter after one is
  frontmatter.
- **Names compare in NFC**: a reference and a name on disk match whether
  either is stored composed or decomposed, for cards, import origins, and the
  folder-note collision check. Of two files whose names are one name in NFC,
  the first in sorted order is the card.
- An anchor on a heading's line names that heading: `![[b#^linux]]` on
  `## Linux ^linux` embeds the whole section, as `![[b#Linux]]` does. A block
  anchor's span ends at its id, and no anchor is ever rendered, in the card
  itself or embedded; one inside a code fence is code.

### Removed

- `slugify`, `slugFor`, and `unique`, the Python-Markdown `toc` slugger. The
  language no longer matches by slug, and the renderer gives headings no id.

### Fixed

- Columns after a character outside the Basic Multilingual Plane, and setext
  headings, now agree with the canonical implementation; the
  `astral-plane-columns` and `setext-headings` entries leave the divergence
  ledger.
- `frontmatter must be a mapping, got str` names a scalar's type the way the
  canonical implementation does, where it said `string`.
- An embed of a section no longer reports a false cycle. The HMD007 check
  followed every embed in the embedded card, where an embed of a heading or a
  block expands that region only, so one section of a card embedding another
  section of the same card was reported as HMD007.

## [0.3.0] — 2026-11-15

### Added

- **Markdown cards** ([HMD-0029](https://github.com/ewiger/hypermarkdown/blob/main/doc/proposals/HMD-0029/README.md)).
  `.md` and `.markdown` files load as cards of `kind` `"markdown"`: a reference
  resolves to one and its headings are addressable, but its body is not
  scanned and not linted. `parse` dispatches on the path; `parseMarkdown`,
  `isMarkdownCard`, `CARD_SUFFIXES` and `cardSuffix` are exported.
- **HMD018**, a warning, and `Workspace.shadowedBy`: a card shadowed by one of
  the same name with an earlier card extension.

### Changed

- Binding tries `.hmd`, `.md`, `.markdown`, then the folder note in the same
  order; a written extension binds only itself, a name with a dot binds whole
  (`[[v1.2]]` is `v1.2.hmd`, not `v1.hmd`), and a shadowed card is never an
  autodiscovery candidate. `withHmdSuffix` keeps a name that already ends in a
  card extension.

### Fixed

- A heading right below the frontmatter fence is a heading. The fence was
  blanked together with its line breaks, so the first body line read as
  indented and the heading was lost.

## [0.2.0] — 2026-11-13

### Added

- **HQL cells.** `CellBlock` joins the IR, which moves to version 3. A
  `hql#eval` or `hql#query` fence becomes a cell carrying its source, its hash,
  and the output saved after it, rendered as the card's own Markdown; a bare
  `hql` fence stays a code block, and an `hql#query` cell is hidden.
  `scanCells`, `maskForHql` and `outputEdit`
  find cells by HQL's own rule, compute the hash HQL computes, and write an
  output back in the bytes `hql render` writes.

### Fixed

- **A nested vault is no longer swept into the vault around it.** A directory
  below the namespace root that carries its own `.hmd/` is another vault:
  `Workspace.load` does not descend into it, `addDocument` ignores a card
  beneath it, and an import naming a directory inside it is HMD015. The new
  `inNestedVault(rel)` lets a host that feeds cards incrementally skip them
  before parsing. Parity with `hypermarkdown` 0.3.1.

## [0.1.1] — 2026-08-10

### Fixed

- **Every link in the README is absolute.** Nine were relative, and all nine
  were dead on the package page from the moment `0.1.0` published: npm rewrites
  a rendered README's relative links against the *repository root* and ignores
  `repository.directory`, so `../../doc/…` from this subdirectory resolves above
  the root. The release workflow now extracts the packed tarball and fails if
  any link is relative, which is the same guard the extension already had for
  `vsce` and the same rule the Python distribution records for PyPI.

  A README is re-rendered only when a version is published, so this is what
  replaces `0.1.0`'s page rather than a fix that could be applied in place.

### Changed

- Packing builds first, via `prepack`, and `publishConfig.access` is `public`.
  `dist` is gitignored and `files` ships it, so a pack without a build was four
  files with no code and a `main` pointing at nothing.

## [0.1.0] — 2026-08-10

First release, published by hand: npm's trusted publishing is configured per
package and a package has to exist before it can be configured, so the bootstrap
could not be tokenless. Every version after this one is published by
`release-ts-core.yml` with no stored credential.


### Added

- **Scanner and grammar.** Masking that preserves offsets, the `toc` slug and
  dedup algorithm, `---` frontmatter under `js-yaml`'s JSON schema, and a parser
  that never throws on partial input — a preview that renders while you type has
  no valid document to wait for.
- **The four-phase resolver** and a workspace index: explicit imports, the spine
  walk, imported search paths, then one whole-tree sweep, with folder notes
  addressable under both of their names.
- **`WorkspaceHost`, the filesystem port.** The package imports no Node
  builtins, so it runs in a browser, in a web extension, and in an in-memory
  test with no temporary directory. `MemoryHost` ships for tests.
- **Lint rules `HMD001`–`HMD016`**, sorted, emitting no rule ID the canonical
  implementation does not define.
- **The document IR, embed expansion, and a `markdown-it` renderer.** Ordinary
  GFM is an opaque HTML island; every HyperMarkDown construct survives as a
  typed node, so no consumer can lose an embed boundary by treating it as text.
  Blocks are keyed by content and sibling occurrence rather than by line number,
  which is what lets a live view be patched instead of rebuilt, and every
  block-level element carries `data-line` for scroll sync and click-through.
- **A link graph** with a reverse edge map, for backlinks.
- **Callouts, math, and D2 diagrams** — `!!!` admonitions, `???`/`???+` details,
  KaTeX with arithmatex smart-dollar semantics, and diagram fences carrying a
  content-addressed cache key. `IR_VERSION` is 2.
- **The conformance corpus runner and its ledger.** `npm test` runs the shared
  corpus at [`examples/conformance/`](../../examples/conformance/) plus a parity check that shells
  out to `hmd lint` and requires byte-identical diagnostics on `examples/small`,
  `examples/cs-alg-sorting`, and `doc/wiki`. A ledgered case that starts passing
  fails the build, so the ledger cannot rot into a lie.
- **`HMD_REQUIRE_PARITY`.** The parity suite skips when no Python is present,
  which is right on a contributor's laptop and wrong anywhere the canonical
  implementation is installed on purpose. With the variable set it fails instead,
  and CI sets it.

### Known divergences

Ledgered in [`conformance-xfail.json`](conformance-xfail.json), which carries the
reason for each: `HMD017` and the publication model behind it are unported; raw
HTML is escaped rather than passed through, deliberately, because a webview
rendering workspace HTML is a script-injection surface; `~x~` subscript is
unsupported; setext headings are recognised here and not by the canonical
scanner, so their slugs are not addressable; column numbers count UTF-16 code
units here and code points in Python, which can differ by one per astral
character; and math is typeset by KaTeX rather than by the site's MathJax.

### Documentation

- This package carries its own README, changelog, and license, rather than
  borrowing the repository's.

[Unreleased]: https://github.com/ewiger/hypermarkdown/compare/ts-core-v0.2.0...HEAD
[0.2.0]: https://github.com/ewiger/hypermarkdown/compare/ts-core-v0.1.1...ts-core-v0.2.0
[0.1.1]: https://github.com/ewiger/hypermarkdown/compare/ts-core-v0.1.0...ts-core-v0.1.1
[0.1.0]: https://github.com/ewiger/hypermarkdown/releases/tag/ts-core-v0.1.0
