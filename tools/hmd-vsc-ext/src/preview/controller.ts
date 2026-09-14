/**
 * One preview tab's behaviour (HMD-0021 §3, §5.1, §6).
 *
 * Several of these are alive at once — one per preview tab — so a controller
 * owns only what is per-preview: which card it holds, whether it is pinned,
 * and its scroll bookkeeping. Anything shared — the vaults, their indexes, and
 * the unsaved-buffer overrides — belongs to the `VaultCatalog`.
 *
 * A card is named by the vault that claims it as well as by its path, because
 * one window may hold several vaults and the same path means different cards
 * in two of them.
 */

import * as vscode from "vscode";

import { IR_VERSION, SUFFIX } from "@hypermarkdown/core";

import { sameCard, type CardRef, type VaultCatalog } from "../catalog.js";
import { createCard } from "../commands/createCard.js";
import { REPARSE_DEBOUNCE_MS, debounce } from "../debounce.js";
import {
  isSafeRelativePath,
  parseWebviewMessage,
  type GraphView,
  type HostMessage,
  type PreviewMode,
  type PreviewSettings,
} from "../protocol.js";
import { DEFAULT_GRAPH_VIEW, buildGraphView } from "./graphView.js";

/** How long to ignore the other side's scroll after applying one (§6). */
export const ECHO_LOCKOUT_MS = 250;
/** Throttle on preview -> editor scroll notifications (§6). */
export const SCROLL_THROTTLE_MS = 50;

export class PreviewController implements vscode.Disposable {
  private mode: PreviewMode = "rendered";
  /**
   * Which cut of the graph this preview is showing.
   *
   * Per preview and not persisted: it is a way of looking at the card on
   * screen, and the card changes under it as the reader moves.
   */
  private graphView: GraphView = DEFAULT_GRAPH_VIEW;
  private pinned = false;
  private current: CardRef | null = null;
  private lastAppliedScroll = 0;
  /** An open `.hmd` file no vault claims, so the empty state can say which. */
  private unclaimed: vscode.Uri | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly refresh = debounce(REPARSE_DEBOUNCE_MS, () => this.send());
  private readonly cardChanged = new vscode.EventEmitter<string | null>();

  /** Fires when this preview moves to a different card. */
  readonly onDidChangeCard = this.cardChanged.event;

  constructor(
    private readonly catalog: VaultCatalog,
    private readonly webview: vscode.Webview,
    /** The column this preview occupies, so source never opens on top of it. */
    private readonly hostColumn: () => vscode.ViewColumn | undefined = () => undefined,
  ) {
    this.disposables.push(
      webview.onDidReceiveMessage((raw: unknown) => this.receive(raw)),
      catalog.onDidChange((card) => {
        if (card === null || sameCard(card, this.current)) this.refresh();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => void this.follow()),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.onEditorScroll(event)),
    );
    void this.follow();
  }

  dispose(): void {
    this.refresh.cancel();
    for (const d of this.disposables) d.dispose();
    this.cardChanged.dispose();
  }

  /** The path of the card on screen, for the tab title. */
  get card(): string | null {
    return this.current?.rel ?? null;
  }

  get isPinned(): boolean {
    return this.pinned;
  }

  togglePin(): boolean {
    this.pinned = !this.pinned;
    this.send();
    return this.pinned;
  }

  /**
   * Hold this preview on one card for good.
   *
   * `show` alone would not survive the next active-editor change, and a tab
   * opened from a card is expected to keep showing that card.
   */
  pinTo(card: CardRef): void {
    this.pinned = true;
    this.setCard(card);
    this.send();
  }

  setMode(mode: PreviewMode): void {
    this.mode = mode;
    this.send();
  }

  /** Point the preview at one card, regardless of the active editor. */
  show(card: CardRef): void {
    this.setCard(card);
    this.send();
  }

