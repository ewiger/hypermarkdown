/**
 * Turn a red link into a card (HMD-0021 §5, VSX-012, VSX-054).
 *
 * The only code path in the extension that writes to the workspace. It goes
 * through a `WorkspaceEdit` so the action lands in the editor's undo stack
 * rather than appearing as a file that arrived from nowhere.
 */

import * as vscode from "vscode";

import { SUFFIX, dirnameRel, joinRel, split, withHmdSuffix } from "@hypermarkdown/core";

import type { CardRef, VaultCatalog } from "../catalog.js";
import { isSafeRelativePath } from "../protocol.js";

/**
 * Where the resolver would next have looked: the source card's own directory
 * for a bare name, the root for an absolute one.
 */
export function suggestedPath(sourceRel: string | null, target: string): string | null {
  if (target.includes("#") || target.includes("|")) return null;

  if (target.startsWith("/")) {
    const parts = split(target);
    if (parts.length === 0) return null;
    const last = parts[parts.length - 1]!;
    return joinRel("", ...parts.slice(0, -1), withHmdSuffix(last));
  }

  if (target.startsWith("./") || target.startsWith("../")) return null;

  const parts = split(target);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  const directory = sourceRel === null ? "" : dirnameRel(sourceRel);
  return joinRel(directory, ...parts.slice(0, -1), withHmdSuffix(last));
}

/**
 * Create the card in the source card's own vault.
 *
 * A red link belongs to the vault that rendered it, so there is no choice to
 * make here: with no source card there is no namespace to create in either.
 */
export async function createCard(
  catalog: VaultCatalog,
  source: CardRef | null,
  target: string,
): Promise<void> {
  if (source === null) return;
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage(
      "HyperMarkDown: creating a card requires a trusted workspace.",
    );
    return;
  }

  const rel = suggestedPath(source.rel, target);
  if (rel === null || !isSafeRelativePath(rel) || !rel.endsWith(SUFFIX)) {
    void vscode.window.showWarningMessage(
      `HyperMarkDown: cannot derive a path for ${target}.`,
    );
    return;
  }

  const uri = source.vault.uriFor(rel);

  const title = titleFor(target);
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, { ignoreIfExists: true });
  edit.insert(uri, new vscode.Position(0, 0), `# ${title}\n`);

  if (!(await vscode.workspace.applyEdit(edit))) {
    void vscode.window.showErrorMessage(`HyperMarkDown: could not create ${rel}.`);
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
}

function titleFor(target: string): string {
  const name = split(target).pop() ?? target;
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
