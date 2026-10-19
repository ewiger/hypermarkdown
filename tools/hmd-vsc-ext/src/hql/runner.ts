/**
 * Running a card's cells from the editor and the preview (HMD-0026).
 *
 * A run is always something the reader asked for: a Run button in the
 * preview, a code lens above the cell, or a command. Opening a card never runs
 * anything — what the card shows is the output saved in it — and a workspace
 * that is not trusted runs nothing at all.
 *
 * The result is an edit to the card, applied to the open document like any
 * other edit, so it shows in the preview at once, can be undone, and is saved
 * when the author saves. If the card changed while HQL ran, the answer
 * describes a card that no longer exists and is dropped.
 */

import * as vscode from "vscode";

import { scanCells, SUFFIX } from "@hypermarkdown/core";

import type { VaultCatalog } from "../catalog.js";
import { HqlEngine, HqlRunError, describeOutcome } from "./engine.js";
import { hqlOptions } from "./options.js";

/** Every cell of the card, when a whole-card run is in flight. */
export const ALL_CELLS = -1;

export class CellRunner implements vscode.Disposable {
  private readonly engine: HqlEngine;
  /** Cells being run, by card URI. `ALL_CELLS` stands for every one. */
  private readonly running = new Map<string, Set<number>>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();

  /** Fires with the card whose running cells changed. */
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly catalog: VaultCatalog,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.engine = new HqlEngine(hqlOptions(extensionUri));
  }

  dispose(): void {
    this.changed.dispose();
  }

  /** Re-resolve `hql`, after its setting changed. */
  refresh(): void {
    this.engine.reset(hqlOptions(this.extensionUri));
  }

  /** The cells of a card that are running now, `ALL_CELLS` included. */
  runningIn(uri: vscode.Uri): number[] {
    return [...(this.running.get(uri.toString()) ?? [])];
  }

  /**
   * Run one cell, or every cell when `index` is null, and write the outputs
   * into the card.
   */
  async run(uri: vscode.Uri, index: number | null): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "HyperMarkDown runs HQL cells only in a trusted workspace. The saved outputs are still shown.",
      );
      return;
    }
    if (uri.scheme !== "file" || !uri.path.endsWith(SUFFIX)) {
      void vscode.window.showWarningMessage("HQL cells run only in a .hmd card on the local disk.");
      return;
    }
    const card = await this.catalog.openCard(uri);
    if (card === null || card.vault.root.scheme !== "file") {
      void vscode.window.showWarningMessage("No vault claims this card, so there is nothing to run its cells against.");
      return;
    }

    const key = uri.toString();
    const slot = index ?? ALL_CELLS;
    const set = this.running.get(key) ?? new Set<number>();
    if (set.has(slot)) return;
    set.add(slot);
    this.running.set(key, set);
    this.changed.fire(uri);

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const version = document.version;
      const cells = scanCells(text).cells;
      const label = index === null ? "all cells" : (cells[index]?.id ?? `cell ${index + 1}`);

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `HQL: running ${label}` },
        () => this.engine.run(text, card.vault.root.fsPath, index),
      );

      if (document.version !== version) {
        void vscode.window.showWarningMessage(
          "The card changed while HQL ran, so its answer was not written. Run the cell again.",
        );
        return;
      }

      if (result.edits.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const change of result.edits) {
          edit.replace(
            uri,
            new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
            change.text,
          );
        }
        await vscode.workspace.applyEdit(edit);
      }

      const trouble = result.outcomes.filter((o) => o.status !== "ok");
      if (trouble.length === 0) {
        void vscode.window.setStatusBarMessage(`HQL: ${label} ran`, 3000);
      } else {
        const said = trouble.map((o) => describeOutcome(o, cells[o.index])).join("; ");
        void vscode.window.showWarningMessage(`HQL: ${said}.`);
      }
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc);
      if (exc instanceof HqlRunError) {
        void vscode.window.showErrorMessage(`HQL: ${message}`, "Open Settings").then((choice) => {
          if (choice !== undefined) {
            void vscode.commands.executeCommand("workbench.action.openSettings", "hyperMarkdown.hql.path");
          }
        });
      } else {
        void vscode.window.showErrorMessage(`HQL run failed: ${message}`);
      }
    } finally {
      set.delete(slot);
      if (set.size === 0) this.running.delete(key);
      this.changed.fire(uri);
    }
  }
}

/**
 * Run and status lenses above every cell, so a card is a notebook in the
 * editor as well as in the preview.
 */
export class CellLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  constructor(runner: CellRunner) {
    runner.onDidChange(() => this.changed.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const { cells } = scanCells(document.getText());
    const lenses: vscode.CodeLens[] = [];
    for (const cell of cells) {
      const range = new vscode.Range(cell.openLine, 0, cell.openLine, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(play) Run cell",
          command: "hyperMarkdown.runCell",
          arguments: [document.uri, cell.index],
        }),
      );
      if (cell.index === 0) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(run-all) Run all cells",
            command: "hyperMarkdown.runAllCells",
            arguments: [document.uri],
          }),
        );
      }
      const state = cell.hidden
        ? "hidden: runs for the cells that read it"
        : cell.output === null
          ? "not run yet"
          : cell.output.hash === cell.hash
            ? cell.output.status === "ok"
              ? "output current"
              : `output current (${cell.output.status ?? "unknown"})`
            : "output stale — the code changed since it ran";
      lenses.push(new vscode.CodeLens(range, { title: state, command: "" }));
    }
    return lenses;
  }
}

/** The cell the cursor is in, for the command palette. */
export function cellAtCursor(editor: vscode.TextEditor): number | null {
  const line = editor.selection.active.line;
  const cell = scanCells(editor.document.getText()).cells.find(
    (c) => line >= c.openLine && line <= (c.output?.closeLine ?? c.closeLine),
  );
  return cell?.index ?? null;
}
