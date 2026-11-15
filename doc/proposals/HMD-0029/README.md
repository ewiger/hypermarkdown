# HMD-0029: Markdown files are cards

**Status**: drafted
**Created**: 2026-11-15
**Source**: [HQL's issue on the namespace root of a vault](https://github.com/ewiger/hql/blob/main/doc/issues/0079-the-namespace-root-of-a-vault.hmd),
which needs HQL and HyperMarkdown to agree on which files of a vault are cards

## Abstract

A file below the namespace root whose extension is `.md` or `.markdown` is a
card, a **Markdown card**, beside the `.hmd` card, which this record calls a
**HyperMarkdown card** where the two must be told apart. A Markdown card is a
link target and an embed target, carries a frontmatter block that is exposed
to consumers, and has heading anchors. Its body is CommonMark and is not
scanned: a `[[...]]` inside it is literal text. Binding a name tries `.hmd`,
then `.md`, then `.markdown`, and only then a folder note, which is `index`
with the same three extensions in the same order. Where two files in one
directory share a name, the earlier extension is the card at that name, the
later one is reachable only by a reference that writes its extension, and the
pair is reported as HMD018, a warning.

## Motivation

- **HQL and HyperMarkdown disagree on what a card is.** HQL reads `.md` and
  `.markdown` files as cards of type `MdCard` and HyperMarkdown ignores them, so
  `hmd lint` and `hql` resolve the same reference to different files, and the
  semantic index that HyperMarkdown's `hmd-semantics` builds for HQL has to copy
  HQL's rule rather than the format's.
- **A wiki starts as Markdown.** A team adopting HyperMarkdown has a directory of
  `.md` files. Today none of them can be linked to until each is renamed, and
  the rename changes how the file is read. With this record a HyperMarkdown card
  links to a Markdown file as it is, and a file is renamed when its author wants
  HyperMarkdown constructs in it.

The risk is a change of meaning in vaults that exist: a `.md` file inside a
namespace becomes a card, so a reference that was a forward reference can start
to resolve, and one that resolved through the sweep can become ambiguous.
*Backwards Compatibility* states both.

## Non-goals

- A Markdown card gains no HyperMarkdown construct. Wikilinks, embeds, block
  anchors and the reserved frontmatter keys stay the HyperMarkdown card's. The
  renaming rule in *CommonMark compatibility* is unchanged: renaming `.md` to
  `.hmd` can change how a file is interpreted.
- No setting turns Markdown cards off. A vault that wants a `.md` file to stay
  out of its namespace keeps the file outside the namespace root.

## Specification

### Card kinds

A card is one file below the namespace root with one of three extensions.

- A file with the extension `.hmd` is a **HyperMarkdown card**. Everything the
  specification says of a card holds for it unchanged.
- A file with the extension `.md` or `.markdown` is a **Markdown card**. It MUST
  be valid UTF-8.
- A file with any other extension MUST be ignored, as before.
- The **card extensions**, in priority order, are exactly:

```text
.hmd  .md  .markdown
```

The order is the one rule every later section uses: where two files compete
for one name, the earlier extension wins.

### What a Markdown card is

A Markdown card is addressable as a card and is read as CommonMark.

- A Markdown card MUST NOT be scanned. Its body yields no wikilink, no embed and
  no block anchor, and a `[[...]]` in it is text. Its author wrote Markdown, and
  reading HyperMarkdown into it would change what the author wrote.
- A Markdown card MAY open with a frontmatter block, under the same fence rule as
  a HyperMarkdown card. An implementation MUST expose the mapping to its
  consumers and MUST NOT interpret any key of it, the four reserved keys
  (`tags`, `use`, `import`, `nav`) included. A block that does not parse as a
  YAML mapping is treated as body text, not reported.
- A Markdown card's headings MUST be assigned slugs by the rule in *Heading
  anchors*, so a heading fragment matches a heading of a Markdown card as it
  matches one of a HyperMarkdown card. A block fragment `#^id` never matches a
  Markdown card, which has no block anchors.
- A Markdown card is not checked. No diagnostic is raised from its body; HMD018
  names it, but as the shadowed half of a pair.
- An embed of a Markdown card MUST transclude its body as CommonMark, with no
  HyperMarkdown expansion inside it.

### Binding a name in one directory

Binding tries the card extensions in priority order, then the folder note.

```text
bind(dir, parts, ext?) -> Resolved(path) | NotFound

  exts := [ext] if ext is given, else [".hmd", ".md", ".markdown"]

  for e in exts:
      file := dir / join(parts) + e
      if file exists:                         return Resolved(file)
  for e in exts:
      note := dir / join(parts) / ("index" + e)
      if note exists:                         return Resolved(note)
  return NotFound
```

- A `page_ref` MAY end in one of the card extensions. An implementation MUST
  strip it before matching and MUST then bind only that extension. Writing
  `.hmd` stays redundant but harmless; writing `.md` is how a reference reaches
  a Markdown card that a HyperMarkdown card of the same name shadows.
- A folder note is `index.hmd`, `index.md` or `index.markdown`. A directory
  holding more than one has one folder note, the earliest by priority, and the
  rest are shadowed as below. A Markdown folder note is addressed by its
  directory like any folder note, but since its frontmatter is not interpreted
  it sets no `use` and no `nav.visibility` for its subtree; inheritance reads
  `index.hmd` only.
- The file-before-folder-note rule and HMD012 are unchanged. A card and a folder
  note of the same name, of any extensions, are HMD012 and the file wins.

### Shadowing

Two files in one directory whose names differ only in their card extension
claim one name.

- The file with the earliest extension is the card at that name. Every other is
  **shadowed**: it is still a card, an unsuffixed reference never binds it, and a
  reference that writes its extension does.
- Each shadowed file MUST be reported once, as HMD018, a warning, at line 1
  column 1 of the shadowed file, naming the file that shadows it.

```text
HMD018 | warning | A card shadows a card of the same name with a later extension
message: "<shadowing path> shadows <shadowed path>; [[<name>]] means <shadowing path>"
```

A warning rather than an error, because the pair is a migration state that
resolves the same way every time; it is not ambiguous.

### Autodiscovery

The sweep sees Markdown cards, and does not see shadowed files.

- The sweep's candidates are the descendants with any card extension, less every
  shadowed file. A shadowed file is excluded so that a migration in progress does
  not turn a unique match into HMD002.
- `addressable_parts(p)` strips whichever card extension `p` has.

### Publishing

HyperMarkdown does not gate the publication of a Markdown card. The card is
published exactly where its file is, by whatever publishes Markdown files.

- A Markdown card's effective visibility is `public`. The opt-in gate exists so
  that a HyperMarkdown card's author decides whether it ships; a Markdown file
  in a site's sources already ships under the site's own rules, and a gate that
  defaulted it to private would remove pages a site publishes today.
- A publisher MUST NOT register a Markdown card as a page of its own. A link or
  an embed to one MUST point at the page the site builds from that file, and
  where the site builds none, it MUST render as an unresolved link.

## Backwards Compatibility

A vault with no `.md` or `.markdown` file inside its namespace root behaves
exactly as before. A vault with such files changes in three ways, and none needs a
migration step:

- a reference that was HMD001 (a forward reference) resolves if a Markdown card
  now carries the name;
- a reference that resolved through the sweep to one HyperMarkdown card is HMD002
  if a Markdown card elsewhere now carries the same name; the remedy, as for any
  HMD002, is to qualify the reference;
- a `README.md` inside the namespace is now a card named `README`.

The specification is at 0.1, drafted, so the change is made to 0.1 with a dated
entry in the language's changelog.

## Security Considerations

A Markdown card is read and never executed; nothing in it is scanned, so it adds
no construct and no new input surface beyond its frontmatter, which every
implementation already parses for HyperMarkdown cards under the same limits.

## Reference Implementation

- **Specification:** `doc/wiki/hmd-lang-spec.hmd`: *Documents*, *The namespace*,
  the `bind` pseudo-code, the algorithm's `stem` and sweep, *Fragments*, and
  HMD018 in *Diagnostics*.
- **Python, canonical:** `tools/hmd/src/hypermarkdown/resolve.py` (the extension
  list in place of `SUFFIX`, `bind`, the workspace walk, the sweep), the scanner
  entry that a Markdown card skips, `lint/rules.py` (HMD018, folder notes),
  `mkdocs_plugin.py` (links to `.md` targets).
- **Rust:** `tools/hmd-rs-core/src/{vault,scan,page,paths}.rs`; release as
  `hypermarkdown` 0.2.0.
- **TypeScript:** `tools/hmd-ts-core/src/{paths,parse,workspace}.ts`; the
  extension's preview, outline and link provider follow ts-core.
- **Semantic index:** `tools/hmd-semantics` walks the namespace root and takes all
  three extensions, so the text it hashes is the text HQL hashes.

## Test Plan

Conformance cases under `examples/conformance/cases/`, each `expected.json`
generated from the Python implementation, and run by all three runners:

- `markdown-card-target` — `[[guide]]` in a HyperMarkdown card resolves to
  `guide.md`; `[[guide#Install]]` matches its heading.
- `markdown-not-scanned` — a `[[missing]]` inside a `.md` file raises no HMD001
  and yields no resolution.
- `markdown-shadowed` — `owl.hmd` beside `owl.md`: `[[owl]]` resolves to
  `owl.hmd`, `[[owl.md]]` to `owl.md`, and `owl.md` is HMD018.
- `markdown-folder-note` — `birds/index.md` is the folder note of `birds/`;
  beside `birds/index.hmd` it is HMD018.
- `markdown-sweep` — a sweep finds a Markdown card in a sibling module; a sweep
  over `a/x.hmd` and `b/x.md` is HMD002; a sweep over `a/x.hmd` and `a/x.md`
  resolves to `a/x.hmd`.

```bash
uv run python -m pytest tools/hmd/tests/test_conformance.py
npm run -w @hypermarkdown/core test
cargo test --manifest-path tools/hmd-rs-core/Cargo.toml
```

## Changelog

- 2026-11-15: drafted
