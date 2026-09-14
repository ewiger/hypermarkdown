# 0103 — The preview is a side-bar view when it wants to be a tab in a column

**Column**: done
**Opened**: 2026-08-08

## Symptom

The preview's primary surface is a `WebviewView` inside an activity-bar view
container. VS Code's manifest offers `activitybar` and `panel` as contribution
points and nothing else, so the container cannot default to where it belongs:
the user drags it once and VS Code remembers the move in workspace storage —
invisible, per-machine, and not expressible in a file.

The editor-column surface exists as an escape hatch, and it is wrong in two
ways. `PreviewPanel` is a singleton, so a second card cannot be held open
beside the first. And it opens in `ViewColumn.Beside`, which fails exactly
where it is needed most: when the neighbouring editor group is **locked**, VS
Code will not place an editor into it and spawns a third group instead.

## Why it matters

The layout this has to serve is two editor groups and no Explorer. The right
group is locked and holds Claude Code, Codex, and their kin as webview *tabs*,
each with its own icon. The left group is unlocked and is where clicking
around opens editors. Those extensions are not side-bar views, and that is why
they compose: a tab in a column can be pinned, reordered, split, and left
alone, and it does not compete with the one side bar for space.

A preview of a knowledge base is a reading surface. It belongs in the same
place as the things being read.

## What

1. **The side-bar view goes away entirely.** `contributes.viewsContainers`,
   `contributes.views`, and `src/preview/view.ts` are deleted. One surface
   means one code path, and it retires VSX-001 rather than answering it.
2. **A ⚡ appears in every editor group's title bar in a HyperMarkDown
   workspace**, driven by a `hyperMarkdown.hasRoot` context key rather than
   `editorLangId == hmd`. The button must not disappear the moment the column
   shows a `.ts` file, and it must not appear in unrelated projects.
3. **Clicking it opens a new tab in the column that was clicked**
   (`ViewColumn.Active`), and **several preview tabs may coexist**.
4. **A tab opened while a card is active is pinned to that card.** Unpinned
   panels follow the active editor, so more than one of them shows the same
   content by construction; pinning on open is what makes a column of previews
   worth having.

## Design

| Concern | Resolution |
| --- | --- |
| Where the button lives | `menus.editor/title`, `group: navigation`, `when: hyperMarkdown.hasRoot` |
| When the key is set | after `Store.initialize()` and on every whole-index change, from `Store.ready` |
| Activation | explicit `activationEvents`; deleting `contributes.views` removes the auto-generated `onView:`, and `onLanguage:hmd` alone would hide the ⚡ until a card is opened |
| Which column | `ViewColumn.Active` for the button, `ViewColumn.Beside` kept for the palette command |
| How many panels | a `Set`, not a singleton; `PreviewPanel.active` tracked through `onDidChangeViewState` for the pin command |
| Which card | pinned to the active card if there is one, following otherwise |
| Across a reload | a `WebviewPanelSerializer` plus `onWebviewPanel:` activation, restoring `{ card, mode, pinned }` from webview state |

One prerequisite hides in the multi-panel change. `PreviewController`
subscribes to `onDidChangeTextDocument` and calls `store.update()` from the
handler, which is correct for one controller and quadratic for N: every panel
writes the same buffer into the index on every keystroke, and every write fans
a change event back to every panel. The subscription moves into `Store`, next
to the `onDidCloseTextDocument` handler that already maintains `overrides`.
This is not cleanup — the surface change is unsafe without it.

The tab icon is the ⚡ of [0104](0104-the-bolt-is-the-extension-logo.md).
Until that lands, `$(open-preview)` is a working placeholder; neither issue
blocks the other.

## Done when

- `contributes.viewsContainers`, `contributes.views`, and
  `src/preview/view.ts` no longer exist, and the preview has exactly one host.
- With a split window whose right group is locked, clicking the title-bar
  button in the left group opens a preview tab **in the left group** — no
  third group appears.
- The button is present on a non-`.hmd` editor in a workspace that has cards,
  and absent in a workspace that has none.
- Two preview tabs pinned to two different cards both stay on their own card
  while the active editor changes.
- Reload Window brings both tabs back, each still on its card.
- `PreviewController` no longer touches `vscode.workspace`'s document-change
  event, and `test/panel.test.ts` covers the column, the count, and the pin.
- HMD-0021 §3 is rewritten around the editor tab, its secondary-side-bar Open
  Question is deleted, and `doc/status/vsc-ext.md` loses its **V1** entry.
