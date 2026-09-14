# STATUS — the VS Code extension

`tools/hmd-vsc-ext` — the preview surface: a rendered card in an editor tab,
diagnostics in the Problems panel, and the graph. It carries its own copy of the
format through [`@hypermarkdown/core`](ts-core.md), so nothing has to be
installed to render a card. The canonical line is [`hmd.md`](hmd.md), the format
itself [`lang.md`](lang.md), and the site [`pages.md`](pages.md).

**This file is the only place work on the extension is tracked.** Not the memos
under `doc/memory/`, not the cards under `doc/wiki/`, not the proposals
themselves. A decision that needs discussion is named here as an open question
and argued wherever it belongs; nothing else may hold a task list. Update the
row in the same commit that changes the code.

Specified by [HMD-0021](../proposals/HMD-0021/README.md), with diagrams by
[HMD-0022](../proposals/HMD-0022/README.md).

**States** — `done` shipped and gated by a test · `ready` specified, unblocked,
not started · `blocked` waiting on a decision · `parked` started and set aside ·
`open` undecided · `deferred` deliberately not being decided now ·
`standing` an accepted limitation · `lifted` no longer true.

**Snapshot** (2026-09-14) — `0.2.0` is live and validated on the Marketplace and
Open VSX for all six platform targets, published from CI with **no stored
credential** — an OIDC `azure/login` and `vsce --azure-credential`, see
[the federated-publishing note](../memory/2026-09-14-marketplace-federated-publishing.md).
51 tests green here, 107 in the core. `d2` travels inside the extension from a
pinned toolchain release, so a diagram draws on a fresh install with nothing
configured. Still a `preview` release: E6, the graph, is what it is waiting on,
and the two things that would embarrass a first impression are that the graph
tab does not exist and that a repository holding more than one vault shows the
preview an empty state (issue 0108).

## Done

| ID | Milestone | Gate |
| --- | --- | --- |
| E1 | Extension skeleton, language, grammar | `npm run -w tools/hmd-vsc-ext build` |
| E2 | Index, watchers, diagnostics | `test/protocol.test.ts` |
| E3 | Rendered tab, embeds, scroll sync | `test/renderer.test.ts` |
| E4 | Backlinks, breadcrumb, create-card, pin | `test/renderer.test.ts` |
| E5 | Packaging | `npm run -w tools/hmd-vsc-ext package` |
| E7 | Editor-column surface, logo | `test/panel.test.ts` |
| E8 | First marketplace release, `0.1.0` | live on both registries, 2026-08-11 |
| E9 | Bundled `d2`, one build per platform, `0.2.0` | `test/engine.test.ts`; tag `vsc-ext-v0.2.0` |

| ID | Work point | Spec | State |
| --- | --- | --- | --- |
| E1.1 | Manifest: language `hmd`, grammar, commands, settings | HMD-0021 §1 | done |
| E1.2 | TextMate grammar including `text.html.markdown` | §2 | done |
| E1.3 | esbuild: `dist/extension.js` + `media/webview.js` | §12 | done |
| E2.1 | `VsCodeHost` over `vscode.workspace.fs`, root discovery | §8 | done |
| E2.2 | `Store` — index, watchers, unsaved-buffer overrides | §8, §5.1 | done |
| E2.3 | Diagnostics at 500 ms, suppressed on the cursor's line | §7, §5.1 | done |
| E3.1 | Webview shell, CSP with per-load nonce | §11 | done |
| E3.2 | `patchBlocks` — keyed DOM patching, state preserved | §5.1 | done |
| E3.3 | Embed cards: header, collapse, failure card, nesting | §5 | done |
| E3.4 | Scroll sync: anchors, interpolation, echo lockout | §6 | done |
| E3.5 | Click-through: links, embed headers, reveal-source | §6 | done |
| E4.1 | Backlinks tab, link and embed edges distinguished | §9 | done — retired by E6.6 |
| E4.2 | Breadcrumb, pin toggle | §3 | done |
| E4.3 | `createCard` through `WorkspaceEdit` | §5 | done |
| E4.4 | `diagram/engine.ts` — `d2` then Docker, 64-entry LRU, data: URI | HMD-0022 §2–§6 | done |
| E4.5 | KaTeX stylesheet and woff2 fonts copied into the VSIX | HMD-0020 §3.3 | done |
| E5.1 | `.vscodeignore`, VSIX with no `node_modules` | §12 | done |
| E7.1 | Preview is an editor tab; view container removed | §3 | done |
| E7.2 | `editor/title` button gated on `hyperMarkdown.hasRoot` | §3 | done |
| E7.3 | Several panels, each titled after its card | §3 | done |
| E7.4 | `WebviewPanelSerializer` restores card and pin | §3 | done |
| E7.5 | The ⚡ as tab icon, title-bar icon, and gallery PNG | issue 0104 | done |
| E7.6 | Preview follows the editor and its own links; pin toggle in the title bar | §3 | done |
| E8.1 | Gallery metadata: `preview`, `galleryBanner`, `badges`, `qna`, `homepage` | §1 | done |
| E8.2 | README and CHANGELOG as the Details and Changelog tabs, links absolute | HMD-0024 | done |
| E8.3 | `release-vsc-ext.yml`: one VSIX to Marketplace, Open VSX, and the release | §12 | done |
| E8.4 | Publisher accounts and gallery publishing by federated credential, no stored token | — | done |
| E8.5 | `hypermarkdown.org/tools/vscode/` landing page | — | done |
| E9.1 | `scripts/toolchain.mjs` — fetch the pinned archive, check its digest, unpack it | issue 0107 | done |
| E9.2 | `diagram/options.ts` — configured path, then bundled, then `PATH`, then placeholder | issue 0107 | done |
| E9.3 | `hyperMarkdown.diagram.d2Path`; the Docker fallback removed | issue 0107 | done |
| E9.4 | One VSIX per `--target`, each carrying `toolchain/bin/d2` | §12 | done |
| E9.5 | `0.2.0` on the Marketplace and Open VSX, all six targets validated | — | done |

