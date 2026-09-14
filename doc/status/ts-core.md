# STATUS — `@hypermarkdown/core`

`tools/hmd-ts-core` — the TypeScript implementation of the format: scanner,
parser, slugs, resolver, expansion, renderer, and the sixteen lint rules. It is
a second implementation held against the canonical one by a shared conformance
corpus, not extension code. Its consumer is tracked in
[`vsc-ext.md`](vsc-ext.md); the canonical line is [`hmd.md`](hmd.md), the format
itself [`lang.md`](lang.md), and the site [`pages.md`](pages.md).

**This file is the only place work on the core is tracked.** Not the memos under
`doc/memory/`, not the cards under `doc/wiki/`, not the proposals themselves. A
decision that needs discussion is named here as an open question and argued
wherever it belongs; nothing else may hold a task list. Update the row in the
same commit that changes the code.

Specified by [HMD-0020](../proposals/HMD-0020/README.md), with diagrams by
[HMD-0022](../proposals/HMD-0022/README.md).

**States** — `done` shipped and gated by a test · `ready` specified, unblocked,
not started · `blocked` waiting on a decision · `parked` started and set aside ·
`open` undecided · `deferred` deliberately not being decided now ·
`standing` an accepted limitation · `lifted` no longer true.

**Snapshot** (2026-09-14) — C1–C7 done, 107 tests green. The core parses,
resolves, expands, and renders, and its diagnostics are byte-identical to
`hmd lint` on `examples/small`, `examples/cs-alg-sorting`, and `doc/wiki` for
every rule it implements. Every divergence is ledgered in
`conformance-xfail.json`, and an entry that stops diverging fails the build.
What is left is one real gap — the publication model, and HMD017 with it — plus
two small format divergences now owned as work rather than as prose in a README.

## Done

| ID | Milestone | Gate |
| --- | --- | --- |
| C1 | Scaffold | `npm run -w @hypermarkdown/core typecheck` |
| C2 | Scanner, grammar, slugs, frontmatter | `test/scan.test.ts`, `test/parse.test.ts` |
| C3 | Four-phase resolver and workspace index | `test/resolve.test.ts` |
| C4 | Lint rules HMD001–HMD016 | `test/parity.test.ts` |
| C5 | Conformance corpus and ledger | `test/corpus.test.ts` |
| C6 | IR, expansion, markdown-it renderer | `test/render.test.ts` |
| C7 | Callouts, math, D2 diagrams | `test/extensions.test.ts` |

| ID | Work point | Spec | State |
| --- | --- | --- | --- |
| C2.1 | `scan.ts` — masking, offset preservation, construct finders | HMD-0020 §3 | done |
| C2.2 | `slug.ts` — the `toc` slugify and dedup algorithm | §4 | done |
| C2.3 | `frontmatter.ts` — `---` fence, `js-yaml` under JSON_SCHEMA, reserved keys | §5 | done |
| C2.4 | `parse.ts` — the grammar of HMD-0001 §2, never throwing on partial input | §3, §7 | done |
| C3.1 | `workspace.ts` — phases 0–3, spine walk, sweep, folder notes | §6 | done |
| C3.2 | `WorkspaceHost` port; no Node builtins in `src/` | §1 | done |
| C4.1 | `lint.ts` — all 16 rules, sorted, no new rule IDs | §9 | done |
| C5.1 | `examples/conformance/cases/` generated from the canonical implementation | §10 | done |
| C5.2 | `conformance-xfail.json`, ledger honoured, a passing entry fails the build | §10 | done |
| C6.1 | `expand.ts` — page, `#Section`, `#^id`, depth 16, cycle stack | §8 | done |
| C6.2 | `render.ts` — sentinel substitution, per-block `data-line`, block keys | §3, §7 | done |
| C6.3 | `graph.ts` — nodes, edges, reverse edge map for backlinks | HMD-0021 §9 | done |
| C6.4 | `parse/callout.ts` — `!!!` admonitions and `???`/`???+` details | §3.3 | done |
| C7.1 | `parse/math.ts` — KaTeX with arithmatex smart-dollar semantics | §3.3 | done |
| C7.2 | `diagram/fence.ts` — fence detection, shared bounds, cache key | HMD-0022 §1 | done |
| C7.3 | `diagram/sha256.ts` — sync digest, no Node builtins | HMD-0022 §3 | done |
| C7.4 | `DiagramBlock`, `IR_VERSION` 2 | HMD-0022 §1 | done |

## TODO

### Planned work

