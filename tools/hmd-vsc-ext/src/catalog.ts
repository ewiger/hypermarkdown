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

import { SUFFIX, type DocumentIR } from "@hypermarkdown/core";

import { DiagramEngine } from "./diagram/engine.js";
import { diagramOptions } from "./diagram/options.js";
import { Vault } from "./vault.js";
import { discoverVault, folderRoot } from "./workspaceHost.js";

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
  /** The vault of last resort per workspace folder, keyed by folder URI. */
  private readonly fallbacks = new Map<string, string>();
  private readonly diagrams: DiagramEngine;
  private readonly changed = new vscode.EventEmitter<CardRef | null>();

  /**
   * @param extensionUri the installed extension's root, which is where the
   *   bundled `d2` lives in a platform-specific VSIX (issue 0107).
   */
  constructor(private readonly extensionUri: vscode.Uri) {
    this.diagrams = new DiagramEngine(diagramOptions(extensionUri));
  }

  /** Fires with the card that changed, or null when the catalog itself moved. */
  readonly onDidChange = this.changed.event;

  dispose(): void {
    for (const vault of this.vaults.values()) vault.dispose();
    this.vaults.clear();
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

  /** Index the first workspace folder's own vault, so the window has one. */
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
   * workspace folder, and falls back to that folder's own root when nothing
   * above the card carries a marker.
   */
  async openCard(uri: vscode.Uri): Promise<CardRef | null> {
    const known = this.cardFor(uri);
    if (known !== null) return known;
    if (!uri.path.endsWith(SUFFIX)) return null;

    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) return null;

    const discovered = await discoverVault(uri, folder.uri);
    if (discovered !== null) {
      const vault = await this.load(discovered.root, () =>
        Vault.load(discovered.projectRoot, discovered.root, discovered.config, (rel) =>
          this.fire(discovered.root.toString(), rel),
        ),
      );
      const rel = vault.relFor(uri);
      if (rel !== null) return { vault, rel };
    }

    await this.fallbackFor(folder.uri);
    return this.cardFor(uri);
  }

  /** The vault a card outside every marked tree belongs to. */
  private async fallbackFor(folder: vscode.Uri): Promise<Vault> {
    const known = this.fallbacks.get(folder.toString());
    const existing = known === undefined ? undefined : this.vaults.get(known);
    if (existing !== undefined) return existing;

    const discovered = await folderRoot(folder);
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
   * Re-resolve `d2` and drop every rendered diagram.
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
}
