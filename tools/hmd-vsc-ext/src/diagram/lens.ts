/**
 * Diagram cells in the editor (HMD-0030).
 *
 * A **Show diagram** lens above every `d2#show` and `mermaid#show` fence, and
 * the cell under the cursor for the command of the same name. Both read the
 * card's text the way the core does, so the source they hand to the renderer
 * is the source the preview draws.
 */

import * as vscode from "vscode";

import { scanDiagramCells, type DiagramCell } from "@hypermarkdown/core";

export class DiagramLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return scanDiagramCells(document.getText()).map(
      (cell) =>
        new vscode.CodeLens(new vscode.Range(cell.openLine, 0, cell.openLine, 0), {
          title: "$(eye) Show diagram",
          command: "hyperMarkdown.showDiagram",
          arguments: [document.uri, cell.index],
        }),
    );
  }
}

/** The diagram cell at a line of a card's text, or the one with this index. */
export function diagramCellIn(
  text: string,
  at: { line: number } | { index: number },
): DiagramCell | null {
  const cells = scanDiagramCells(text);
  const found =
    "index" in at
      ? cells.find((cell) => cell.index === at.index)
      : cells.find((cell) => at.line >= cell.openLine && at.line <= cell.closeLine);
  return found ?? null;
}
