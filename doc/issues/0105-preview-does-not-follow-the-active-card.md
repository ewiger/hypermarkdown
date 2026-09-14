# 0105 — The preview freezes on the card it was opened over

**Column**: todo
**Opened**: 2026-08-08

## Symptom

Two, and they are the same defect seen from two directions.

Clicking a different card — in the Explorer, or on another editor tab — leaves
the preview showing the card it started on. VS Code's own markdown preview
follows the active editor, and that is what the surface is expected to do.

Worse, clicking a `[[wikilink]]` inside the preview opens the target's source
in the other column and the preview stays where it was. Following links is the
one thing a wiki preview does that a file viewer cannot, and it does not work
at all.

## Cause

`d57646d` gave the editor-column surface a rule: a preview opened while a card
is active is pinned to that card. The argument was that unpinned previews all
show the same thing, so pinning on open is what makes a column of them useful.

The argument is sound and the rule is still wrong, because pinning is not a
weaker form of following — it is the *absence* of it:

```ts
private follow(): void {
  if (this.pinned) return;
```

`PreviewPanel.open` calls `pinTo(card)`, which sets `pinned = true`, so
`follow` returns on every subsequent editor change for the life of the tab.
Nothing else moves the preview, so nothing moves it. A feature meant to make
the second preview useful made the first one inert.

Underneath it sits a defect nobody has hit yet. `PreviewController.open`
hard-codes `vscode.ViewColumn.One` for the source it reveals, so once links
work again a click can open the source *into the group the preview occupies*.
It looks correct today only because the preview is usually not in column one.

## Fix

One rule: **the preview shows the active editor's card**, unless it is pinned.

1. Drop the `pinTo` call in `PreviewPanel.open`. Panels open following.
2. Pinning stays, and becomes reachable: a `$(pin)` toggle in the editor title
   bar, shown when a preview tab is focused. The command and its icon already
   exist; only the menu entry is missing. A capability nobody can find is
   close to not having it, and that is what made the automatic rule tempting.
3. Split the two inbound navigations, which share one handler and should not:
   - `openTarget` — a link click, and you are *reading*. Open the source with
     `preserveFocus: true` and move this preview to the target directly, so
     the next link is one click away instead of requiring a click back into
     the preview first. Going straight to the card rather than waiting on
     `onDidChangeActiveTextEditor` is what lets focus stay put.
   - `openSource` — a click on rendered content, and you are going there to
     edit. Keep `preserveFocus: false`.
4. Resolve the column for revealed source instead of hard-coding it: the
   active text editor's column when it is not the preview's own, otherwise the
   first tab group that is not the preview's.

`showTextDocument`'s `preview` flag stays unset. VS Code opens a transient tab
by default, which is what keeps browsing from accumulating editor tabs, and
forcing it would override anyone who turned `workbench.editor.enablePreview`
off deliberately.

## Second round — the frozen preview came back from disk

The first fix worked for previews opened after it, and not at all for the ones
already on screen. Reported as a column bug: a preview in column one followed,
one in column two stayed stale. The columns were a coincidence — the stale tab
was in whichever column it had been in *before* the fix.

The webview persists its state on every render, and VS Code keeps that in
workspace storage across restarts of the Extension Development Host. Every
panel the pre-fix build created wrote `pinned: true`, and `PreviewPanel.restore`
read it back and called `pinTo`. So `npm run example` faithfully reconstructed
the old bug from disk, on a tab that looked identical to a working one.

Two changes, and the second is the one that stops this recurring:

1. **`pinned` leaves the persisted state entirely.** Only the card is stored.
   A restored preview shows the card it held and follows from there. Persisted
   UI state outlives the build that wrote it, and there is no way to tell a
   deliberately pinned preview from a stale flag — so the flag should not
   survive a reload at all. Re-pinning is one click.
2. **Opening a preview reuses the unpinned one already in that column**
   instead of stacking another. Two unpinned previews in a column are
   indistinguishable, because both show the active card; the second one is not
   a feature, it is how you end up reading a tab you think is broken. Pinned
   previews are parked on their own cards and are never reused, which is what
   still makes several of them worth having.

`ViewColumn.Active` and `Beside` are instructions rather than columns, so
reuse resolves them against `tabGroups.activeTabGroup` before comparing.

## Done when

- Clicking a different card in the Explorer or the tab bar re-renders the
  preview on it.
- Clicking a `[[wikilink]]` leaves the preview *and* the editor on the target
  card, with focus still in the preview.
- A pinned preview ignores both, and pinning is one click from the tab.
- Revealed source never opens into the group the preview occupies.
- `test/panel.test.ts` asserts following, not pinning, on open — the existing
  test encodes the defect and has to be inverted rather than deleted.
- A preview restored from workspace storage follows, whatever the stored state
  says, and clicking the ⚡ twice in one column leaves one preview open.
- HMD-0021 §3, `doc/status/vsc-ext.md` E7.3, and the extension README stop
  describing pin-on-open as intended.
