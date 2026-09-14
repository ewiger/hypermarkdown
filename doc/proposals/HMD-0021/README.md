# HMD-0021: The VS Code extension — the HyperMarkDown preview surface

**Status**: drafted
**Created**: 2026-08-06
**Source**: [HyperMarkDown in the editor — Requirements](../../models/requirements/vscode-extension.md)

## Companion notes

- [HMD-0020](../HMD-0020/README.md) — `@hypermarkdown/core`, which owns the
  grammar, the resolver, and the document IR this extension renders. Nothing
  semantic is decided here.

## Abstract

This proposal defines `hmd-vsc-ext`: a VS Code extension registering
`.hmd` as its own language with its own TextMate grammar, contributing one
webview view whose internal tab strip carries the preview modes, and rendering
the HMD-0020 document IR into a card-shaped view where embeds stay embeds. It
pins the host/webview split — parse, resolve, and expand in the extension host;
render in the webview — the `postMessage` protocol between them, the
bidirectional scroll-sync algorithm and its timing constants, the workspace
index and its watchers, the mapping from HMD-0001 lint rules onto VS Code
diagnostics, and a content security policy that forbids remote content. v1
ships the `rendered` and `backlinks` tabs; `graph` and `mind map` are specified
only as far as the tab-strip contract. Everything specified here renders without
Python; the language features that will arrive on the Python server of
[HMD-0024](../HMD-0024/README.md) are out of scope for this record, and the
preview stays independent of them.

## Motivation

Sketch §14 states the thesis without hedging: *"Preview is the product.
Everything else is supporting cast."* Two consequences shape this record.

- **The `.hmd` language identifier is what makes the preview possible.** A
  custom language ID stops the format contending with the built-in markdown
  language for the preview pane and the grammar, which sketch §15 already
  identified as sufficient justification for a custom extension on its own.
- **The surface has to show the hyper layer, not hide it.** An embed rendered
  as anonymous inline prose is indistinguishable from a copy-paste. Rendering
  it as a labelled, collapsible card that navigates to its origin is the only
  thing the preview does that a markdown previewer cannot, and it is therefore
  the feature the whole design is arranged around.

**Risk this proposal must not defer:** a webview is a script host. It receives
content derived from arbitrary files in a cloned repository, and it runs inside
the user's editor. §11 is not boilerplate.

## Goals

- A preview that is live-on-type, scroll-synced, and navigable in both
  directions between source and render.
- Embeds, red links, and namespace context visible as first-class UI.
- HMD-0001 diagnostics in the Problems panel, from the same code that draws the
  preview.
- Zero setup: install, open a `.hmd` file, see it rendered. No interpreter, no
  configuration, no first-run wizard.

## Non-goals

- **A language server**, and any use of `vscode-languageclient`. Deferred by
  the requirements document §9.
- **Semantics.** Grammar, resolution, expansion, and diagnostics belong to
  HMD-0020. Where this extension appears to decide one, it is wrong.
- **Rename refactoring** (VSX-044) and **whole-tree writes** of any kind beyond
  the single create-card action of §5.
- **The graph and mind-map tabs** beyond the contract in §10.
- **Web-extension (browser) builds** in v1, though HMD-0020's Node-free core
  keeps the option open.

## Specification

### 1. Identity, contributions, activation

```text
directory     tools/hmd-vsc-ext/
name          hmd-vsc-ext
publisher     HyperMarkDown
displayName   HyperMarkDown
engines.vscode ^1.90.0
language id   hmd
extensions    .hmd
aliases       ["HyperMarkDown", "hmd"]
```

- `name` and `publisher` together form the marketplace identifier
  `hypermarkdown.hmd`, which is permanent from the first publish. The
  extension was `vscode-HyperMarkDown` while the repository used a `packages/`
  layout, and was renamed with the move to `tools/`. Nothing has been published,
  which is the only window in which this rename is free.
- The extension MUST contribute the `hmd` language rather than reusing
  `markdown`. Sharing the markdown language ID would put this preview in
  contention with the built-in one for the same file.
- Activation is `onLanguage:hmd` plus the view's own activation. The extension
  MUST NOT use `*`: a knowledge-base extension that costs startup time in every
  window will be uninstalled by people who have one `.hmd` file.
