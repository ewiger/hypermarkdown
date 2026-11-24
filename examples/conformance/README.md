# Conformance corpus

Language-neutral fixtures shared by every implementation of HyperMarkDown.
Specified by [HMD-0020](../../doc/proposals/HMD-0020/README.md), under its
conformance, canonicity, and drift-ledger section.

This corpus is what replaces principle P5 (*one implementation*). Two
implementations of one grammar drift silently unless something fails loudly;
this is the something.

## Authority

The [language specification](../../doc/wiki/hmd-lang-spec.hmd) is the
authority. Every case states what the specification requires, and every
implementation is checked against the cases, Python included. When the
specification, a case, and an implementation disagree, the disagreement is
investigated and resolved: a wrong implementation is fixed, a wrong case is
corrected, and a question the text does not answer becomes an open row in
[the language tracker](../../doc/status/lang.md). No implementation defines
the correct answer.

The Python package under [`tools/hmd/src/hypermarkdown/`](../../tools/hmd/src/hypermarkdown/)
is the reference implementation: the first to be held to every case, and the
one that carries no ledger. That makes it the most complete implementation, not
the arbiter.

The older cases were generated from Python, with `hmd lint --format json` for
diagnostics and `hmd graph --format json` for resolutions, and then checked
against the text. The `resolve-*` cases and every case added since 0.1 are
written by hand from the specification. A generated `expected.json` is a
draft until someone has read it against the text.

## Layout

```text
examples/conformance/cases/<case-name>/
  tree/           the input namespace: cards (.hmd, .md, .markdown) and directories
  config.toml     optional; the case's .hmd/config.toml
  expected.json   { diagnostics: [...], resolutions: [...] }
```

