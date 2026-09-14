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

**`0.2.0` is live on both galleries for all six platform targets, and it is
still labelled a preview release.** Everything it claims to do works and is
gated by tests: the rendered tab, embeds as collapsible cards, scroll sync both
ways, red links with a create-the-card action, backlinks, diagnostics identical
to the linter's, and math, callouts, and D2 diagrams — the `d2` binary travels
inside the extension, so a diagram draws on a fresh install with nothing
configured. Releases publish from CI with no stored credential.

**Two things stand between it and dropping the preview label.** The graph tab
does not exist yet, which is the feature the label is waiting on. And a
repository holding more than one vault — this one does — shows an empty state
for every card outside the first vault, which is the first thing a new user of
this repository hits.

Nothing is being worked on right now: the last release shipped, and the next
piece of work has not started.

## Open

| Status | Work | Notes |
| --- | --- | --- |
| todo | **The graph tab.** A directed graph of the vault drawn inside the preview, replacing the backlinks tab rather than joining it — backlinks is one view of one direction of the graph, and a tab strip carrying both would offer the same thing twice. | The release stops being a preview when this lands. Specified only in outline, so the proposal is amended in the same change (HMD-0021 §10) |
| todo | **Per-card vault discovery.** One folder open in the editor can hold several vaults, each marked by its own `.hmd/`, and this repository does: `doc/wiki` plus a vault per example tree. Walk up from the card to the nearest `.hmd/`, stopping at the workspace folder, and hold one index per vault — the way git finds its repository, and the way the canonical implementation already finds a project root. | Fixes the empty state under Broken. Needs the proposal's one-vault-per-workspace model rewritten (issue 0108, HMD-0021 §8) |
| blocked | **Report unpublished links.** A published card that links to a private one should warn, and here it never does, because the embedded format implementation has no notion of a card being published. Unblocks when that port lands (rule HMD017) | Nothing to build here until the core reports it |
| blocked | **Drop the preview label** from the manifest and the gallery copy. Waits on the graph tab, which is the only milestone that ever claimed it | One line in the manifest, once the graph is in |
| parked | **The integration suite** under `@vscode/test-cli` — written, compiling, and set aside on the `feat/vsc-ext-1` branch, because two upstream defects make it unrunnable on macOS | Below |

**The graph tab, in parts.** One item, not seven:

- A **Network** scope showing every card in the vault, link edges and embed
  edges drawn distinctly.
- A **Card** scope showing one card and its neighbours, with a choice of
  **upstream** — the cards this one links to — or **downstream**, the cards that
  link to it, which is what the backlinks tab showed.
- **Clicking a node navigates**: the preview moves to that card and its source
  opens alongside, exactly as clicking a link in the preview already does.
- Drawn with a bundled **Cytoscape.js**. The webview may not reach a CDN and may
  not evaluate code, so the library is compiled into the extension's own script;
  the layout is recomputed whenever the tab is shown, because a hidden webview
  keeps no state.
- A **toolbar** over the canvas: zoom in and out, fit to the view, re-run the
  layout, and the scope and direction controls — the standard set a graph view
  is expected to have, taken from what the library already offers rather than
  rebuilt.
- The backlinks tab and its renderer are deleted in the same change.

**Why the integration suite is parked**, neither reason in our code: the test
harness spawns `Contents/MacOS/Electron` and current VS Code ships that binary
as `Code`, and symlinking around the rename invalidates the app signature, so
macOS kills the process outright. The untested next step is the harness's 3.1.0
release. Neither failure exists on a Linux runner, so when this is picked up it
belongs in CI under a virtual display rather than on a laptop. It also downloads
about 300 MB on first run, which is why it is not in the default test command.

## Broken

