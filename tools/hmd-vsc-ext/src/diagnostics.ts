/**
 * HMD-0001 rules -> the Problems panel (HMD-0021 §7, §5.1).
 *
 * Diagnostics run on a slower clock than the preview and stay off the line
 * holding the cursor. Every partially typed link is briefly an `HMD001` or
 * `HMD010`; reporting those in real time would make the panel useless and the
 * editor hostile (VSX-033).
 */

import * as vscode from "vscode";

import type { Diagnostic as HmdDiagnostic } from "@hypermarkdown/core";

import type { VaultCatalog } from "./catalog.js";
import { debounce } from "./debounce.js";
import type { Vault } from "./vault.js";

/** Milliseconds after the last keystroke before diagnostics publish. */
export const DIAGNOSTIC_DEBOUNCE_MS = 500;

export class DiagnosticPublisher implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("HyperMarkDown");
  private readonly disposables: vscode.Disposable[] = [];
  private readonly schedule = debounce(DIAGNOSTIC_DEBOUNCE_MS, () => this.publish());

  constructor(private readonly catalog: VaultCatalog) {
    this.disposables.push(
      catalog.onDidChange(() => this.schedule()),
      vscode.window.onDidChangeTextEditorSelection(() => this.schedule()),
    );
  }

  dispose(): void {
    this.schedule.cancel();
    for (const d of this.disposables) d.dispose();
    this.collection.dispose();
  }

  refresh(): void {
    this.schedule();
  }

  /**
   * Publish every indexed vault.
   *
   * `"workspace"` means every card in the index, and the index is now one per
   * vault — so the scope is every vault a card has been opened in this session,
   * which is the honest reading of the setting once a folder can hold several
   * (issue 0108). Vaults are published one at a time because a path names a
   * card only within its own vault.
   */
  private publish(): void {
    const scope = vscode.workspace
      .getConfiguration("hyperMarkdown")
      .get<"open" | "workspace">("diagnostics.scope", "workspace");

    this.collection.clear();
    for (const vault of this.catalog.loaded()) this.publishVault(vault, scope);
  }

  private publishVault(vault: Vault, scope: "open" | "workspace"): void {
    const open = new Set(
      vscode.workspace.textDocuments
        .map((d) => vault.relFor(d.uri))
        .filter((rel): rel is string => rel !== null),
    );

    const suppressed = cursorLines(vault);
    const byPath = new Map<string, vscode.Diagnostic[]>();

    for (const diagnostic of vault.diagnostics()) {
      if (scope === "open" && !open.has(diagnostic.path)) continue;
      if (suppressed.get(diagnostic.path) === diagnostic.line) continue;
      push(byPath, diagnostic.path, toVsCode(diagnostic));
    }

    for (const rel of vault.pages()) {
      if (scope === "open" && !open.has(rel)) continue;
      this.collection.set(vault.uriFor(rel), byPath.get(rel) ?? []);
    }
  }
}

/** The line each visible editor's cursor sits on, per card of one vault. */
function cursorLines(vault: Vault): Map<string, number> {
  const out = new Map<string, number>();
  for (const editor of vscode.window.visibleTextEditors) {
    const rel = vault.relFor(editor.document.uri);
    if (rel === null) continue;
    out.set(rel, editor.selection.active.line + 1);
  }
  return out;
}

export function toVsCode(diagnostic: HmdDiagnostic): vscode.Diagnostic {
  // Core positions are 1-indexed; a vscode.Position is 0-indexed.
  const line = Math.max(diagnostic.line - 1, 0);
  const column = Math.max(diagnostic.column - 1, 0);
  const range = new vscode.Range(line, column, line, column + 1);

  const out = new vscode.Diagnostic(
    range,
    diagnostic.message,
    diagnostic.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  out.code = diagnostic.rule;
  out.source = "HyperMarkDown";
  return out;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}
