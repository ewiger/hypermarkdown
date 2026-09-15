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
  tree/           the input namespace: .hmd files and directories
  config.toml     optional; the case's .hmd/config.toml
  expected.json   { diagnostics: [...], resolutions: [...] }
```

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

## Runners

- **TypeScript** — `tools/hmd-ts-core/test/corpus.test.ts`, part of
  `npm run -w @hypermarkdown/core test`.
- **Python** — not yet written. It belongs in `tools/hmd/tests/`, beside the
  implementation it would check, and is unclaimed rather than blocked.

## The ledger

Divergence is permitted. Silence is not. Known differences live in
[`tools/hmd-ts-core/conformance-xfail.json`](../../tools/hmd-ts-core/conformance-xfail.json),
each naming the case, the reason, and where it is tracked. **A ledger entry
that passes fails the build** — an expected failure that starts succeeding and
is not removed is how a ledger rots into a lie.