## TODO

### Planned work

#### E6 — the graph tab

The design is decided; §10 fixes only the module shape and the data source, so
these rows are ahead of the specification and E6.7 is what closes that gap.

**The graph replaces backlinks rather than joining it.** Backlinks is one view
of one direction of the graph, and a tab strip carrying both would offer the
same information twice, once as a list and once as a picture.

| ID | State | Work point | Spec |
| --- | --- | --- | --- |
| E6.1 | ready | `"graph"` as a `PreviewMode` in `protocol.ts`, a `graph` host message beside `render`, and a `Store.graph()` over `buildGraph` | §4 |
| E6.2 | ready | Cytoscape.js bundled into `media/webview.js` — no CDN, no `eval`, nodes built without `innerHTML`, and the layout recomputed on every mount since `retainContextWhenHidden` is off | §11, §12 |
| E6.3 | ready | **Network** scope: the whole vault as one directed graph, link and embed edges drawn distinctly | §10 |
| E6.4 | ready | **Card** scope: this card and its neighbours, with a direction choice — **upstream**, the cards it links to, and **downstream**, the cards that link to it, which is what the backlinks tab showed | §9, §10 |
| E6.5 | ready | Click a node to navigate: the preview moves to that card and its source opens alongside, exactly as a `[[wikilink]]` click already does | §6 |
| E6.6 | ready | The backlinks tab and `renderBacklinks` retired, and the E4.1 rows in the docs with them | §9 |
| E6.7 | blocked | HMD-0021 amended: §10 gains the two scopes, the direction choice, the click contract, and the library constraint; §9 becomes a mode of the graph rather than a tab of its own; §4's pinned message list gains `graph` | Q1 |

#### Everything else

