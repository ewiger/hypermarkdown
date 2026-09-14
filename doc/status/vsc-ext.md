# STATUS — the VS Code extension

`tools/hmd-vsc-ext` — HyperMarkDown inside the editor: a rendered card in a tab
beside its source, diagnostics in the Problems panel, and the graph. It carries
its own copy of the format, so nothing has to be installed to preview a card —
no interpreter, no virtualenv, no subprocess between a keystroke and the
preview. Published as `hypermarkdown.hmd` on the VS Marketplace and Open VSX.

Beside this file: the format itself in [`lang.md`](lang.md), the canonical
implementation in [`hmd.md`](hmd.md), the format implementation this extension
embeds in [`ts-core.md`](ts-core.md), and the website in [`pages.md`](pages.md).

## Status

**`0.2.0` is live on both galleries for all six platform targets, `0.3.0` is cut
and waiting on its tag, and both are still labelled a preview release.**
Everything the extension claims to do works and is gated by tests: the rendered
tab, embeds as collapsible cards, scroll sync both ways, red links with a
create-the-card action, the graph, diagnostics identical to the linter's, and
math, callouts, and D2 diagrams — the `d2` binary travels inside the extension,
so a diagram draws on a fresh install with nothing configured. Releases publish
from CI with no stored credential.

**The graph tab is in, and backlinks is gone.** The feature the preview label
was waiting on is on this branch: two scopes, a direction, link and embed edges
drawn apart, click-to-navigate, full screen, and a toolbar, drawn with a
bundled Cytoscape.js and specified in its own record [[hmd-0025]]. The cut it
draws is taken in the extension host and is gated by tests; what it looks like
running is not, so the label comes off after a pass through the by-hand checks
rather than in the same commit [issue 0109].