- Commands contributed:

| Command | Title |
| --- | --- |
| `hyperMarkdown.openPreview` | HyperMarkDown: Open Preview |
| `hyperMarkdown.openPreviewToSide` | HyperMarkDown: Open Preview to the Side |
| `hyperMarkdown.togglePin` | HyperMarkDown: Pin Preview to This Card |
| `hyperMarkdown.createCardFromLink` | HyperMarkDown: Create Missing Card |
| `hyperMarkdown.refreshIndex` | HyperMarkDown: Rebuild Index |

- Settings contributed, all under `hyperMarkdown.`:

| Setting | Type | Default |
| --- | --- | --- |
| `root` | string | `""` — empty means discover per HMD-0020 §5 |
| `preview.scrollSync` | boolean | `true` |
| `preview.embeds` | `"expanded"` \| `"collapsed"` | `"expanded"` |
| `diagnostics.scope` | `"open"` \| `"workspace"` | `"workspace"` |

### 2. TextMate grammar

Highlighting is bought from the markdown grammar and extended, not rewritten.

- The grammar's scope name is `source.hmd`. Its first pattern MUST be an
  include of `text.html.markdown`, so every markdown construct and every
  embedded fenced language highlights exactly as it does today.
- The format's own constructs take these scopes, which are a stable interface
  for theme authors:

```text
[[target|display]]   meta.link.wiki.hmd
  [[ and ]] and |    punctuation.definition.link.wiki.hmd
  target             entity.name.reference.hmd
  display            string.other.link.title.hmd
![[target]]          meta.embed.wiki.hmd
trailing ^id         entity.name.label.hmd
--- frontmatter ---  meta.embedded.block.yaml, delegating to source.yaml
```

- Grammar patterns MUST match the construct shapes of HMD-0001 §2 but MUST NOT
  be relied on for validity. Highlighting is a hint; `HMD010` from HMD-0020 is
  the verdict. Two matchers will disagree at the edges, and only one of them is
  normative.

### 3. Surface

- The preview is a `WebviewPanel` — a tab in an editor group. The extension
  MUST NOT contribute a view container, and there is no side-bar surface. An
  extension cannot default a container to the secondary side bar, so a
  side-bar preview can only be put in place by a drag the user repeats on
  every machine; and a reading surface belongs in the same columns as the
  things being read.
- Preview modes are **tabs drawn inside the webview**, not sibling views. One
  webview means one IR delivery, one scroll-sync implementation, and one place
  where state lives; four views would mean four of each.
- `hyperMarkdown.openPreview` is contributed to `editor/title` under the
  context key `hyperMarkdown.hasRoot`, so the button is present on every editor
  group in a knowledge base and absent everywhere else. It MUST open in
  `ViewColumn.Active`: `Beside` refuses to place a tab into a **locked**
  neighbouring group and silently splits a third one instead, which is the
  common case when the other column holds a conversational assistant.
  `hyperMarkdown.openPreviewToSide` keeps `ViewColumn.Beside` for the
  side-by-side reading it is named for.
- A preview **follows the active editor**, always, unless the user pins it.
  This is the surface's defining rule and it MUST NOT be weakened by any
  heuristic about how the preview was opened: pinning is the absence of
  following, not a gentler form of it, so a preview that pins itself never
  follows anything again.
- Following extends to the preview's own navigation. Clicking a `[[wikilink]]`
  MUST move the preview to the target, not only open its source. Browsing by
  following links is the one thing this surface does that a file viewer
  cannot.
- Several previews MAY be open at once, each titled after its card. Unpinned
  ones necessarily show the same card; holding a second card is what pinning
  is for. Opening a preview MUST therefore reuse the unpinned one already in
  the target column rather than creating a second, and MUST NOT reuse a pinned
  one.
- `togglePin` acts on the focused preview tab and freezes it on the current
  card. The frozen state MUST be visible in the UI and MUST be reachable
  without the command palette — a preview that silently stops following looks
  like a bug, and a pin nobody can find invites automating it.
- Revealing source MUST NOT target the group the preview occupies, and MUST
  NOT assume column one.
