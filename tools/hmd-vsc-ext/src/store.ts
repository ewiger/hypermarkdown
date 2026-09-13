/**
 * The workspace index and its lifecycle (HMD-0021 §8, §5.1).
 *
 * One `Workspace` from the core, kept current against both the disk and the
 * editor's unsaved buffers. Updates are incremental: an edit re-parses one card
 * and drops the memoised resolutions, never the tree.
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
} from "@hypermarkdown/core";

import { DiagramEngine } from "./diagram/engine.js";
import { diagramOptions } from "./diagram/options.js";
import { VsCodeHost, discoverRoot } from "./workspaceHost.js";

/** Milliseconds after the last keystroke before the preview re-parses (§6). */
export const REPARSE_DEBOUNCE_MS = 150;


export class Store implements vscode.Disposable {
  private workspace: Workspace | null = null;
  private host: VsCodeHost | null = null;
  private root: vscode.Uri | null = null;
  private readonly overrides = new Map<string, string>();
  private readonly diagrams: DiagramEngine;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changed = new vscode.EventEmitter<string | null>();

  /**
   * @param extensionUri the installed extension's root, which is where the
   *   bundled `d2` lives in a platform-specific VSIX (issue 0107).
   */
  constructor(private readonly extensionUri: vscode.Uri) {
    this.diagrams = new DiagramEngine(diagramOptions(extensionUri));
  }

  /** Fires with the card that changed, or null when the whole index moved. */
  readonly onDidChange = this.changed.event;

  /**
   * Re-resolve `d2` and drop every rendered diagram.
   *
   * The cache is keyed by source alone, so a diagram rendered by the old binary
   * would otherwise survive a change of binary and the setting would look like
   * it had not taken.
   */
  refreshDiagramEngine(): void {
    this.diagrams.clear(diagramOptions(this.extensionUri));
    this.changed.fire(null);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.changed.dispose();
  }

  get namespaceRoot(): vscode.Uri | null {
    return this.root;
  }

  get ready(): boolean {
    return this.workspace !== null;
  }

  /** Build the index for the first workspace folder holding a namespace root. */
  async initialize(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return;

    const discovered = await discoverRoot(folder.uri);
    this.root = discovered.root;
    this.host = new VsCodeHost(discovered.root, () => this.overrides);
    this.workspace = await Workspace.load(this.host, discovered.config);
    this.syncOpenDocuments();
    this.watch();
    this.changed.fire(null);
  }

  async rebuild(): Promise<void> {
    for (const d of this.disposables.splice(0)) d.dispose();
    this.overrides.clear();
    await this.initialize();
  }

  // -- addressing ------------------------------------------------------

  /** Root-relative POSIX path for a document, or null if it is outside. */
  relFor(uri: vscode.Uri): string | null {
    if (this.root === null) return null;
    const base = this.root.toString();
    const target = uri.toString();
    if (target === base) return "";
    if (!target.startsWith(`${base}/`)) return null;
    const rel = decodeURIComponent(target.slice(base.length + 1));
    return rel.endsWith(SUFFIX) ? rel : null;
  }

  uriFor(rel: string): vscode.Uri | null {
    return this.host?.uriFor(rel) ?? null;
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


  /**
   * Render every diagram in an IR (HMD-0022).
   *
   * Done here rather than in the core because rendering needs a subprocess,
   * which the core cannot run.
   */
  async attachDiagrams(ir: DocumentIR): Promise<DocumentIR> {
    const blocks = await Promise.all(
      ir.blocks.map(async (block) => {
        if (block.kind === "embed" && block.document !== null) {
          return { ...block, document: await this.attachDiagrams(block.document) };
        }
        if (block.kind !== "diagram") return block;
        const { dataUri, failure } = await this.diagrams.render(block.source);
        return { ...block, dataUri, failure };
      }),
    );
    return { ...ir, blocks };
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
    this.changed.fire(rel);
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
    if (this.root === null) return;

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.root, `**/*${SUFFIX}`),
    );
    this.disposables.push(watcher);

    const reload = async (uri: vscode.Uri): Promise<void> => {
      const rel = this.relFor(uri);
      if (rel === null || this.host === null || this.workspace === null) return;
      try {
        this.workspace.addDocument(rel, parse(rel, await this.host.readFile(rel)));
      } catch {
        return;
      }
      this.changed.fire(rel);
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
        this.changed.fire(null);
      }),
      // Render from the unsaved buffer: saving is never a precondition
      // (VSX-013). This belongs to the store rather than to a preview because
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

/** A trailing-edge debounce that can be cancelled on dispose. */
export function debounce<T extends unknown[]>(
  ms: number,
  fn: (...args: T) => void,
): ((...args: T) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: T): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return wrapped;
}
