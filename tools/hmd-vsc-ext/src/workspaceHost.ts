/**
 * `WorkspaceHost` over `vscode.workspace.fs`, plus vault discovery
 * (HMD-0021 §8).
 *
 * Discovery is the host's job by design: the core has no filesystem above the
 * namespace root, and this is the only party that does. What it discovers is a
 * *vault* — a directory carrying `.hmd/`, plus the namespace root its `wiki`
 * setting names — found by walking up from the card the way git finds its
 * repository and the way the canonical implementation's `find_project_root`
 * already finds a project root.
 */

import * as vscode from "vscode";

import {
  CONFIG_NAME,
  DEFAULT_PROJECT_CONFIG,
  MARKER_DIR,
  parseConfigToml,
  type DirEntry,
  type ProjectConfig,
  type WorkspaceHost,
} from "@hypermarkdown/core";

const decoder = new TextDecoder("utf-8");

export class VsCodeHost implements WorkspaceHost {
  constructor(
    readonly root: vscode.Uri,
    /** Unsaved buffers, so the preview follows the editor rather than the disk. */
    private readonly overrides: () => ReadonlyMap<string, string>,
  ) {}

  uriFor(rel: string): vscode.Uri {
    return rel === "" ? this.root : vscode.Uri.joinPath(this.root, ...rel.split("/"));
  }

  async readFile(rel: string): Promise<string> {
    const override = this.overrides().get(rel);
    if (override !== undefined) return override;
    return decoder.decode(await vscode.workspace.fs.readFile(this.uriFor(rel)));
  }

  async listDirectory(rel: string): Promise<DirEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(this.uriFor(rel));
    return entries.map(([name, kind]) => ({
      name,
      isDirectory: kind === vscode.FileType.Directory,
    }));
  }
}

export interface DiscoveredRoot {
  /** The directory carrying `.hmd/`, or the workspace folder when none does. */
  projectRoot: vscode.Uri;
  /** The namespace root: `wiki` resolved against the project root. */
  root: vscode.Uri;
  config: ProjectConfig;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function isUnder(root: vscode.Uri, uri: vscode.Uri): boolean {
  const base = root.toString();
  const target = uri.toString();
  return target === base || target.startsWith(`${base}/`);
}

/** Path segments from `folder` down to `uri`, or null if `uri` is outside it. */
function segmentsBetween(folder: vscode.Uri, uri: vscode.Uri): string[] | null {
  const base = folder.toString();
  const target = uri.toString();
  if (!target.startsWith(`${base}/`)) return null;
  return decodeURIComponent(target.slice(base.length + 1)).split("/");
}

/** Read a project root's `.hmd/config.toml`, reporting a broken one once. */
async function readConfig(projectRoot: vscode.Uri): Promise<ProjectConfig> {
  const configUri = vscode.Uri.joinPath(projectRoot, MARKER_DIR, CONFIG_NAME);
  if (!(await exists(configUri))) return { ...DEFAULT_PROJECT_CONFIG };
  try {
    return parseConfigToml(
      decoder.decode(await vscode.workspace.fs.readFile(configUri)),
      `${MARKER_DIR}/${CONFIG_NAME}`,
    );
  } catch (exc) {
    void vscode.window.showWarningMessage(
      `HyperMarkDown: ${exc instanceof Error ? exc.message : String(exc)}`,
    );
    return { ...DEFAULT_PROJECT_CONFIG };
  }
}

/** `wiki` resolved against a project root. `.` and `` both mean the root. */
function namespaceRoot(projectRoot: vscode.Uri, wiki: string): vscode.Uri {
  const parts = wiki.split("/").filter((part) => part !== "" && part !== ".");
  return parts.length === 0 ? projectRoot : vscode.Uri.joinPath(projectRoot, ...parts);
}

/**
 * The vault that claims `card`, searching strictly below `folder`.
 *
 * Walks up from the card's own directory looking for `.hmd/`, and stops at the
 * containing workspace folder: an editor may not read arbitrary ancestors of
 * the user's disk, and the canonical implementation's `.git` fallback is a CLI
 * convenience that a workspace folder already provides. A marker directory
 * whose `wiki` resolves to a tree the card is not in does not claim the card,
 * so the walk continues past it.
 *
 * Returns null when nothing above the card carries a marker; the folder's own
 * root (`folderRoot` below) is the fallback, which is what keeps a repository
 * with no `.hmd/` at all working.
 */
export async function discoverVault(
  card: vscode.Uri,
  folder: vscode.Uri,
): Promise<DiscoveredRoot | null> {
  const segments = segmentsBetween(folder, card);
  if (segments === null) return null;
  const directories = segments.slice(0, -1);

  for (let depth = directories.length; depth >= 1; depth -= 1) {
    const projectRoot = vscode.Uri.joinPath(folder, ...directories.slice(0, depth));
    if (!(await exists(vscode.Uri.joinPath(projectRoot, MARKER_DIR)))) continue;

    const config = await readConfig(projectRoot);
    const root = namespaceRoot(projectRoot, config.wiki);
    if (isUnder(root, card) && (await exists(root))) return { projectRoot, root, config };
  }

  return null;
}

/**
 * Resolve the namespace root for a workspace folder itself.
 *
 * Order: the `hyperMarkdown.root` setting, then `.hmd/config.toml`'s `wiki`,
 * then `doc/wiki`. If none of those exists the folder itself is used, so that
 * opening a bare directory of cards works with no setup at all (VSX-061). This
 * is the vault of last resort — a card with no `.hmd/` above it belongs to it.
 */
export async function folderRoot(folder: vscode.Uri): Promise<DiscoveredRoot> {
  const config = await readConfig(folder);

  const override = vscode.workspace.getConfiguration("hyperMarkdown").get<string>("root", "");
  const wiki = override.trim() === "" ? config.wiki : override.trim();
  const candidate = namespaceRoot(folder, wiki);

  if (await exists(candidate)) return { projectRoot: folder, root: candidate, config };
  return { projectRoot: folder, root: folder, config };
}
