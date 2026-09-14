/**
 * The preview surface: a tab in an editor column (HMD-0021 §3).
 *
 * There is no singleton. A column of preview tabs, each held on its own card,
 * is the point of the surface — the same way a column holds several editors.
 * What the panels share is one `PreviewController` implementation, not one
 * instance of it.
 */

import * as vscode from "vscode";

import { SUFFIX } from "@hypermarkdown/core";

import type { VaultCatalog } from "../catalog.js";
import { PreviewController } from "./controller.js";
import { shellFor } from "./html.js";

export const VIEW_TYPE = "hyperMarkdown.previewPanel";

const UNTITLED = "HyperMarkDown Preview";

/**
 * State persisted by the webview and handed back on window reload.
 *
 * The card and the vault that claims it. Persisting `pinned` meant a preview could come back frozen
 * from storage written by an older build, with nothing on screen to explain
 * why it had stopped following — and no way to tell deliberate state from
 * stale state. A restored preview always follows; re-pinning is one click
 * (issue 0105).
 */
export interface PanelState {
  /** The card's path inside its vault. */
  card: string | null;
  /** The vault that claimed it, which may not be indexed yet on restore. */
  vault: string | null;
}

export interface OpenOptions {
  /** Which column the tab lands in. */
  column: vscode.ViewColumn;
  preserveFocus?: boolean;
}

export class PreviewPanel implements vscode.Disposable {
  private static readonly panels = new Set<PreviewPanel>();

  /** The focused preview tab, for commands that act on "this preview". */
  static active: PreviewPanel | undefined;

  private readonly controller: PreviewController;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    catalog: VaultCatalog,
    extensionUri: vscode.Uri,
  ) {
    panel.iconPath = vscode.Uri.joinPath(extensionUri, "media", "logo.svg");
    panel.webview.html = shellFor(panel.webview, extensionUri);

    // The panel is the only object that knows which column it occupies, and
    // the controller must not reveal source into it.
    this.controller = new PreviewController(catalog, panel.webview, () => panel.viewColumn);
    this.disposables.push(
      this.controller,
      this.controller.onDidChangeCard((card) => this.retitle(card)),
      panel.onDidChangeViewState(() => {
        if (panel.active) PreviewPanel.active = this;
        else if (PreviewPanel.active === this) PreviewPanel.active = undefined;
      }),
      panel.onDidDispose(() => this.dispose()),
    );

    PreviewPanel.panels.add(this);
    if (panel.active) PreviewPanel.active = this;
    this.retitle(this.controller.card);
  }

  static open(catalog: VaultCatalog, extensionUri: vscode.Uri, options: OpenOptions): PreviewPanel {
    const preserveFocus = options.preserveFocus ?? false;

    // Two unpinned previews in one column are indistinguishable — both show
    // the active card — so a second one is not a feature, it is a way to lose
    // track of which tab you are reading (issue 0105). Pinned previews are
    // parked on their own cards and are never reused.
    const existing = PreviewPanel.reusableIn(resolveColumn(options.column));
    if (existing !== undefined) {
      existing.panel.reveal(existing.panel.viewColumn, preserveFocus);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      UNTITLED,
      { viewColumn: options.column, preserveFocus },
      webviewOptions(extensionUri),
    );

    // Opens following the active editor. Pinning on open froze the preview for
    // the life of the tab, because pinning is the absence of following rather
    // than a weaker form of it (issue 0105).
    return new PreviewPanel(panel, catalog, extensionUri);
  }

  private static reusableIn(column: vscode.ViewColumn | undefined): PreviewPanel | undefined {
    if (column === undefined) return undefined;
    return [...PreviewPanel.panels].find(
      (preview) => preview.panel.viewColumn === column && !preview.controller.isPinned,
    );
  }

  /** Rebuild a panel VS Code restored from a previous window (§3). */
  static restore(
    panel: vscode.WebviewPanel,
    catalog: VaultCatalog,
    extensionUri: vscode.Uri,
    state: PanelState | null,
  ): PreviewPanel {
    panel.webview.options = webviewOptions(extensionUri);
    const preview = new PreviewPanel(panel, catalog, extensionUri);
    // Show the card it held so the tab is not blank before the first editor
    // change, but leave it following. A path alone is not a card any more:
    // without its vault there is nothing to resolve it against, so a state
    // written by an older build restores blank and follows the next editor.
    if (state !== null && state.card !== null && state.vault !== null) {
      void preview.controller.restore(state.vault, state.card);
    }
    return preview;
  }

  togglePin(): boolean {
    return this.controller.togglePin();
  }

  /** Tear down every live preview, for the extension's own disposal. */
  static disposeAll(): void {
    for (const preview of [...PreviewPanel.panels]) preview.dispose();
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
    PreviewPanel.panels.delete(this);
    if (PreviewPanel.active === this) PreviewPanel.active = undefined;
  }

  /**
   * Name the tab after its card.
   *
   * A column holding four previews is unreadable when all four tabs say
   * "HyperMarkDown Preview".
   */
  private retitle(card: string | null): void {
    this.panel.title = card === null ? UNTITLED : basename(card);
  }
}

/**
 * Turn a requested column into the concrete one a panel would land in.
 *
 * `Active` and `Beside` are instructions, not columns; only a resolved column
 * can be compared against a live panel's own.
 */
function resolveColumn(column: vscode.ViewColumn): vscode.ViewColumn | undefined {
  if (column === vscode.ViewColumn.Beside) return undefined;
  if (column !== vscode.ViewColumn.Active) return column;
  return vscode.window.tabGroups.activeTabGroup?.viewColumn;
}

function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
  };
}

function basename(rel: string): string {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
}
