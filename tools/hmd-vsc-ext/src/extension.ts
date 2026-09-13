/**
 * Activation, commands, and disposables (HMD-0021 §1).
 *
 * Activation is `workspaceContains` on any `.hmd` file, plus the language, so
 * the bolt in the editor title bar is there before the first card is opened. A
 * knowledge-base extension that costs startup time in every window will be
 * uninstalled by people who have one `.hmd` file.
 */

import * as vscode from "vscode";

import { createCard } from "./commands/createCard.js";
import { DiagnosticPublisher } from "./diagnostics.js";
import { PreviewPanel, VIEW_TYPE, type PanelState } from "./preview/panel.js";
import { Store } from "./store.js";

/** Gates the editor title-bar button: this workspace is a knowledge base. */
const HAS_ROOT = "hyperMarkdown.hasRoot";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new Store(context.extensionUri);
  context.subscriptions.push(store, { dispose: () => PreviewPanel.disposeAll() });

  const diagnostics = new DiagnosticPublisher(store);
  context.subscriptions.push(diagnostics);

  const publishHasRoot = (): void => {
    void vscode.commands.executeCommand("setContext", HAS_ROOT, store.ready);
  };
  context.subscriptions.push(
    store.onDidChange((rel) => {
      if (rel === null) publishHasRoot();
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel, state: unknown): Promise<void> {
        PreviewPanel.restore(panel, store, context.extensionUri, panelState(state));
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hyperMarkdown.openPreview", () => {
      PreviewPanel.open(store, context.extensionUri, { column: vscode.ViewColumn.Active });
    }),
    vscode.commands.registerCommand("hyperMarkdown.openPreviewToSide", () => {
      PreviewPanel.open(store, context.extensionUri, {
        column: vscode.ViewColumn.Beside,
        preserveFocus: true,
      });
    }),
    vscode.commands.registerCommand("hyperMarkdown.togglePin", () => {
      const preview = PreviewPanel.active;
      if (preview === undefined) {
        void vscode.window.setStatusBarMessage("HyperMarkDown: no preview tab is focused", 2000);
        return;
      }
      void vscode.window.setStatusBarMessage(
        preview.togglePin() ? "HyperMarkDown: preview pinned" : "HyperMarkDown: preview following",
        2000,
      );
    }),
    vscode.commands.registerCommand("hyperMarkdown.refreshIndex", async () => {
      await store.rebuild();
      diagnostics.refresh();
    }),
    vscode.commands.registerCommand("hyperMarkdown.createCardFromLink", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) return;
      const target = await vscode.window.showInputBox({
        prompt: "Card to create, as it would be written in a [[wikilink]]",
      });
      if (target === undefined || target.trim() === "") return;
      await createCard(store, store.relFor(editor.document.uri), target.trim());
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("hyperMarkdown.root")) void store.rebuild();
      else if (event.affectsConfiguration("hyperMarkdown.diagram.d2Path")) {
        store.refreshDiagramEngine();
      } else if (event.affectsConfiguration("hyperMarkdown")) diagnostics.refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void store.rebuild()),
  );

  try {
    await store.initialize();
  } catch (exc) {
    void vscode.window.showErrorMessage(
      `HyperMarkDown could not index this workspace: ${
        exc instanceof Error ? exc.message : String(exc)
      }`,
    );
  }
  publishHasRoot();
}

/**
 * Narrow the state a restored webview persisted for itself.
 *
 * It survived a window reload and a possible extension update, so it is
 * untrusted for the same reason every other webview message is.
 */
function panelState(raw: unknown): PanelState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const state = raw as Record<string, unknown>;
  return { card: typeof state["card"] === "string" ? state["card"] : null };
}

export function deactivate(): void {
  // Everything is registered on context.subscriptions.
}
