# Conformance corpus

Language-neutral fixtures shared by every implementation of HyperMarkDown.
Specified by [HMD-0020](../../doc/proposals/HMD-0020/README.md) §10.

This corpus is what replaces principle P5 (*one implementation*). Two
implementations of one grammar drift silently unless something fails loudly;
this is the something.

## Canonicity

The Python package under [`tools/hmd/src/hypermarkdown/`](../../tools/hmd/src/hypermarkdown/) is
**canonical**. Where implementations disagree on a case this corpus covers,
Python defines the correct answer and the other implementation carries the bug.
Canonicity is about arbitration, not quality: it exists so that "which one is
right?" is never a discussion.

Every `expected.json` here was generated from the canonical implementation —
`hmd lint --format json` for diagnostics, `hmd graph --format json` for
resolutions — never written by hand.

## Layout

```text
examples/conformance/cases/<case-name>/
  tree/           the input namespace: cards (.hmd, .md, .markdown) and directories
  config.toml     optional; the case's .hmd/config.toml
  expected.json   { diagnostics: [...], resolutions: [...] }
```

A case whose links hold addresses of more than one step also carries
`addresses`: for each, sorted by `(source, raw)`, the byte span it selects in
its target with that span's `text` and `digest`, or the `rule` it failed on.

`diagnostics` is in the sort order of HMD-0001 §8 — `(path, line, column,
rule)`. `resolutions` maps `(source, raw)` to a resolved root-relative path or
`null`, sorted. Both are plain data, so neither implementation's object model
leaks into the contract.

## Cases

| Case | What it pins |
| --- | --- |
| `spine-nearest` | A nearer card on the spine beats a distant one |
| `ambiguous-sweep` | Two sweep matches are HMD002, never a tie-break |
| `folder-note-collision` | `foo.hmd` beside `foo/index.hmd` is HMD012 |
| `indented-not-code` | An indented `[[link]]` is found; fenced, commented, and code-span links are not |
| `imports-alias` | `import … as` binds the alias; heading and block fragments check |
| `embed-cycle` | A two-card embed cycle is HMD007 |
| `markdown-card-target` | `[[guide]]` reaches `guide.md`, and a heading fragment checks against it |
| `markdown-not-scanned` | A `[[link]]` inside a `.md` file is text: no HMD001, no resolution |
| `markdown-shadowed` | `owl.hmd` beside `owl.md`: `[[owl]]` is the `.hmd`, `[[owl.md]]` the `.md`, and HMD018 |
| `markdown-folder-note` | `index.md` is a folder note; beside `index.hmd` it is HMD018 |
| `markdown-sweep` | The sweep finds a Markdown card, is HMD002 across modules, and skips a shadowed file |
| `heading-after-frontmatter` | A heading on the line right below the fence is addressable |
| `address-steps` | Every step kind resolves to its span: heading paths, anchors, each block unit, short forms, sentences, words, lines, and an embed that quotes |
| `address-diagnostics` | HMD019 to HMD023, and HMD004 and HMD005 from a step inside an address |
| `nested-vault` | A directory carrying its own `.hmd/` is another vault: none of its cards load, so a name it shares is not HMD002 |

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
beside each implementation that is not the canonical one —
[`tools/hmd-ts-core/conformance-xfail.json`](../../tools/hmd-ts-core/conformance-xfail.json)
and
[`tools/hmd-rs-core/conformance-xfail.json`](../../tools/hmd-rs-core/conformance-xfail.json)
— each entry naming the case, the reason, and where it is tracked. **A ledger entry
that passes fails the build** — an expected failure that starts succeeding and
is not removed is how a ledger rots into a lie.