- The extension MUST register a `WebviewPanelSerializer` for the panel's view
  type, restoring each tab's card. A layout the user arranged and VS Code
  redrew empty after a reload is indistinguishable from a crash.
- Persisted state MUST carry the card and nothing else. In particular the
  pinned flag MUST NOT survive a reload: workspace storage outlives the build
  that wrote it, a restored preview that silently stops following is
  indistinguishable from a broken one, and nothing on screen can tell a
  deliberate pin from a stale flag. A restored preview follows.
- The header shows the breadcrumb of namespace segments (VSX-005), each segment
  navigating to that namespace's folder note where one exists.

### 4. The host/webview split

Parsing, resolution, and expansion run in the **extension host**; the webview
renders. The host owns filesystem access and the workspace index, and the
webview is deliberately kept incapable of reaching either.

```text
extension host                          webview
──────────────────────────────          ─────────────────────────
@hypermarkdown/core                    renderer.ts
  WorkspaceHost → vscode.workspace.fs     IR → DOM
  index, resolve, expand                  tab strip, scroll sync
  Document IR  ───── postMessage ─────►   click handling
               ◄──── postMessage ─────
DiagnosticCollection
```

Messages are versioned by HMD-0020's `irVersion` and pinned here:

```text
host → webview
  { type: "render",     irVersion, document, mode, settings }
  { type: "backlinks",  irVersion, items }
  { type: "revealLine", line }
  { type: "setMode",    mode }
  { type: "error",      message }

webview → host
  { type: "ready" }
  { type: "openSource", path, line }
  { type: "openTarget", path, fragment }
  { type: "createCard", target, suggestedPath }
  { type: "scrolled",   line }
  { type: "modeChanged", mode }
```

- The host MUST validate every inbound message against this shape and MUST
  reject a `path` that does not lie inside the namespace root, even though the
  webview is the extension's own code. Message handlers are the trust boundary;
  treating them as internal is how a renderer bug becomes a file-read primitive.
- The host MUST NOT send a `render` for a document it has not fully resolved.
  A partially-resolved IR would render links as red that are merely not yet
  computed, and a red link is a work item, not a spinner.

### 5. Rendering the IR

The renderer walks HMD-0020 §7 and does no markdown parsing of its own.

- `HtmlBlock.html` is inserted as-is. It is already escaped by the core's
  `html: false` configuration; the renderer MUST NOT re-enable HTML for it.
- `EmbedBlock` renders as a **card**: a bordered region with a header naming
  the source card and fragment, a disclosure control honouring
  `preview.embeds`, and a body that is the recursive rendering of
  `EmbedBlock.document`. Nesting depth is visible in the UI, since a card three
  levels deep that looks identical to a top-level one is misleading about where
  the text came from.
- The card header navigates to the **embedded** card's source, not the
  embedding one (VSX-022).
- An `EmbedBlock` with `resolution.state !== "resolved"` renders as a card
  carrying the failure and its rule ID, not as nothing. A silently-dropped
  embed is the worst available outcome: the document reads as complete and is
  not.
- `a.hmd-redlink` renders in the theme's error-adjacent colour and offers
  create-card. Creating writes exactly one file at the path the resolver would
  next have searched, seeded with an `# H1` matching the link text, and the
  write MUST go through `WorkspaceEdit` so it lands in the undo stack (VSX-054).
- `a.hmd-ambiguous` renders distinctly from both resolved and red links, and
  its hover lists the candidates from `Resolution.candidates`. `HMD002` is an
  error the author must arbitrate; showing it as an ordinary broken link would
  suggest the wrong fix.
- All colours derive from VS Code theme CSS variables
  (`--vscode-*`). No hard-coded palette, so light, dark, and high-contrast
  themes work without a per-theme stylesheet.
- A document larger than **4 MiB** is not rendered; the webview shows a notice
  instead. Reported through the extension's own channel, never as a lint rule
  (HMD-0020 §9).

#### 5.1 Live editing

The preview follows the in-memory buffer, so it is redrawn while its source is
in a transiently invalid state. This subsection is what makes that survivable.

- The host MUST render from the **unsaved buffer**, re-parsing 150 ms after the
  last keystroke (§6). Saving MUST NOT be a precondition for anything the
  preview shows.
