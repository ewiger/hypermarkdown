/**
 * The vault catalog: every vault this window has opened a card in (HMD-0021 §8).
 *
 * One workspace folder can hold several vaults — this repository holds
 * `doc/wiki` plus one per example tree — so the extension cannot pick a
 * namespace root once at startup and call it *the* project. The catalog holds
 * one `Vault` per discovered root, built lazily the first time a card asks for
 * it and disposed with the window, and answers the only question the rest of
 * the extension asks: which vault claims this URI, and under what name.
 *
 * Vaults do not see each other. Resolution, backlinks, and diagnostics run
 * inside one vault, because two vaults are two namespaces: a link that resolved
 * into a neighbouring vault would make the same card render differently
 * depending on what else happened to be checked out.
 */

import * as vscode from "vscode";

import { SUFFIX, diagramEngine, isDiagramCell, type DocumentIR } from "@hypermarkdown/core";

import { attachDiagrams, type DiagramDrawings } from "./diagram/attach.js";
import { DiagramEngine } from "./diagram/engine.js";
import { diagramOptions } from "./diagram/options.js";
import { CellRunner } from "./hql/runner.js";
import { Vault } from "./vault.js";
import { discoverVault, explainUnclaimed, folderRoot, type Unclaimed } from "./workspaceHost.js";

/** A card, named by the vault that claims it and its path inside that vault. */
export interface CardRef {
  readonly vault: Vault;
  readonly rel: string;
}

export function sameCard(a: CardRef | null, b: CardRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.vault === b.vault && a.rel === b.rel;
}

export class VaultCatalog implements vscode.Disposable {
  private readonly vaults = new Map<string, Vault>();
  /** In-flight loads, so two cards opened at once build one vault. */
  private readonly loading = new Map<string, Promise<Vault>>();
  /** The workspace folder's own vault, keyed by folder URI, once indexed. */
  private readonly fallbacks = new Map<string, string>();
  private readonly diagrams: DiagramEngine;
  /** Runs HQL cells (HMD-0026). Shared for the reason the diagram engine is. */
  readonly cells: CellRunner;
  private readonly changed = new vscode.EventEmitter<CardRef | null>();

  /**
   * @param extensionUri the installed extension's root, which is where the
   *   bundled renderers live in a platform-specific VSIX (issue 0107).
   */
  constructor(private readonly extensionUri: vscode.Uri) {
    this.diagrams = new DiagramEngine(diagramOptions(extensionUri));
    this.cells = new CellRunner(this, extensionUri);
  }

  /** Fires with the card that changed, or null when the catalog itself moved. */
  readonly onDidChange = this.changed.event;

  dispose(): void {
    for (const vault of this.vaults.values()) vault.dispose();
    this.vaults.clear();
    this.cells.dispose();
    this.changed.dispose();
  }

  /** True once at least one vault is indexed: this window is a knowledge base. */
  get ready(): boolean {
    return this.vaults.size > 0;
  }

  loaded(): Vault[] {
    return [...this.vaults.values()];
  }

  vaultAt(key: string): Vault | undefined {
    return this.vaults.get(key);
  }

  /** Index the first workspace folder's own vault, when it has one. */
  async initialize(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return;
    await this.fallbackFor(folder.uri);
    this.changed.fire(null);
  }

  async rebuild(): Promise<void> {
    for (const vault of this.vaults.values()) vault.dispose();
    this.vaults.clear();
    this.loading.clear();
    this.fallbacks.clear();
    await this.initialize();
  }

  // -- addressing ------------------------------------------------------

  /**
   * The card this URI names, among the vaults already indexed.
   *
   * Synchronous, because it sits on the editor's own events — a scroll, a
   * cursor move, a keystroke. Discovery is `openCard`; this answers only for
   * vaults the window has already opened. The deepest matching root wins:
   * vaults nest, and the nearest one is the card's own.
   */
  cardFor(uri: vscode.Uri): CardRef | null {
    let best: CardRef | null = null;
    for (const vault of this.vaults.values()) {
      const rel = vault.relFor(uri);
      if (rel === null) continue;
      if (best === null || vault.root.toString().length > best.vault.root.toString().length) {
        best = { vault, rel };
      }
    }
    return best;
  }