`diagnostics` is in the specification's diagnostic sort order — `(path, line,
column, rule)`. `resolutions` maps `(source, raw)` to a resolved root-relative path or
`null`, sorted. Both are plain data, so neither implementation's object model
leaks into the contract.

## Cases

| Case | What it pins |
| --- | --- |
| `spine-nearest` | A card in a nearer directory, the card's own or a closer parent, beats a distant one |
| `ambiguous-sweep` | Two matches in the recursive search are HMD002, never a tie-break |
| `folder-note-collision` | `foo.hmd` beside `foo/index.hmd` is HMD012, a warning |
| `indented-not-code` | An indented `[[link]]` is found; fenced, commented, and code-span links are not |
| `imports-alias` | `import … as` binds the alias; heading and block fragments check |
| `embed-cycle` | A two-card embed cycle is HMD007 |
| `markdown-card-target` | `[[guide]]` reaches `guide.md`, and a heading fragment checks against it |
| `markdown-not-scanned` | A `[[link]]` inside a `.md` file is text: no HMD001, no resolution |
| `markdown-shadowed` | `owl.hmd` beside `owl.md`: `[[owl]]` is the `.hmd`, `[[owl.md]]` the `.md`, and HMD018 |
| `markdown-folder-note` | `index.md` is a folder note; beside `index.hmd` it is HMD018 |
| `markdown-sweep` | The recursive search finds a Markdown card, is HMD002 across modules, and skips a shadowed file |
| `heading-after-frontmatter` | A heading on the line right below the fence is addressable |
| `nested-vault` | A directory carrying its own `.hmd/` is another vault: none of its cards load, so a name it shares is not HMD002 |
| `heading-keys-unicode` | Fragments match headings by their normalised identifier across scripts: Cyrillic, accented Latin, CJK, and full case folding (`STRASSE` reaches `Straße`); `Cafe` does not reach `Café`, HMD004 |
| `heading-duplicates` | Headings with equal normalised identifiers are HMD011 at each repeat without an anchor; a fragment reaches the first, and an anchored repeat is reached by `#^id` and not reported |
| `setext-headings` | `Title` over `===` or `---` is addressable; a `---` after a blank line and an underline inside a fence are not headings, HMD004 |
| `column-code-points` | A column counts code points: an emoji and accented letters before the link put it at 13, not at its byte or UTF-16 offset |
| `invalid-utf8` | A card file that is not UTF-8 is HMD019 at 1:1 and is not a card, so a link to it is HMD001 |
| `bom-frontmatter` | A leading byte-order mark is ignored, so the `---` after it opens frontmatter whose `use` turns the recursive search off |
| `resolve-absolute-relative` | Absolute references start at the namespace root; explicit relative ones start at the referring card's directory, not the working directory; leaving the root is HMD003 |
| `resolve-unix-separators` | `/` separates path components on every platform |
| `resolve-explicit-extension` | A written card extension binds only that extension, in every phase |
| `resolve-extension-priority` | Without a written extension, `.hmd` beats `.md` beats `.markdown`, and the losers are shadowed |
| `resolve-folder-note-collision` | A card beside a module's folder note of the same name is the one at that name, the note stays reachable by its `index` path, and HMD012 is a warning |
| `resolve-directory-references` | `[[./]]` and `[[../]]` resolve only to a folder note |
| `resolve-named-import` | A named import is checked first, and one whose card has another extension falls through |
| `resolve-wildcard-import` | Imported search paths are probed in order after the card's directory and its parents; a shadowed match is HMD016 |
| `resolve-path-suffix` | An unqualified reference of one or more components matches the ending path components of a card, never a string suffix |
| `resolve-mode-recursive` | `mode = "recursive"` limits the recursive search to the referring card's directory and below |
| `resolve-autodiscovery-off` | `use: no_autodiscovery` turns the recursive search off for a card and, from a folder note, for its subtree |
| `resolve-autodiscovery-off-project` | `autodiscovery = false` in the project configuration turns it off everywhere a card does not turn it back on |
| `resolve-ambiguous-order` | Several matches in the recursive search are HMD002, with candidates sorted by code point |
| `resolve-duplicate-candidates` | Two paths reaching one card are one candidate |
| `resolve-containment-symlinks` | A reference that leaves the namespace root, by `..` or through a symbolic link, is HMD003 |
| `resolve-nested-vault` | A path into a nested vault is HMD003, and none of its cards is a candidate |
| `resolve-unicode-nfc` | Names are compared after NFC normalisation, case-sensitively, and not under NFKC |
| `resolve-fragments` | Heading and block fragments are checked against the resolved card and never change which card it is |
| `grammar-display` | A display after a page reference and after either fragment, a <code>&#124;</code> inside a display, an embed with a display, and an unresolved link with its display |
| `grammar-block-ids` | Block identifiers of 1 and 64 characters, `_` and `-` after the first character, a leading digit, upper case, and a `^mid` followed by text, which is no anchor (HMD005) |
| `grammar-reference-forms` | Absolute, both explicit relative forms, a bare name, an unqualified path, an embed, `^` inside a heading fragment after its first character, and `!![[x]]` as an embed |
| `grammar-fences` | `~~~` fences, an info string, a longer fence an inner shorter one does not close, and a fence indented three spaces |
| `grammar-code-spans-and-comments` | A double-backtick code span holding a backtick, a multi-line HTML comment, and an unmatched backtick that stays literal |
| `grammar-line-endings` | `\r\n` and a lone `\r` count as line endings in diagnostics and headings; `.gitattributes` keeps the bytes as written |
| `grammar-frontmatter-position` | `---` at byte 0 opens frontmatter; after a blank line or a space it does not |
| `frontmatter-not-mapping` | A list as frontmatter is HMD009; a `.md` card's broken frontmatter is body text, not HMD009 |
| `frontmatter-invalid-yaml` | Frontmatter that is not valid YAML is HMD009 |
| `tags-malformed` | A scalar `tags`, and a non-string entry, are HMD013 |
| `use-unknown-feature` | `use: [no_discovery]` is HMD013; `no_autodiscovery` is not |
| `nav-malformed` | A scalar `nav`, an unknown key, a non-integer `order`, and an unknown `visibility` are HMD013 |
| `import-malformed` | `import tokens from /shared` is HMD014; the well-formed import binds |
| `import-unresolved` | A missing import directory, a missing card, and one name bound twice are HMD015 |
| `publication-private-link` | A published card linking to and embedding an unpublished one is HMD017, twice; a private card linking to it is not |
| `cells` | A link inside an `hql#eval` body or a plain `hql` listing yields nothing; a link between the output markers resolves |

## Runners

- **TypeScript** — `tools/hmd-ts-core/test/corpus.test.ts`, part of
  `npm run -w @hypermarkdown/core test`.
- **Rust** — `tools/hmd-rs-core/tests/corpus.rs`, part of `cargo test` in
  `tools/hmd-rs-core/`. It compares `resolutions` only: the crate is a resolver
  and emits no diagnostics.
- **Python** — `tools/hmd/tests/test_conformance.py`, part of
  `uv run python -m pytest`. A case's `config.toml` is copied in as the tree's
  `.hmd/config.toml`; a marker further down the tree is part of the case.

## The ledger

Divergence is permitted. Silence is not. Known differences live in a ledger
beside each implementation other than the reference one —
[`tools/hmd-ts-core/conformance-xfail.json`](../../tools/hmd-ts-core/conformance-xfail.json)
and
[`tools/hmd-rs-core/conformance-xfail.json`](../../tools/hmd-rs-core/conformance-xfail.json)
— each entry naming the case, the reason, and where it is tracked. **A ledger entry
that passes fails the build** — an expected failure that starts succeeding and
is not removed is how a ledger rots into a lie.