- The renderer MUST **patch** the existing DOM against the incoming IR, keyed
  by `Block.key` (HMD-0020 §7), rather than replacing the document. Blocks whose
  key and content are unchanged MUST NOT be touched. This preserves scroll
  position, embed collapse state, and focus across an update (VSX-019), and it
  is also what keeps the update cost proportional to the edit rather than to
  the document.
- The panel MUST NOT blank, show an error page, or flash an intermediate state
  between renders. A construct in the middle of being typed renders as literal
  text — which HMD-0020 §3.2 already requires for malformed input — and the
  surrounding card renders normally (VSX-018).
- If a render fails outright, the previous render MUST stay on screen and the
  failure MUST be surfaced without clearing it. Stale content with a warning is
  strictly better than a blank panel, because the author can still read what
  they wrote.
- Scroll sync MUST hold its position by source line across a re-render, not by
  pixel offset. Content above the viewport changes height as it is edited.
- Editing a card that the previewed card **embeds** MUST re-render the preview,
  from the embedded card's unsaved buffer where it is open in another tab. An
  embed is a live window onto another card, and a window that shows a stale
  copy of a file open two tabs away is a bug the author will not think to
  suspect.
- **Diagnostics run on a slower clock than the preview.** Diagnostics for a
  document are published **500 ms** after the last keystroke, and diagnostics
  falling on the line holding the cursor are withheld entirely until the cursor
  leaves that line (VSX-033). Every partially typed link is briefly an
  `HMD001` or `HMD010`; reporting those to the Problems panel in real time
  would make the panel useless and the editor hostile.

### 6. Scroll sync and click-through

Both directions run off the `data-line` attributes HMD-0020 §7 requires.

```text
On render, build ANCHORS = [(sourceLine, elementTop)] for every [data-line],
ascending by sourceLine.

editor → preview:
  find the pair (a, b) in ANCHORS bracketing the editor's top visible line
  scroll to lerp(a.elementTop, b.elementTop, progress between a and b)

preview → editor:
  find the pair bracketing the webview's scrollTop
  reveal the interpolated source line with revealRange(..., AtTop)
```

Timing constants are pinned, because scroll sync that feeds back on itself is
the classic failure of this feature:

- Reparse debounce after the last keystroke: **150 ms**.
- Preview → editor scroll notification throttle: **50 ms**.
- Echo lockout: after applying a scroll from one side, ignore the other side's
  scroll events for **250 ms**.
- Editor → preview scrolling is applied on the next animation frame, unthrottled;
  it is the direction the user perceives as latency.

Click-through:

- A click on `a.hmd-link` opens `data-hmd-path`, revealing the heading or block
  addressed by `data-hmd-fragment` where present (VSX-020).
- A double-click, or a click on any element not inside a link, reveals that
  element's `data-line` in the source editor (VSX-021).
- Navigation MUST preserve the pin state: following a link from a pinned
  preview moves the editor, not the preview.

### 7. Diagnostics

- The extension owns one `DiagnosticCollection` named `HyperMarkDown`.
- Diagnostics come from `@hypermarkdown/core` and are mapped one-for-one:
  rule ID into `Diagnostic.code`, HMD-0001 severity into
  `DiagnosticSeverity.Error` or `.Warning`, and the 1-indexed
  `(line, column)` span into a zero-indexed `Range`.
- `diagnostics.scope: "workspace"` publishes for every card in the index;
  `"open"` publishes only for open documents. The default is `"workspace"`,
  because a red link in a card nobody has opened is exactly the work item the
  format wants surfaced (sketch 28).
- Diagnostics for a document MUST be recomputed from the in-memory buffer, so
  the Problems panel and the preview never disagree about unsaved text.

### 8. The vault catalog, the index, and watching

A **vault** is a directory tree that carries its own `.hmd/`, together with the
namespace root its `wiki` setting names. One folder open in the editor may hold
several, and they nest: this repository holds `doc/wiki` plus one vault per
example tree. The host therefore holds a **catalog** of vaults rather than one
project, and a card is named by the vault that claims it as well as by its path
— the same path means different cards in two vaults.

