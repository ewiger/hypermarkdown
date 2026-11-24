/**
 * `WorkspaceHost` over `vscode.workspace.fs`, plus vault discovery
 * (HMD-0021 §8).
 *
 * Discovery is the host's job by design: the core has no filesystem above the
 * namespace root, and this is the only party that does. What it discovers is a
 * *vault* — a directory carrying `.hmd/`, plus the namespace root its `location_path`
 * setting names — found by walking up from the card the way git finds its
 * repository and the way the canonical implementation's `find_project_root`
 * already finds a project root.
 */

import { realpath } from "node:fs/promises";
import { sep } from "node:path";

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

  /**
   * The bytes, which the core decodes itself: a card that is not UTF-8 is not
   * a card (HMD019), and a decoder that replaces what it cannot read hides
   * that. An unsaved buffer is already text, and is encoded back.
   */
  async readBytes(rel: string): Promise<Uint8Array> {
    const override = this.overrides().get(rel);
    if (override !== undefined) return new TextEncoder().encode(override);
    return vscode.workspace.fs.readFile(this.uriFor(rel));
  }

  async listDirectory(rel: string): Promise<DirEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(this.uriFor(rel));
    const listed = await Promise.all(
      entries.map(async ([name, kind]): Promise<DirEntry | null> => {
        if ((kind & vscode.FileType.SymbolicLink) === 0) {
          return { name, isDirectory: kind === vscode.FileType.Directory };
        }
        return this.link(rel, name, kind);
      }),
    );
    return listed.filter((entry): entry is DirEntry => entry !== null);
  }

  /**
   * A symbolic link, as the core needs to see it. A link out of the namespace
   * root is reported and never followed: nothing through it is part of the
   * namespace, and a reference whose path meets it escapes (HMD003). Inside
   * the root, a link to a file is read like the file, and a link to a
   * directory is not walked, which also keeps a link to an ancestor from
   * looping. Only a `file:` root can be followed to its target; elsewhere a
   * link to a file is read as before.
   */
  private async link(rel: string, name: string, kind: vscode.FileType): Promise<DirEntry | null> {
    const isDirectory = (kind & vscode.FileType.Directory) !== 0;
    if (this.root.scheme !== "file") return isDirectory ? null : { name, isDirectory: false };
    const target = await realpath(this.uriFor(rel === "" ? name : `${rel}/${name}`).fsPath).catch(
      () => null,
    );
    if (target === null) return null;
    const root = await realpath(this.root.fsPath);
    if (target !== root && !target.startsWith(root + sep)) {
      return { name, isDirectory: false, leavesRoot: true };
    }
    return isDirectory ? null : { name, isDirectory: false };
  }
}

export interface DiscoveredRoot {
  /** The directory carrying `.hmd/`, or the workspace folder when none does. */
  projectRoot: vscode.Uri;
  /** The namespace root: `location_path` resolved against the project root. */
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

/** `location_path` resolved against a project root. `.` and `` both mean the root. */
function namespaceRoot(projectRoot: vscode.Uri, locationPath: string): vscode.Uri {
  const parts = locationPath.split("/").filter((part) => part !== "" && part !== ".");
  return parts.length === 0 ? projectRoot : vscode.Uri.joinPath(projectRoot, ...parts);
}

/**
 * The vault that claims `card`, searching strictly below `folder`.
 *
 * Walks up from the card's own directory looking for `.hmd/`, and stops at the
 * containing workspace folder: an editor may not read arbitrary ancestors of
 * the user's disk, and the canonical implementation's `.git` fallback is a CLI
 * convenience that a workspace folder already provides. A marker directory
 * whose `location_path` resolves to a tree the card is not in does not claim the card,
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
    const root = namespaceRoot(projectRoot, config.locationPath);
    if (isUnder(root, card) && (await exists(root))) return { projectRoot, root, config };
  }

  return null;
}

/**
 * Resolve the namespace root for a workspace folder itself.
 *
 * Order: the `hyperMarkdown.root` setting, then `.hmd/config.toml`'s
 * `location_path`, which defaults to `.`. If the result does not exist the
 * folder itself is used, so that opening a bare directory of cards works with
 * no setup at all (VSX-061). This
 * is the vault of last resort — a card with no `.hmd/` above it belongs to it.
 */
export async function folderRoot(folder: vscode.Uri): Promise<DiscoveredRoot> {
  const config = await readConfig(folder);

  const override = vscode.workspace.getConfiguration("hyperMarkdown").get<string>("root", "");
  const locationPath = override.trim() === "" ? config.locationPath : override.trim();
  const candidate = namespaceRoot(folder, locationPath);

  if (await exists(candidate)) return { projectRoot: folder, root: candidate, config };
  return { projectRoot: folder, root: folder, config };
}