| ID | State | Work point | Blocked on |
| --- | --- | --- | --- |
| C4.2 | blocked | **The publication model, and HMD017 with it.** `nav` as a mapping of `order` and `visibility` in `frontmatter.ts`, `NavConfig` in `model.ts`, a `visibility` walk in `workspace.ts` modelled on `autodiscoveryEnabled`, and the rule in `lint.ts` — four files, reproducing the canonical behaviour byte for byte and keeping the embed predicate caller-supplied | Q1 |
| C7.5 | ready | **`~x~` subscript.** Not a math gap: the site gets it from `pymdownx.tilde`, and markdown-it's builtin covers only `~~strikethrough~~`. One line in `createMarkdownIt` plus `markdown-it-sub`, a new dependency, then the `pymdownx-tilde-subscript` ledger entry is deleted and HMD-0020 §3.3's row flips to yes | nothing |
| C2.5 | blocked | **Setext headings in `scan.ts`**, landing in the same change as `scan.py` so parity never sees one side alone | [`lang.md` T1](lang.md#planned-work) |
| C7.6 | ready | **Block-level LaTeX environments.** `blockMath` requires a line that trims to `$$`, so a bare `\begin{align}` block renders as prose here and as math on the site. Unledgered, and the likeliest real-world hit of the KaTeX/MathJax gap | nothing |

### Broken

| ID | State | Defect | Impact |
| --- | --- | --- | --- |
| — | — | None open | — |

### Limitations

| ID | State | Limitation | Why it stands |
| --- | --- | --- | --- |
| L1 | standing | **Raw HTML in a card is escaped** rather than passed through | Deliberate, and a divergence from the MkDocs build: the consumer is a webview, and rendering HTML out of a workspace is a script-injection surface reachable from any cloned repository. Changing it would need a sanitiser and a spec amendment, not a flag |
| L2 | standing | **Math is typeset by KaTeX** rather than MathJax | Bundled size and no network at render time. KaTeX covers a subset of LaTeX, renders unsupported commands in red under `throwOnError: false`, and blocks `\href` under `trust: false`. Ledgered as `katex-vs-mathjax` |
| L3 | standing | **HMD017 is never reported** | The publication model behind it is unported — C4.2. Ledgered under `rules`, so parity drops it from the canonical side and compares every other rule byte for byte; the suite fails if this implementation ever emits it, so the ledger cannot go stale |
| L4 | standing | The ledger's `rendering` array is documentation, nothing executes it | `corpus.test.ts` reads only `cases` and `parity.test.ts` only `rules`. A rendering divergence is recorded and unguarded |

Note that L3's divergence is latent rather than active: `doc/wiki` cleared its
six HMD017 warnings by de-linking rather than by settling the policy, so no
fixture triggers the rule today and parity would pass even with the ledger entry
removed. The entry stays because the rule is genuinely unimplemented — the
moment a published card links to a private one again, the canonical side warns
and this one stays silent.

### Open questions and blockers

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | Which proposal owns publication in the TypeScript core? HMD-0020 §9 specifies HMD001–HMD016 and says nothing about publication, which is HMD-0002's. The port needs that amendment before it is written — tracked as [`lang.md` T2](lang.md#planned-work) |
| Q2 | deferred | Should the port wait for [issue 0008](../issues/0008-private-card-link-policy.md)? What HMD017 *should* do is unsettled on the canonical side — blocked link, unlisted page, or nothing, configurable per site — and porting today's warning now could mean porting it twice. The counter-argument is that byte-for-byte parity with the canonical implementation is the contract, whatever it later becomes |
| Q3 | open | Does the TypeScript `GraphNode` need to match `hmd graph --format json` exactly? It carries `headings` as a count where the canonical side emits objects, plus no `frontmatter`, `anchors`, or `imports`. HMD-0021 §10 says the graph tab consumes "the same data", which the shapes do not quite satisfy |

## Gates

```bash
npm run -w @hypermarkdown/core typecheck
HMD_REQUIRE_PARITY=1 npm test -w @hypermarkdown/core
```

Parity shells out to `uv run hmd lint --format json` over `examples/small`,
`examples/cs-alg-sorting`, and `doc/wiki`, and skips only when the canonical
implementation is absent — unless `HMD_REQUIRE_PARITY` is set, which CI does.

## Changelog

- 2026-09-14: split out of `doc/vsc-ext/STATUS.md`, which tracked the core and
  the extension in one file. C5.3, the Python corpus runner, moved to
  [`hmd.md`](hmd.md), where the work actually lands. C7.5, C7.6, and C2.5 are
  new: they were carried as "known gaps" prose in the extension's README, which
  is a user-facing page and not a tracker — and one of them was recorded
  backwards there, since neither implementation indexes setext headings.