- **Discovery is per card, not per window.** From the card's own URI the host
  walks up through its parents to the nearest directory carrying `.hmd/`; that
  directory is the card's project root, and `wiki` resolved against it is the
  namespace root, exactly as HMD-0020 §5 defines. This is what the canonical
  implementation's `find_project_root` has always done, so the two agree about
  what "the project" is for a file on disk.
- **The walk stops at the containing workspace folder.** An editor may not read
  arbitrary ancestors of the user's disk, and the `.git` fallback the CLI uses
  is a convenience a workspace folder already provides. It stops at the
  *containing* folder, not the first one, so a multi-root workspace resolves
  each card against its own folder.
- **A marker that does not claim the card does not stop the walk.** A `.hmd/`
  whose `wiki` resolves to a tree the card is not in is some other vault's
  marker; the walk continues above it.
- **The folder itself is the vault of last resort.** With no `.hmd/` anywhere
  above the card, the workspace folder's own root applies — `hyperMarkdown.root`
  when set, else `wiki` from the folder's `.hmd/config.toml`, else `doc/wiki`,
  else the folder. This is what keeps a repository with no marker at its root,
  and a bare directory of cards with no setup at all, working (VSX-061). An
  explicit `hyperMarkdown.root` is an instruction rather than a hint, and wins
  for the folder it is set in.
- **Vaults are built lazily and live for the window.** The first card that asks
  for a vault builds it; it is disposed with the window. One index per vault is
  the honest model — the alternative, re-initialising a single index on every
  crossing, throws the index away each time the user clicks between `doc/wiki`
  and an example tree, and makes diagnostics, backlinks, and the watcher lie
  about which knowledge base they describe.
- **Resolution never crosses a vault boundary.** Two vaults are two namespaces:
  a `[[wikilink]]`, an embed, or a backlink that resolved into a neighbouring
  vault would make the same card render differently depending on what else
  happened to be checked out. Every path in a host/webview message is relative
  to the vault of the card that produced it.
- Each vault owns a `FileSystemWatcher` on `**/*.hmd` under its own namespace
  root, handling create, change, and delete, including changes made outside VS
  Code. A change to `.hmd/config.toml` triggers a full rebuild, since it can
  move the root.
- Index updates MUST be incremental: an edit re-parses one document and
  re-resolves that document and its inbound neighbours (HMD-0020 §6). Rebuilding
  the tree on a keystroke would make VSX-051 unreachable on any real wiki.
- Budgets, as SHOULD, and per vault: a cold index of 1 000 cards within **2 s**;
  parse, resolve, and render of a 100 KiB card within **100 ms**. A window
  holding several vaults pays the cold cost once per vault, when a card in it is
  first opened.
- **The empty state names the cause.** A preview with no card says so; a preview
  looking at an open `.hmd` file that no vault claims MUST say *that* instead,
  and say what would claim it. Telling someone to open a card while they are
  looking at one is accurate about the extension's state and misleading about
  theirs (issue 0108).
- `diagnostics.scope: "workspace"` means every card in the index, and there is
  one index per vault — so it publishes every vault the window has opened a card
  in, and grows as the user moves between them. `"open"` is unchanged and is the
  setting for anyone who wants a fixed scope.

### 9. Backlinks

- The `backlinks` tab lists every card with a resolved edge into the current
  one, read from the reverse edge map the index already maintains — so the
  feature costs a query, not a scan.
- Each entry shows the source card's namespace path, the line, and a one-line
  context snippet, and navigates on click (VSX-023).
- Embed edges are listed distinctly from link edges. "This card is quoted here"
  and "this card is mentioned here" are different facts about a knowledge base.

### 10. Deferred tabs

`graph` and `mind map` are not implemented in v1. The contract they will use is
fixed now so their arrival is additive:

- A tab is a module exporting `mount(container, api)` and receiving `render`
  messages with the same envelope as §4.
- The graph tab will consume the index's node and edge lists — the same data
  `hmd graph --format json` emits — rather than the per-document IR, and will
  render through a JavaScript graph library in the webview. D2 renders static
  SVG server-side and is the wrong tool for click-to-navigate exploration; the
  source sketch §15 is right about this and it should not be relitigated.