**Vaults are now discovered from the card.** A window holds a catalog of
vaults rather than one project, so a repository carrying several — this one
carries `doc/wiki` plus a vault per example tree — previews a card in any of
them. It is on `main`, gated by tests, and is what `0.3.0` ships; the release
starts when the `vsc-ext-v0.3.0` tag is pushed.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **Read the graph in a running editor** and then drop the preview label. The by-hand list in the extension's `DEVELOP.md` covers the tab; nothing automated can say whether the layout is legible on a real vault, and the live-editing checks are unautomated across the board [issue 0101] | The last step of the graph tab, and what the manifest's `preview` flag now waits on [issue 0109] | [[hmd-0025]] |
| blocked | **Report unpublished links.** A published card that links to a private one should warn, and here it never does, because the embedded format implementation has no notion of a card being published. Unblocks when that port lands (rule HMD017) | Nothing to build here until the core reports it | [[hmd-0002#3-expansion]], [[hmd-0020#9-diagnostics]] |
| todo | **Filter the graph by namespace and tag**, which the requirement asks for and the tab does not do. The index carries both on every node already | A network view of a large vault is where this stops being a nicety [VSX-024] | [[hmd-0025]] |
| todo | **Create the card a relative link points at.** Create-card places a bare target beside the linking card and an absolute one under the root, and declines `./` and `../` targets with a warning. Writing the link relative is how an author places a card deliberately, so the one form that says where the card goes is the form the action refuses | Path derivation and its test both encode the refusal today [`src/commands/createCard.ts`, `test/protocol.test.ts`] | [[hmd-0001#2-grammar]], [[hmd-0021#5-rendering-the-ir]] |
| parked | **The integration suite** under `@vscode/test-cli` — written, compiling, and set aside on the `feat/vsc-ext-1` branch, because two upstream defects make it unrunnable on macOS | Below | [[hmd-0021#12-packaging-and-ci]] |

**Why the integration suite is parked**, neither reason in our code: the test
harness spawns `Contents/MacOS/Electron` and current VS Code ships that binary
as `Code`, and symlinking around the rename invalidates the app signature, so
macOS kills the process outright. The untested next step is the harness's 3.1.0
release. Neither failure exists on a Linux runner, so when this is picked up it
belongs in CI under a virtual display rather than on a laptop. It also downloads
about 300 MB on first run, which is why it is not in the default test command.

## Broken

Nothing known.

## Limitations (known gaps)

| Limitation | Why it stands | References |
| --- | --- | --- |
| Raw HTML in a card is escaped rather than rendered | A webview that renders HTML out of a workspace is a script-injection surface reachable from any cloned repository. Deliberate, and a divergence from the website, which does render it | [[hmd-0021#11-webview-hardening]] |
| A published card linking to a private one is never flagged | The publication model is unported, so nothing here knows whether a card is published at all (rule HMD017) | [[hmd-0002#3-expansion]] |
| Math is typeset by KaTeX, not the website's MathJax, and `~x~` subscript does nothing | KaTeX is bundled and needs no network; it covers a subset of LaTeX and shows what it cannot render in red. Subscript is a small addition waiting on the core | [[hmd-0020#33-free-syntax]] |
| A link to a heading written with an underline lands at the top of the card | Neither implementation indexes underlined headings, which is a decision the format has not taken. Write `##` headings | [[hmd-0001#3-heading-anchors]] |
| Completion, rename, and hover are absent | They arrive with the language server, which lives with the canonical implementation. The preview keeps rendering without it either way | [[hmd-0024#the-language-server-is-python-on-pygls]] |
| The integration suite is not in the default test command | Its harness downloads about 300 MB on first run | [[hmd-0021#12-packaging-and-ci]] |
| The graph draws only what resolved, and stops at 400 cards | A red link has no card at the other end to draw it to, and is reported in the rendered tab and the Problems panel instead. Past the cap the view keeps the cards nearest the one being read and says how many it dropped: a hairball is not a more honest picture than a bounded one that names what is missing | [[hmd-0025]] |
| Full screen can fall one press out of step | Zen mode and the rest are toggles the editor does not let an extension read back, so the tab tracks what it performed. Leave zen mode by hand and the button's next press puts it back in step | [[hmd-0025]] |
| The webview bundle is about 400 KB, nearly all of it Cytoscape | The policy forbids remote script, so a graph library is either compiled in or absent | [[hmd-0025]], [[hmd-0021#11-webview-hardening]] |

## Done

- **The preview** — a rendered card in an editor tab, updating from the unsaved
  buffer, scroll-synced with the editor in both directions, following the active
  editor unless pinned, and restored on its own card after a window reload.
- **Embeds render as cards**, labelled with the card and fragment they came
  from, collapsible, nested, and navigating to the embedded card.
- **Red links** for targets that do not resolve, with an action that writes the
  missing card.
- **The graph tab** — the vault as nodes and edges, in a network scope or a card
  scope pointed at what this card links to or at what links to it, link and
  embed edges drawn apart, a node opening its card, and a toolbar for zoom, fit,
  and re-running the layout. Which cards are in the picture is decided in the
  extension host, so it is under test without a canvas. Full screen hands it the
  whole window — zen mode, uncentred, a split maximised — and `Escape` gives the
  editor back. It replaced the backlinks tab, whose
  renderer went with it [issue 0109].
- **Diagnostics** in the Problems panel, byte-identical to the linter's, at 500
  ms and suppressed on the line the cursor is in.
- **Math, callouts, and D2 diagrams**, with KaTeX and a pinned `d2` build
  shipped inside the VSIX — one build per platform, each gated on the binary
  being there.
- **Syntax highlighting** for `.hmd` as its own language.
- **Several vaults in one folder** — a vault is discovered by walking up from
  the card to the nearest `.hmd/`, stopping at the containing workspace folder,
  and the window holds one index, watcher, and diagnostic scope per vault, built
  the first time a card asks for it. Nothing resolves across a boundary: two
  vaults are two namespaces. A card no vault claims is told so, in place of the
  old message that asked the reader to open a card while they were looking at
  one [issue 0108].
- **Released** — `0.1.0` on both galleries in August, `0.2.0` on 2026-09-14 for
  six platform targets, published from CI by federated credential with no stored
  token, with a landing page on the website.

## Gates

```bash
npm run typecheck && npm run build
HMD_REQUIRE_PARITY=1 npm test
npm run -w tools/hmd-vsc-ext package
```

## Open questions

| Question | References |
| --- | --- |
| Should the graph filter by namespace and tag? The index carries both on every node; the question the filter raises is what it does to the node cap — filtering before the cap and filtering after it are different pictures | [[hmd-0025]] |
| Should a card with no resolved edges in either direction be reported somewhere other than the graph? The graph draws an island, which is honest and easy to miss | [[hmd-0025]] |
| The publisher is not domain-verified, and re-submitting will not help: the gallery grants it by manual review after roughly six months of continuous release history. First release was 2026-08-11, so the earliest worth raising again is around February 2027, and only if releases have kept coming. Do not reach for DNS — the TXT record on the apex is Open VSX's claim, not the gallery's — and re-check by querying the public extension API rather than by looking at the portal | [[hmd-0005#the-extensions-identity-on-both-galleries]] |

## Changelog

- 2026-09-14: the graph's full screen took the window rather than the panel. It
  first stood only the preview's own chrome down, which left the editor's tab
  bar, side bar, and status bar around a canvas that had asked for the screen —
  no help at all in the case it exists for, a network too large to navigate. It
  now asks for zen mode, undoes the centring that would trade the width back,
  maximises a split, and undoes exactly what it did; a preview closed while it
  holds the window gives it back [[hmd-0025]].
- 2026-09-14: the graph tab landed and the backlinks tab was deleted. It answers
  both questions the tracker was carrying about it: the specification was
  written from the implementation rather than ahead of it, and a large vault is
  bounded — the network scope draws the 400 cards nearest the one being read and
  says how many it left out. The design went to a record of its own [[hmd-0025]]
  rather than staying a section of the preview surface: a bundled layout engine,
  a node cap, and a scope model are a decision, not a detail of the surface they
  sit on. What is still open is the live look at it, which is what the preview
  label now waits on [issue 0109].
- 2026-09-14: create-card's path rule is settled in the proposal — the action never prompts, and the link's own form picks the path. The gap it exposed, relative targets being refused, is open above.
- 2026-09-14: per-card vault discovery landed. The three open questions it
  carried are answered in the proposal rather than here: one index per vault,
  no resolution across a boundary, and `diagnostics.scope: "workspace"`
  redefined as every vault the window has opened a card in.
- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone: a row is named by what it is. The graph tab gained its design, and it
  now owns the removal of the preview label; per-card vault discovery arrived
  from the issue board.
- 2026-09-14: split out of the editor line's shared tracker, which covered this
  extension and the format implementation it embeds in one file.