  /**
   * Point the preview at the card a reloaded window handed back.
   *
   * The vault behind the persisted key need not be indexed yet — the catalog
   * builds vaults when a card asks for one, and a restored tab is exactly that
   * ask arriving before any editor has been clicked. The persisted state
   * survived a window reload and a possible extension update, so the path is
   * checked here the way an inbound message would be.
   */
  async restore(vaultKey: string, rel: string): Promise<void> {
    if (!isSafeRelativePath(rel) || !rel.endsWith(SUFFIX)) return;

    const indexed = this.catalog.vaultAt(vaultKey);
    if (indexed !== undefined) {
      this.show({ vault: indexed, rel });
      return;
    }

    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.parse(`${vaultKey}/${rel.split("/").map(encodeURIComponent).join("/")}`, true);
    } catch {
      return;
    }
    const card = await this.catalog.openCard(uri);
    if (card !== null) this.show(card);
  }

  // -- editor -> preview -----------------------------------------------

  /**
   * Move to the active editor's card, indexing its vault the first time.
   *
   * Asynchronous because discovery walks the file system: the vault that
   * claims a card is found by walking up from the card itself, and a click
   * into an example tree is the first time this window has heard of it.
   */
  private async follow(): Promise<void> {
    if (this.pinned) return;
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return;
    const uri = editor.document.uri;
    const card = await this.catalog.openCard(uri);
    if (card === null) {
      // Say so only while that editor is still the active one: the answer
      // arrived late, and the user may have clicked on.
      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        this.unclaimed = uri;
        this.send();
      }
      return;
    }
    this.unclaimed = null;
    this.setCard(card);
    this.send();
  }

  private setCard(card: CardRef | null): void {
    if (sameCard(this.current, card)) return;
    this.current = card;
    this.cardChanged.fire(card?.rel ?? null);
  }

  private onEditorScroll(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (!this.settings().scrollSync) return;
    if (Date.now() - this.lastAppliedScroll < ECHO_LOCKOUT_MS) return;
    const card = this.catalog.cardFor(event.textEditor.document.uri);
    if (!sameCard(card, this.current)) return;
    const range = event.visibleRanges[0];
    if (range === undefined) return;
    this.post({ type: "revealLine", line: range.start.line + 1 });
  }

  // -- preview -> editor -----------------------------------------------

  private receive(raw: unknown): void {
    const message = parseWebviewMessage(raw);
    if (message === null) return;

    switch (message.type) {
      case "ready":
        this.send();
        return;
      case "modeChanged":
        // Tabs are switched in the webview, so the host hears about the switch
        // rather than causing it — and the new tab has nothing to draw until
        // this sends it.
        this.mode = message.mode;
        this.send();
        return;
      case "graphView":
        this.graphView = message.view;
        this.send();
        return;
      case "scrolled":
        this.applyScroll(message.line);
        return;
      case "openSource":
        // Revealing a source line means going there to edit it, so focus goes
        // with you.
        void this.open(message.path, message.line, null, { follow: false });
        return;
      case "openTarget":
        // Following a link means reading, so focus stays in the preview and
        // the next link is one click away rather than two.
        void this.open(message.path, null, message.fragment, { follow: true });
        return;
      case "createCard":
        void createCard(this.catalog, this.current, message.target);
        return;
      default:
        return;
    }
  }

  private applyScroll(line: number): void {
    if (!this.settings().scrollSync) return;
    const editor = vscode.window.visibleTextEditors.find((e) =>
      sameCard(this.catalog.cardFor(e.document.uri), this.current),
    );
    if (editor === undefined) return;
    this.lastAppliedScroll = Date.now();
    const target = Math.min(Math.max(line - 1, 0), editor.document.lineCount - 1);
    editor.revealRange(
      new vscode.Range(target, 0, target, 0),
      vscode.TextEditorRevealType.AtTop,
    );
  }

  private async open(
    requested: string,
    line: number | null,
    fragment: string | null,
    options: { follow: boolean },
  ): Promise<void> {
    // Every path in a message is relative to the vault of the card that
    // produced it: a link never leaves its own namespace, so there is no
    // discovery to do here.
    const source = this.current;
    if (source === null) return;

    // An empty path means "the card being previewed", which is what a
    // click-to-reveal on ordinary rendered content asks for (VSX-021).
    const path = requested === "" ? source.rel : requested;

    // The renderer only sends paths the core produced, so this can only fire on
    // a defect — which is exactly when a file-read primitive would be worth
    // having (§4).
    if (!isSafeRelativePath(path) || !path.endsWith(SUFFIX)) return;
    const uri = source.vault.uriFor(path);

    // Move this preview itself rather than waiting for the active editor to
    // change, which is what lets focus stay in the webview (issue 0105).
    if (options.follow && !this.pinned) this.show({ vault: source.vault, rel: path });

    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preserveFocus: options.follow,
      viewColumn: this.sourceColumn(),
    });

    const target = line ?? this.lineOfFragment(path, fragment);
    if (target !== null) {
      const at = Math.min(Math.max(target - 1, 0), document.lineCount - 1);
      editor.selection = new vscode.Selection(at, 0, at, 0);
      editor.revealRange(new vscode.Range(at, 0, at, 0), vscode.TextEditorRevealType.AtTop);
    }
  }

  /**
   * Where to reveal source: anywhere but this preview's own column.
   *
   * A hard-coded column one put the source on top of the preview whenever the
   * preview happened to be there, which is the ordinary case for anyone whose
   * second group is locked to something else (issue 0105).
   */
  private sourceColumn(): vscode.ViewColumn {
    const mine = this.hostColumn();
    const active = vscode.window.activeTextEditor?.viewColumn;
    if (active !== undefined && active !== mine) return active;

    const elsewhere = vscode.window.tabGroups.all.find(
      (group) => group.viewColumn !== mine,
    );
    if (elsewhere !== undefined) return elsewhere.viewColumn;

    // Only the preview's own group exists, so there is nowhere to put the
    // source except a new group.
    return vscode.ViewColumn.Beside;
  }

  private lineOfFragment(path: string, fragment: string | null): number | null {
    if (fragment === null) return null;
    const ir = this.current?.vault.render(path) ?? null;
    if (ir === null) return null;
    const heading = ir.headings.find((h) => h.slug === fragment || h.text === fragment);
    return heading?.line ?? null;
  }

  // -- delivery --------------------------------------------------------

  private settings(): PreviewSettings {
    const config = vscode.workspace.getConfiguration("hyperMarkdown");
    return {
      scrollSync: config.get<boolean>("preview.scrollSync", true),
      embeds: config.get<"expanded" | "collapsed">("preview.embeds", "expanded"),
    };
  }

  /**
   * Send the current card.
   *
   * A failed render leaves the previous one on screen: stale content with a
   * warning is strictly better than a blank panel, because the author can still
   * read what they wrote (§5.1).
   */
  private send(): void {
    if (!this.catalog.ready) return;
    if (this.current === null) {
      this.post({ type: "error", message: this.emptyState() });
      return;
    }

    if (this.mode === "graph") {
      this.post({
        type: "graph",
        irVersion: IR_VERSION,
        graph: buildGraphView(this.current.vault.graph(), this.current.rel, this.graphView),
      });
      return;
    }

    let document;
    try {
      document = this.current.vault.render(this.current.rel);
    } catch (exc) {
      this.post({
        type: "error",
        message: `Render failed: ${exc instanceof Error ? exc.message : String(exc)}`,
      });
      return;
    }

    if (document === null) {
      this.post({ type: "error", message: `${this.current.rel} is not in the index.` });
      return;
    }

    const mode = this.mode;
    const settings = this.settings();
    const pinned = this.pinned;
    const card = this.current;

    // Reading diagram artifacts is the one asynchronous step; the guard below
    // drops the result if the preview moved on while it was in flight.
    void this.catalog.attachDiagrams(document).then((withDiagrams) => {
      if (!sameCard(this.current, card)) return;
      this.post({
        type: "render",
        irVersion: IR_VERSION,
        vault: card.vault.key,
        document: withDiagrams,
        mode,
        settings,
        pinned,
      });
    });
  }

  /**
   * What to say when there is nothing to draw.
   *
   * "Open a .hmd card to preview it" was told to people looking straight at an
   * open card: what it meant was that no vault claimed the file, which is a
   * different fact and the one they can act on (issue 0108).
   */
  private emptyState(): string {
    if (this.unclaimed === null) return "Open a .hmd card to preview it.";
    const name = this.unclaimed.path.slice(this.unclaimed.path.lastIndexOf("/") + 1);
    return `No HyperMarkDown vault claims ${name}. A vault is a directory carrying a .hmd/ directory; add one at the root of this card's tree, or set hyperMarkdown.root.`;
  }

  private post(message: HostMessage): void {
    void this.webview.postMessage(message);
  }
}

export { SCROLL_THROTTLE_MS as PREVIEW_SCROLL_THROTTLE_MS };