| ID | State | Work point | Blocked on |
| --- | --- | --- | --- |
| E10 | ready | **Per-card vault discovery** — [issue 0108](../issues/0108-vault-root-discovery-per-card.md). One folder open in the editor can hold several vaults, each marked by its own `.hmd/`; this repository does. Walk up from the card to the nearest `.hmd/`, stopping at the containing workspace folder, and hold a store per discovered root. Needs HMD-0021 §8 rewritten | Q2 |
| E11 | blocked | **HMD017 in the Problems panel**, once the core reports it — [`ts-core.md` C4.2](ts-core.md#planned-work) | that port |
| E5.2 | parked | **Integration suite** under `@vscode/test-cli`. Written, compiling, and parked on `feat/vsc-ext-1` (commit `cb8c6e4`) | two upstream blockers, below |
| E12 | blocked | **Drop the `preview` flag** from the manifest and say so in the gallery copy. E6 owns the removal; the publication model does not, since it is blocked on a spec amendment of its own | E6 |

### Broken

| ID | State | Defect | Impact |
| --- | --- | --- | --- |
| D1 | open | A card in a nested vault shows *"Open a .hmd card to preview it."* The card is a card, it is open, and it is in the workspace — the message is accurate about the extension's state and misleading about the cause | Every card under `examples/` in this repository. E10 is the fix; the message should say that no vault claims the card |

### Limitations

| ID | State | Limitation | Why it stands |
| --- | --- | --- | --- |
| L1 | standing | Raw HTML in a card is escaped rather than rendered | Deliberate — a webview rendering HTML out of a workspace is a script-injection surface reachable from any cloned repository. Inherited from [`ts-core.md` L1](ts-core.md#limitations) |
| L2 | standing | `HMD017` is never reported, so nothing here knows whether a card is published | [`ts-core.md` C4.2](ts-core.md#planned-work) |
| L3 | standing | Math is KaTeX, not the site's MathJax, and `~x~` subscript is unsupported | [`ts-core.md` L2](ts-core.md#limitations), C7.5 |
| L4 | standing | A fragment link to a setext heading lands at the top of the card | Neither implementation indexes setext headings; [`lang.md` T1](lang.md#planned-work) is the fix and it is a format decision, not an extension one |
| L5 | standing | Language-server features — completion, rename, hover — are absent | They arrive with the Python server ([`hmd.md` W7](hmd.md#planned-work)). The preview keeps rendering without Python either way |
| L6 | standing | The integration suite is not in the default test command | Its harness downloads ~305 MB (~912 MB unpacked) on first run |

**On E5.2's two blockers**, neither in our code: `@vscode/test-electron` 2.5.2
spawns `Contents/MacOS/Electron` and VS Code 1.132.0 ships that binary as
`Code`; and symlinking around the rename invalidates the `.app` signature, so
macOS kills the process with `SIGKILL`. The untested next step is
`@vscode/test-electron` 3.1.0. Neither blocker exists on a Linux runner, so when
this is unparked it belongs in CI under `xvfb-run`, not on a laptop.

### Open questions and blockers

| ID | State | Question |
| --- | --- | --- |
| Q1 | open | §10 specifies a module shape and a data source and nothing else — no commands, no interaction model, no library, no node budget. Does E6 land as an amendment first, or as an implementation the amendment then describes? |
| Q2 | open | One store per vault or one store re-initialised on every crossing? The first is the honest model and makes diagnostics, backlinks, and the watcher per-vault; the second is much smaller and throws the index away each time the user clicks between `doc/wiki` and `examples/`. Issue 0108 prefers the first |
| Q3 | open | Do `[[wikilinks]]` and graph edges cross a vault boundary? They almost certainly should not — two vaults are two namespaces, and a link resolving into a neighbour would make the same card render differently depending on what else is checked out. It needs saying in HMD-0021 either way |
| Q4 | open | `hyperMarkdown.diagnostics.scope` is <code>workspace&#124;open</code>, and "workspace" would come to mean "every vault the session has opened a card in". A third value, or a redefinition? |
| Q5 | open | What does the graph show at rest in Network scope for a large vault? Nothing bounds node count, and the layout is recomputed on every tab switch because panel state cannot be persisted beyond the card |
| Q6 | deferred | The publisher is not domain-verified. `isDomainVerified` is `false` for `hypermarkdown.org`; the flag puts a check beside the name on the listing and affects nothing else. Verification was requested on 2026-09-14 and the gallery team wants roughly **six months of continuous release history** before granting it. First release was 2026-08-11, so the earliest worth raising again is around **2027-02**, and only if releases have kept coming. **Do not re-submit, and do not reach for DNS** — the gallery verifies by manual review, not by a record; the `EclipseFdn/open-vsx.org` issue URL in a TXT record on the apex is Open VSX's claim, not the gallery's. Re-check with `isDomainVerified` on the public `extensionquery` API rather than by looking at the portal |

(V1, the secondary-side-bar question, is closed: E7 removed the view container
rather than finding a place to put it.)

## Gates

```bash
npm run typecheck && npm run build
HMD_REQUIRE_PARITY=1 npm test
npm run -w tools/hmd-vsc-ext package
```

## Changelog

- 2026-09-14: split out of `doc/vsc-ext/STATUS.md`, which tracked the extension
  and the core in one file. E6 gained its design — the graph replaces the
  backlinks tab, carries a Network and a Card scope with an upstream/downstream
  choice inside the latter, navigates on a node click, and draws through a
  bundled Cytoscape.js — and E12 records that E6 owns the `preview` flag's
  removal, which closes the question of which milestone did. E10 and D1 are
  issue 0108, promoted from an issue card to tracked work. L1–L4 arrived from
  the extension's README, which had carried them as user-facing prose.
