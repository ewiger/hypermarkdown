/**
 * One vault: a namespace root, its index, and its watcher (HMD-0021 §8).
 *
 * A vault is a directory tree that carries its own `.hmd/`, so a workspace
 * folder may hold several and they nest. Everything that is per-vault lives
 * here — the core `Workspace`, the host reading under its root, the unsaved
 * buffers, and the file watcher. What is per-window lives in the
 * `VaultCatalog`, which owns the vaults and decides which one claims a card.
 */

import * as vscode from "vscode";

import {
  Renderer,
  SUFFIX,
  Workspace,
  backlinks,
  check,
  parse,
  type BacklinkEntry,
  type Diagnostic,
  type DocumentIR,
  type ProjectConfig,
} from "@hypermarkdown/core";

import { VsCodeHost } from "./workspaceHost.js";

export class Vault implements vscode.Disposable {
  private readonly overrides = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly host: VsCodeHost;
  private workspace: Workspace | null = null;

  private constructor(
    /**
     * The directory carrying `.hmd/`, or the workspace folder when no marker
     * was found. Reported in diagnostics and used to name the vault.
     */
    readonly projectRoot: vscode.Uri,
    /** The namespace root: `wiki` resolved against the project root. */
    readonly root: vscode.Uri,
    readonly config: ProjectConfig,
    /** Fires with the card that changed, or null when the whole index moved. */
    private readonly changed: (rel: string | null) => void,
  ) {
    this.host = new VsCodeHost(root, () => this.overrides);
  }

  static async load(
    projectRoot: vscode.Uri,
    root: vscode.Uri,
    config: ProjectConfig,
    changed: (rel: string | null) => void,
  ): Promise<Vault> {
    const vault = new Vault(projectRoot, root, config, changed);
    vault.workspace = await Workspace.load(vault.host, config);
    vault.syncOpenDocuments();
    vault.watch();
    return vault;
  }

  /** Identity for the catalog's map, and what a preview persists. */
  get key(): string {
    return this.root.toString();
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
  }

  // -- addressing ------------------------------------------------------

  /** Root-relative POSIX path for a document, or null if it is outside. */
  relFor(uri: vscode.Uri): string | null {
    const base = this.root.toString();
    const target = uri.toString();
    if (target === base) return "";
    if (!target.startsWith(`${base}/`)) return null;
    const rel = decodeURIComponent(target.slice(base.length + 1));
    return rel.endsWith(SUFFIX) ? rel : null;
  }

  uriFor(rel: string): vscode.Uri {
    return this.host.uriFor(rel);
  }

  /** True when the URI lies under this vault's namespace root, card or not. */
  contains(uri: vscode.Uri): boolean {
    const base = this.root.toString();
    const target = uri.toString();
    return target === base || target.startsWith(`${base}/`);
  }

  // -- reads -----------------------------------------------------------

  pages(): string[] {
    return this.workspace?.pages() ?? [];
  }

  diagnostics(): Diagnostic[] {
    return this.workspace === null ? [] : check(this.workspace);
  }

  render(rel: string): DocumentIR | null {
    if (this.workspace === null) return null;
    return new Renderer(this.workspace).render(rel);
  }

  backlinksFor(rel: string): BacklinkEntry[] {
    return this.workspace === null ? [] : backlinks(this.workspace, rel);
  }

  // -- writes ----------------------------------------------------------

  /** Re-parse one card from an in-memory buffer (VSX-013). */
  update(rel: string, text: string): void {
    if (this.workspace === null) return;
    this.overrides.set(rel, text);
    this.workspace.addDocument(rel, parse(rel, text));
    this.changed(rel);
  }

  private syncOpenDocuments(): void {
    for (const document of vscode.workspace.textDocuments) {
      const rel = this.relFor(document.uri);
      if (rel === null) continue;
      this.overrides.set(rel, document.getText());
      this.workspace?.addDocument(rel, parse(rel, document.getText()));
    }
  }

  private watch(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.root, `**/*${SUFFIX}`),
    );
    this.disposables.push(watcher);

    const reload = async (uri: vscode.Uri): Promise<void> => {
      const rel = this.relFor(uri);
      if (rel === null || this.workspace === null) return;
      try {
        this.workspace.addDocument(rel, parse(rel, await this.host.readFile(rel)));
      } catch {
        return;
      }
      this.changed(rel);
    };

    this.disposables.push(
      watcher.onDidCreate((uri) => void reload(uri)),
      watcher.onDidChange((uri) => {
        // An open document is authoritative; its own change event already
        // refreshed the index from the buffer, which may be ahead of disk.
        const rel = this.relFor(uri);
        if (rel !== null && this.overrides.has(rel)) return;
        void reload(uri);
      }),
      watcher.onDidDelete((uri) => {
        const rel = this.relFor(uri);
        if (rel === null) return;
        this.overrides.delete(rel);
        this.workspace?.removeDocument(rel);
        this.changed(null);
      }),
      // Render from the unsaved buffer: saving is never a precondition
      // (VSX-013). This belongs to the vault rather than to a preview because
      // every open preview would otherwise write the same buffer into the
      // index on every keystroke, and each write fans a change event back to
      // all of them.
      vscode.workspace.onDidChangeTextDocument((event) => {
        const rel = this.relFor(event.document.uri);
        if (rel !== null) this.update(rel, event.document.getText());
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const rel = this.relFor(document.uri);
        if (rel !== null) this.overrides.delete(rel);
      }),
    );
  }
}