### 11. Webview hardening

- The webview is created with `enableScripts: true`, `localResourceRoots`
  limited to the extension's own `media/` directory, and `retainContextWhenHidden`
  **off** — state is rehydrated from a `render` message instead, because
  retaining context costs memory in every window for the whole session.
- The content security policy is pinned:

```text
default-src 'none';
img-src {webview.cspSource} data:;
font-src {webview.cspSource};
style-src {webview.cspSource} 'unsafe-inline';
script-src 'nonce-{nonce}';
```

- `default-src 'none'` and the absence of `connect-src` mean the preview cannot
  reach the network at all (VSX-062). KaTeX fonts are bundled locally, per
  HMD-0020 §3.3, precisely so this policy can hold.
- A fresh nonce MUST be generated per webview load, from
  `crypto.getRandomValues`.
- `style-src 'unsafe-inline'` is permitted only because VS Code injects theme
  variables as an inline style block. No extension-authored inline styles.
- The renderer MUST NOT use `innerHTML` for anything other than
  `HtmlBlock.html`, and MUST NOT construct HTML from `data-hmd-*` values by
  string concatenation.

### 12. Packaging and CI

- Bundled with esbuild into a single `dist/extension.js` plus one
  `media/webview.js`; no `node_modules` in the VSIX (VSX-063).
- `.vscodeignore` excludes sources, tests, and the corpus.
- CI gains a `js` job — install, typecheck, unit tests, corpus run, `vsce
  package` — running independently of the existing Python matrix so neither
  half can block the other's merge.

## Backwards Compatibility

Nothing is released, and the extension is additive to the repository: it adds
`tools/hmd-vsc-ext/` and a CI job, and modifies no existing file
except `.github/workflows/ci.yml` and the proposal index. The `.hmd` files
themselves are unchanged — a card that lints clean today renders unchanged
tomorrow, since every semantic decision is HMD-0020's and HMD-0020 is a port of
HMD-0001 rather than an extension of it.

## Security Considerations

- **Untrusted content in a script host.** Card content reaches a webview.
  Mitigations are layered: HTML escaped at parse time (HMD-0020 §3), a CSP with
  `default-src 'none'` and a per-load script nonce (§11), and a renderer that
  touches `innerHTML` only for content the core produced.
- **The message boundary is a trust boundary** (§4). Every inbound path is
  re-validated against the namespace root before any file operation, so a
  renderer defect cannot become an arbitrary-file-read.
- **Workspace trust.** The extension MUST declare limited support for untrusted
  workspaces: indexing and preview are read-only and safe, so they run;
  create-card is disabled until the workspace is trusted.
- **Writes.** Exactly one code path writes to the workspace — create-card (§5) —
  and it goes through `WorkspaceEdit` so the action is undoable and visible in
  the editor's own history.
- **No telemetry.** The extension collects nothing and has no network capability
  to send it with.

## Deployment / Activation

1. **E1 — skeleton.** Package, `hmd` language, TextMate grammar, view container
   and an empty webview, esbuild, the CI job. No core dependency yet; this step
   is verifiable by opening a `.hmd` file and seeing it highlighted.
2. **E2 — index and diagnostics.** Wire `@hypermarkdown/core` to
   `vscode.workspace.fs`, build the index, publish diagnostics. Proves the
   whole host-side stack with no rendering at all.
3. **E3 — the rendered tab.** IR delivery, the renderer, embed cards, red
   links, scroll sync, click-through. This is the milestone the feature exists
   for; everything before it is scaffolding and everything after is additive.
4. **E4 — backlinks, breadcrumb, create-card, pin.**
5. **E5 — packaging.** VSIX, marketplace metadata, README, an animated capture
   of E3 doing its job.
6. **E6 — the graph tab**, under the §10 contract.

E1 and E2 depend only on HMD-0020's parser and resolver stages, so they can
start as soon as those land and before expansion exists.

## Reference Implementation