  /**
   * The card this URI names, discovering its vault if this is the first one.
   *
   * Walks up from the card to the nearest `.hmd/`, stopping at the containing
   * workspace folder, whose own `.hmd/` (or the explicit `hyperMarkdown.root`)
   * is the last place asked. Null when none of them claims the card: a card
   * with no vault is not read (issue 0116), and `explain` says why.
   */
  async openCard(uri: vscode.Uri): Promise<CardRef | null> {
    const known = this.cardFor(uri);
    if (known !== null) return known;
    if (!uri.path.endsWith(SUFFIX)) return null;

    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) return null;

    const discovered = await discoverVault(uri, folder.uri);
    // A refused vault claims its cards and opens none of them; falling back to
    // the folder's vault would show them in a namespace they are not part of.
    if (discovered !== null && "refused" in discovered) return null;
    if (discovered !== null) {
      const vault = await this.load(discovered.root, () =>
        Vault.load(discovered.projectRoot, discovered.root, discovered.config, (rel) =>
          this.fire(discovered.root.toString(), rel),
        ),
      );
      const rel = vault.relFor(uri);
      if (rel !== null) return { vault, rel };
    }

    if ((await this.fallbackFor(folder.uri)) === null) return null;
    return this.cardFor(uri);
  }

  /** Why `openCard` returned null for this URI. */
  explain(uri: vscode.Uri): Promise<Unclaimed> {
    return explainUnclaimed(uri);
  }

  /** The workspace folder's own vault, unless it has none or it is refused. */
  private async fallbackFor(folder: vscode.Uri): Promise<Vault | null> {
    const known = this.fallbacks.get(folder.toString());
    const existing = known === undefined ? undefined : this.vaults.get(known);
    if (existing !== undefined) return existing;

    const discovered = await folderRoot(folder);
    if (discovered === null || "refused" in discovered) return null;
    const vault = await this.load(discovered.root, () =>
      Vault.load(discovered.projectRoot, discovered.root, discovered.config, (rel) =>
        this.fire(discovered.root.toString(), rel),
      ),
    );
    this.fallbacks.set(folder.toString(), vault.key);
    return vault;
  }

  private async load(root: vscode.Uri, build: () => Promise<Vault>): Promise<Vault> {
    const key = root.toString();
    const existing = this.vaults.get(key);
    if (existing !== undefined) return existing;

    const pending = this.loading.get(key) ?? build();
    this.loading.set(key, pending);
    try {
      const vault = await pending;
      this.vaults.set(key, vault);
      this.changed.fire(null);
      return vault;
    } finally {
      this.loading.delete(key);
    }
  }

  private fire(key: string, rel: string | null): void {
    const vault = this.vaults.get(key);
    if (vault === undefined || rel === null) this.changed.fire(null);
    else this.changed.fire({ vault, rel });
  }

  // -- diagrams --------------------------------------------------------

  /**
   * Re-resolve `d2` and `merman-cli`, and drop every rendered diagram.
   *
   * The cache is keyed by source alone, so a diagram rendered by the old binary
   * would otherwise survive a change of binary and the setting would look like
   * it had not taken. Shared across vaults: the binary is a machine fact, not a
   * property of a knowledge base.
   */
  refreshDiagramEngine(): void {
    this.diagrams.clear(diagramOptions(this.extensionUri));
    this.changed.fire(null);
  }

  /**
   * Draw every diagram in an IR, keeping in `drawings` what each diagram cell
   * of one preview last showed.
   */
  attachDiagrams(ir: DocumentIR, drawings?: DiagramDrawings): Promise<DocumentIR> {
    return attachDiagrams(ir, this.diagrams, drawings);
  }

  /**
   * Draw one diagram cell because a reader asked (HMD-0030).
   *
   * A failure is not answered from the cache, and a renderer that was missing
   * is looked for again, so Show is also how a reader retries. Returns false
   * for a language that is not a diagram cell.
   */
  async showDiagram(language: string, source: string): Promise<boolean> {
    const engine = isDiagramCell(language) ? diagramEngine(language) : null;
    if (engine === null) return false;
    await this.diagrams.render(source, engine, { retry: true });
    // Every preview showing this source takes the new answer, not only the
    // one whose button was pressed.
    this.changed.fire(null);
    return true;
  }
}

export type { DiagramDrawings };
