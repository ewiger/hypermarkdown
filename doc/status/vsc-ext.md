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

**One thing stands between it and dropping the preview label:** the graph tab
does not exist yet, which is the feature the label is waiting on.

**Vaults are now discovered from the card.** A window holds a catalog of
vaults rather than one project, so a repository carrying several — this one
carries `doc/wiki` plus a vault per example tree — previews a card in any of
them. Unreleased: it is on the branch, gated by tests, and ships with the next
version.

## Open

| Status | Work | Notes | References |
| --- | --- | --- | --- |
| todo | **The graph tab.** A directed graph of the vault drawn inside the preview, replacing the backlinks tab rather than joining it — backlinks is one view of one direction of the graph, and a tab strip carrying both would offer the same thing twice. | The release stops being a preview when this lands. Specified only in outline, so the proposal is amended in the same change | [[hmd-0021#10-deferred-tabs]] |
| blocked | **Report unpublished links.** A published card that links to a private one should warn, and here it never does, because the embedded format implementation has no notion of a card being published. Unblocks when that port lands (rule HMD017) | Nothing to build here until the core reports it | [[hmd-0002#3-expansion]], [[hmd-0020#9-diagnostics]] |
| blocked | **Drop the preview label** from the manifest and the gallery copy. Waits on the graph tab, which is the only milestone that ever claimed it | One line in the manifest, once the graph is in | [[hmd-0021#12-packaging-and-ci]] |
| parked | **The integration suite** under `@vscode/test-cli` — written, compiling, and set aside on the `feat/vsc-ext-1` branch, because two upstream defects make it unrunnable on macOS | Below | [[hmd-0021#12-packaging-and-ci]] |

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
| Does the graph tab land as a proposal amendment first, or as an implementation the amendment then describes? The proposal fixes only the data source and the module shape and says nothing about interaction | [[hmd-0021#10-deferred-tabs]] |
| What does the graph show at rest for a large vault? Nothing bounds the node count, and the layout is recomputed every time the tab is shown | [[hmd-0021#10-deferred-tabs]] |
| The publisher is not domain-verified, and re-submitting will not help: the gallery grants it by manual review after roughly six months of continuous release history. First release was 2026-08-11, so the earliest worth raising again is around February 2027, and only if releases have kept coming. Do not reach for DNS — the TXT record on the apex is Open VSX's claim, not the gallery's — and re-check by querying the public extension API rather than by looking at the portal | [[hmd-0005#the-extensions-identity-on-both-galleries]] |

## Changelog

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
