/**
 * Initialize Vault, and the "vault not found" error that offers it (issue 0116).
 *
 * A vault is the directory that holds `.hmd/`, and an empty `.hmd/` is a
 * complete one: `.hmd/config.toml` is optional, and without it the namespace
 * root is the vault itself. So initializing a vault asks one question, where
 * the vault goes, and writes one empty directory. `location_path` is not asked:
 * it is a setting inside a vault's config, and before init there is no vault
 * for it to be relative to.
 */

import * as vscode from "vscode";

import { MARKER_DIR, SUFFIX } from "@hypermarkdown/core";

import type { VaultCatalog } from "../catalog.js";
import { vaultCandidates } from "../workspaceHost.js";

export const INIT_VAULT = "Initialize Vault…";

/** How many `.hmd` files a quick-pick entry counts before it says "or more". */
const COUNT_LIMIT = 1000;

interface Candidate extends vscode.QuickPickItem {
  directory: vscode.Uri;
}

function cardName(card: vscode.Uri): string {
  return card.path.slice(card.path.lastIndexOf("/") + 1);
}

/** The path of `directory` inside `folder`, as the quick pick shows it. */
function relative(folder: vscode.WorkspaceFolder, directory: vscode.Uri): string {
  const base = folder.uri.toString();
  const target = directory.toString();
  if (target === base) return folder.name;
  return `${folder.name}/${decodeURIComponent(target.slice(base.length + 1))}`;
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

async function countCards(directory: vscode.Uri): Promise<string> {
  const found = await vscode.workspace.findFiles(
    new vscode.RelativePattern(directory, `**/*${SUFFIX}`),
    null,
    COUNT_LIMIT,
  );
  const count = found.length;
  if (count >= COUNT_LIMIT) return `${COUNT_LIMIT} or more .hmd files below it`;
  return count === 1 ? "1 .hmd file below it" : `${count} .hmd files below it`;
}

/** The folder to initialize in: the card's, the only one, or the user's pick. */
async function pickFolder(card: vscode.Uri | null): Promise<vscode.WorkspaceFolder | undefined> {
  if (card !== null) return vscode.workspace.getWorkspaceFolder(card);
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) return folders[0];
  return vscode.window.showWorkspaceFolderPick({
    placeHolder: "Workspace folder to initialize a HyperMarkDown vault in",
  });
}

/**
 * Ask where the vault goes, create `<there>/.hmd/`, and re-index.
 *
 * The candidates are every directory from the workspace folder down to the
 * card, outermost first, with the workspace folder as the default. A directory
 * that already holds `.hmd/` is left out: it is a vault already. Returns the
 * new vault's directory, or null when nothing was created.
 */
export async function initializeVault(
  catalog: VaultCatalog,
  card: vscode.Uri | null,
): Promise<vscode.Uri | null> {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage(
      "HyperMarkDown initializes a vault only in a trusted workspace, because it writes to the disk.",
    );
    return null;
  }
  const folder = await pickFolder(card);
  if (folder === undefined) {
    void vscode.window.showErrorMessage(
      card === null
        ? "HyperMarkDown: open a folder to initialize a vault in."
        : `HyperMarkDown: ${cardName(card)} is outside every workspace folder, so no vault can claim it.`,
    );
    return null;
  }

  const directories = await vaultCandidates(folder.uri, card);
  const items: Candidate[] = [];
  for (const directory of directories) {
    if (await isDirectory(vscode.Uri.joinPath(directory, MARKER_DIR))) continue;
    const isFolder = directory.toString() === folder.uri.toString();
    const isDoc = directory.toString() === vscode.Uri.joinPath(folder.uri, "doc").toString();
    items.push({
      directory,
      label: relative(folder, directory),
      description: isFolder ? "workspace folder (default)" : isDoc ? "documentation folder" : undefined,
      detail: await countCards(directory),
    });
  }
  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      `HyperMarkDown: ${folder.name} is already a vault.`,
    );
    return null;
  }

  const chosen = await vscode.window.showQuickPick(items, {
    title: "Initialize HyperMarkDown Vault",
    placeHolder: "Directory to hold .hmd/. The vault claims every card below it.",
  });
  if (chosen === undefined) return null;

  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(chosen.directory, MARKER_DIR));
  } catch (exc) {
    void vscode.window.showErrorMessage(
      `HyperMarkDown: could not create ${MARKER_DIR}/ in ${chosen.label}: ${
        exc instanceof Error ? exc.message : String(exc)
      }`,
    );
    return null;
  }

  await catalog.rebuild();
  void vscode.window.showInformationMessage(
    `HyperMarkDown: initialized a vault at ${chosen.label}.`,
  );
  return chosen.directory;
}

/** Workspace folders already told about a missing vault in this session. */
const told = new Set<string>();

/**
 * Say that no vault claims `card`, and offer to initialize one.
 *
 * Shown at most once per workspace folder in a session when it comes from
 * opening a card, so a folder of cards does not raise one error per click.
 * `always` is for an explicit action, such as running a cell, where the user
 * asked for something that needs a vault and should hear why it did not
 * happen. A refused vault gets no offer: the card has a vault, and its config
 * is the problem, which the refusal already reported.
 */
export async function reportMissingVault(
  catalog: VaultCatalog,
  card: vscode.Uri,
  options: { always?: boolean } = {},
): Promise<void> {
  const reason = await catalog.explain(card);
  if (reason === "outside") return;
  if (reason === "refused") {
    if (options.always === true) {
      void vscode.window.showErrorMessage(
        `HyperMarkDown: the vault that holds ${cardName(card)} is not opened, because its .hmd/config.toml was refused.`,
      );
    }
    return;
  }

  const folder = vscode.workspace.getWorkspaceFolder(card);
  const key = folder?.uri.toString() ?? card.toString();
  if (options.always !== true && told.has(key)) return;
  told.add(key);

  const message = `HyperMarkDown: vault not found for ${cardName(card)}: no ${MARKER_DIR}/ directory above it. Initialize a vault to read it.`;
  // An untrusted workspace is told, and offered nothing it would refuse.
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showErrorMessage(message);
    return;
  }
  const answer = await vscode.window.showErrorMessage(message, INIT_VAULT);
  if (answer === INIT_VAULT) await initializeVault(catalog, card);
}

/** Forget which folders were told, for tests. */
export function resetMissingVaultReports(): void {
  told.clear();
}