```text
tools/hmd-vsc-ext/
  package.json            contributions of §1
  syntaxes/hmd.tmLanguage.json
  src/
    extension.ts          activation, commands, disposables
    workspaceHost.ts      WorkspaceHost over vscode.workspace.fs, discovery
    catalog.ts            the vault catalog: which vault claims a URI
    vault.ts              one vault's index, watcher, and unsaved buffers
    diagnostics.ts        core diagnostics → DiagnosticCollection
    preview/
      view.ts             WebviewViewProvider
      panel.ts            WebviewPanel, ViewColumn.Beside
      html.ts             shell HTML, CSP, nonce
      protocol.ts         message types, shared with the webview
    commands/
      createCard.ts
  media/
    webview.ts            renderer entry, tab strip, scroll sync
    tabs/rendered.ts
    tabs/backlinks.ts
    webview.css           theme variables only
  test/
    unit/                 vitest, renderer and protocol
    integration/          @vscode/test-cli
```

## Test Plan

Unit tests (vitest, jsdom) MUST include:

- IR → DOM: an `EmbedBlock` renders a card whose header carries the embedded
  card's path; a nested embed renders a nested card; an unresolved embed
  renders a failure card rather than nothing.
- Every rendered block carries `data-line` matching its IR span.
- Scroll sync: the anchor interpolation is exact at anchors and monotonic
  between them; the echo lockout suppresses a synthetic round trip.
- Protocol: a malformed inbound message is rejected; an `openSource` for a path
  outside the root is rejected.
- Discovery: a folder holding a nested vault resolves a card in each to
  different roots, over a real directory tree rather than a stubbed one — the
  claim is about a tree, so faking the tree would test nothing (issue 0108).
- CSP: the generated shell HTML contains a nonce, and every `<script>` carries
  it.

Integration tests (`@vscode/test-cli`) MUST include:

- Opening a fixture card activates the extension, populates the index, and
  publishes exactly the diagnostics `hmd lint` publishes for the same tree.
- `openPreviewToSide` opens a panel rendering the same content as the view.
- Editing a buffer without saving updates both the preview and the diagnostics.
- Typing an incomplete `[[` and pausing leaves the preview rendered and the
  Problems panel silent for that line; completing the link resolves it without
  an intervening blank frame.
- Editing a paragraph halfway down a long card leaves the preview's scroll
  position and every collapsed embed card exactly as they were.
- Deleting a card's target on disk turns its inbound links red without a
  reload.

```bash
npm ci
npm run -w tools/hmd-vsc-ext typecheck
npm run -w tools/hmd-vsc-ext test
npm run -w tools/hmd-vsc-ext package
```

## Open Questions

- Should the preview render `.md` files found under the namespace root?
  HMD-0001 §4 makes them invisible to the resolver, but a user who opens one
  next to a card will read the empty preview as a failure.
- Should an untitled or out-of-workspace `.hmd` buffer preview at all, with no
  namespace root to resolve against? Rendering with every link red is honest
  but noisy.
- Does the extension bundle `@hypermarkdown/core` from the workspace or depend
  on the published npm package? Bundling is simpler until the package has
  external consumers, and painful afterwards.
- What is the marketplace publisher identity, and does the extension ID match
  the npm scope?
- Does the create-card action pick the target path itself, or always prompt?
  Picking is faster and occasionally lands the card in a namespace the author
  did not intend.

## Changelog

- 2026-08-06: drafted
- 2026-08-06: §5.1 added — live editing against the unsaved buffer, keyed DOM
  patching, no-blank rendering, and diagnostics on a slower clock than the
  preview
- 2026-08-08: §3 rewritten — the preview is an editor tab, the view container
  is gone, several previews may be open at once, and panels are restored
  across a reload. Retires the secondary-side-bar Open Question (VSX-001),
  which the change makes moot rather than answers. See issue 0103.
- 2026-08-08: §3 corrected — the same revision had a preview pin itself to
  whichever card was active when it opened, which stopped it following the
  editor or its own links for the life of the tab. Following is now normative
  and unconditional, link clicks move the preview, and revealed source may not
  land in the preview's own column. See issue 0105.
- 2026-08-08: §3 — the pinned flag is barred from persisted state, and opening
  a preview reuses the unpinned one already in the target column. The first
  correction reached only previews created after it; tabs restored from
  workspace storage carried `pinned: true` written by the older build and came
  back frozen. See issue 0105, second round.
