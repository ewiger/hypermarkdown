# STATUS — `@hypermarkdown/core`

`tools/hmd-ts-core` — the format in TypeScript: scanner, parser, heading slugs,
frontmatter, resolver, embed expansion, renderer, and the diagnostics. It is a
**second implementation**, not helper code for the editor: it exists so the
format can be read where Python cannot go — inside an editor, at a keystroke's
notice — and it is held to the canonical implementation by a shared corpus of
cases, with every difference written down.

Beside this file: the format itself in [`lang.md`](lang.md), the canonical
implementation in [`hmd.md`](hmd.md), the editor that embeds this one in
[`vsc-ext.md`](vsc-ext.md), and the website in [`pages.md`](pages.md).

## Status

**Complete for everything except publication, and agreeing with the canonical
implementation byte for byte on everything it implements.** Cards parse,
resolve, expand, and render; all sixteen diagnostics are there; callouts, math,
and D2 diagrams work. 107 tests, and the agreement is checked by linting three
real trees — the wiki and two example vaults — against the canonical linter and
comparing the output exactly.

**The one real gap is the publication model**: the frontmatter key that says
whether a card is published, the rule that it inherits from folder notes, and
the warning when a published card links to a private one. It is blocked, not
forgotten — the proposal that specifies this implementation stops at sixteen
rules and the seventeenth belongs to a different proposal, so the port needs
that settled first.

Two smaller differences from the website are now work rather than footnotes:
subscript, and LaTeX environments written without dollar signs.

## Open

| Status | Work | Notes |
| --- | --- | --- |
| blocked | **The publication model, and the rule that depends on it.** Parse `nav` as a mapping of order and visibility, inherit visibility from the nearest ancestor folder note defaulting to private, and warn when a published card links to or embeds an unpublished one. Four files; reproduce the canonical behaviour exactly and keep the embed veto a decision the caller passes in, so a later policy change has somewhere to land | Blocked on which proposal owns publication here: this implementation's spec stops at sixteen rules and this is the seventeenth (HMD-0002 §2, rule HMD017) |
| todo | **Subscript.** `~x~` is subscript on the website and nothing here — not a math gap at all: it comes from a markdown extension, and markdown-it's builtin covers only `~~strikethrough~~`. One line to wire in `markdown-it-sub`, a new dependency | Then the ledgered difference is deleted, because a ledger entry that stops diverging fails the build |
| todo | **LaTeX environments at block level.** `\begin{align}` on its own is math on the website and prose here, because this implementation only recognises a block that opens with `$$`. The likeliest real-world hit of the KaTeX-versus-MathJax difference, and the only one not written down | Not currently ledgered |
| blocked | **Underlined headings.** Neither implementation indexes them, so a link to one fails on both while a built site anchors it anyway. If the format decides they are addressable, the change lands here and in the canonical scanner in the same commit, or the comparison suite sees one side alone | Blocked on the format taking that decision |

## Broken

Nothing known.

## Limitations (known gaps)

Every difference from the canonical implementation is written down in
`conformance-xfail.json` with its reason, and an entry that stops diverging
fails the build — so this list cannot quietly go stale.

| Limitation | Why it stands |
| --- | --- |
| Raw HTML in a card is escaped rather than passed through | The consumer is a webview, and rendering HTML out of a workspace is a script-injection surface reachable from any cloned repository. Changing it needs a sanitiser and a decision, not a flag |
| Math is typeset by KaTeX rather than MathJax | KaTeX bundles small and needs no network at render time. It covers a subset of LaTeX, renders what it cannot in red rather than failing, and blocks links inside formulas |
| The publication rule is never emitted | The model behind it is unported, above. It is ledgered, so the comparison suite drops it from the canonical side and still fails if this implementation ever emits it |
| Rendering differences are recorded but not tested | The ledger has three parts, and the two that the suites read are cases and rules. A rendering difference is written down and unguarded |

The publication difference is latent rather than active: the wiki cleared its
six warnings by de-linking rather than by settling the policy, so no fixture
triggers the rule today. The entry stays because the rule is genuinely
unimplemented — the moment a published card links to a private one again, the
canonical side warns and this one stays silent.

## Done

- **Scanner and parser** — masking that preserves offsets, the link grammar, and
  a parser that never throws on half-written input.
- **Heading slugs**, a hand port of the algorithm the format adopts from
  Python-Markdown, down to how collisions are numbered.
- **Frontmatter** — the fence, YAML under a restricted schema, the reserved keys.
- **The resolver** — the four-phase search, spine walk, whole-tree sweep, folder
  notes, imports, and a workspace index behind a host port that touches no Node
  builtins, so it runs in a browser.
- **All sixteen diagnostics**, sorted and worded identically to the canonical
  linter.
- **The corpus and its ledger** — cases generated from the canonical
  implementation, with every accepted difference written down.
- **Expansion and rendering** — page, section, and block embeds with a depth cap
  and cycle detection; a renderer that carries source lines into the output so
  the editor can sync scrolling.
- **The graph** — nodes, edges, and the reverse edge map backlinks read from.
- **Callouts, math, and D2 diagrams**, the last with a content-addressed cache.

## Gates

```bash
npm run -w @hypermarkdown/core typecheck
HMD_REQUIRE_PARITY=1 npm test -w @hypermarkdown/core
```

The comparison suite shells out to the canonical linter over the wiki and two
example vaults, and skips when that implementation is absent — unless the
environment variable is set, which CI does.

## Open questions

| Question |
| --- |
| Which proposal owns publication in this implementation? Its own spec enumerates sixteen rules and says nothing about publication, which belongs to the rendering proposal. The port needs that amendment before it is written |
| Should the port wait for the policy question? What a published-to-private link *should* do is itself unsettled on the canonical side — a blocked link, a page that exists but is unlisted, or nothing, chosen per site — so porting today's warning could mean porting it twice. Against that: matching the canonical implementation exactly is the contract, whatever it later becomes (issue 0008) |
| Does the graph data have to match the canonical `hmd graph` output exactly? It carries a heading count where the canonical side emits heading objects, and omits frontmatter, anchors, and imports. The editor proposal says the graph tab consumes "the same data", which these shapes do not quite satisfy |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone. Subscript, block-level LaTeX, and underlined headings became open work
  instead of prose in the extension's README, and the Python corpus runner moved
  to the canonical implementation's tracker, where the work actually lands.
- 2026-09-14: split out of the editor line's shared tracker, which covered this
  implementation and the extension in one file.