| Status | Defect | Symptom |
| --- | --- | --- |
| todo | **A card in a nested vault cannot be previewed.** The extension picks one namespace root at startup, from the first workspace folder, and every card outside it is invisible to the index | Open `examples/cs-alg-sorting/complexity.hmd` in a checkout of this repository and the preview says *"Open a .hmd card to preview it."* The card is a card, it is open, and it is in the workspace — the message is accurate about the extension's state and misleading about the cause. Fixed by per-card vault discovery above, which should also make the message say that no vault claims the card |

## Limitations (known gaps)

| Limitation | Why it stands |
| --- | --- |
| Raw HTML in a card is escaped rather than rendered | A webview that renders HTML out of a workspace is a script-injection surface reachable from any cloned repository. Deliberate, and a divergence from the website, which does render it |
| A published card linking to a private one is never flagged | The publication model is unported, so nothing here knows whether a card is published at all (rule HMD017) |
| Math is typeset by KaTeX, not the website's MathJax, and `~x~` subscript does nothing | KaTeX is bundled and needs no network; it covers a subset of LaTeX and shows what it cannot render in red. Subscript is a small addition waiting on the core |
| A link to a heading written with an underline lands at the top of the card | Neither implementation indexes underlined headings, which is a decision the format has not taken. Write `##` headings |
| Completion, rename, and hover are absent | They arrive with the language server, which lives with the canonical implementation. The preview keeps rendering without it either way |
| The integration suite is not in the default test command | Its harness downloads about 300 MB on first run |

## Done

- **The preview** — a rendered card in an editor tab, updating from the unsaved
  buffer, scroll-synced with the editor in both directions, following the active
  editor unless pinned, and restored on its own card after a window reload.
- **Embeds render as cards**, labelled with the card and fragment they came
  from, collapsible, nested, and navigating to the embedded card.
- **Red links** for targets that do not resolve, with an action that writes the
  missing card.
- **Backlinks** for the current card, link and embed edges listed separately.
  (Retired when the graph tab lands.)
- **Diagnostics** in the Problems panel, byte-identical to the linter's, at 500
  ms and suppressed on the line the cursor is in.
- **Math, callouts, and D2 diagrams**, with KaTeX and a pinned `d2` build
  shipped inside the VSIX — one build per platform, each gated on the binary
  being there.
- **Syntax highlighting** for `.hmd` as its own language.
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

| Question |
| --- |
| Does the graph tab land as a proposal amendment first, or as an implementation the amendment then describes? The proposal fixes only the data source and the module shape and says nothing about interaction (HMD-0021 §10) |
| One index per vault, or one index re-initialised whenever the user crosses between vaults? Per vault is the honest model and makes diagnostics, backlinks, and the file watcher per vault; re-initialising is a much smaller change that throws the index away on every crossing (issue 0108) |
| Do links and graph edges cross a vault boundary? They almost certainly should not — two vaults are two namespaces, and a link resolving into a neighbour would make the same card render differently depending on what else is checked out — but the proposal needs to say so either way |
| The diagnostics setting offers "every card in the index" or "open cards only", and with several vaults the first would come to mean "every vault this session has opened a card in". A third value, or a redefinition? |
| What does the graph show at rest for a large vault? Nothing bounds the node count, and the layout is recomputed every time the tab is shown |
| The publisher is not domain-verified, and re-submitting will not help: the gallery grants it by manual review after roughly six months of continuous release history. First release was 2026-08-11, so the earliest worth raising again is around February 2027, and only if releases have kept coming. Do not reach for DNS — the TXT record on the apex is Open VSX's claim, not the gallery's — and re-check by querying the public extension API rather than by looking at the portal |

## Changelog

- 2026-09-14: rewritten in the shape the trackers now use — status first in
  prose, then open work, broken, gaps, and done last. Work-point numbers are
  gone: a row is named by what it is. The graph tab gained its design, and it
  now owns the removal of the preview label; per-card vault discovery arrived
  from the issue board.
- 2026-09-14: split out of the editor line's shared tracker, which covered this
  extension and the format implementation it embeds in one file.
