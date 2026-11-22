/**
 * Links and addresses in the editor (HMD-0006): go to definition, hover,
 * completion after `#` and `/`, and copying the address of a selection.
 *
 * The decisions live in `addressing.ts`; this module only adapts them to the
 * editor's providers and commands.
 */

import * as vscode from "vscode";

import { mintAddress, parse, type ParsedDocument } from "@hypermarkdown/core";

import {
  anchorSuggestion,
  fragmentInProgress,
  linkAt,
  quoteOf,
  suggest,
  targetOf,
} from "./addressing.js";
import type { CardRef, VaultCatalog } from "./catalog.js";

const SELECTOR: vscode.DocumentSelector = { language: "hmd" };

/** The card an editor buffer is, parsed from what is on screen. */
function current(catalog: VaultCatalog, document: vscode.TextDocument): { card: CardRef; parsed: ParsedDocument } | null {
  const card = catalog.cardFor(document.uri);
  if (card === null) return null;
  return { card, parsed: parse(card.rel, document.getText()) };
}

function rangeIn(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

class Definitions implements vscode.DefinitionProvider {
  constructor(private readonly catalog: VaultCatalog) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | null> {
    const here = current(this.catalog, document);
    if (here === null) return null;
    const link = linkAt(here.parsed, document.offsetAt(position));
    if (link === null) return null;
    const { vault, rel } = here.card;
    const target = targetOf(
      link,
      (ref) => vault.resolvePath(rel, ref),
      (path) => vault.document(path),
    );
    if (target === null) return null;
    const uri = vault.uriFor(target.path);
    const opened = await vscode.workspace.openTextDocument(uri);
    const end = target.passage ? target.end : target.start;
    return new vscode.Location(uri, rangeIn(opened, target.start, end));
  }
}

class Hovers implements vscode.HoverProvider {
  constructor(private readonly catalog: VaultCatalog) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const here = current(this.catalog, document);
    if (here === null) return null;
    const link = linkAt(here.parsed, document.offsetAt(position));
    if (link === null) return null;
    const { vault, rel } = here.card;
    const quoted = quoteOf(
      link,
      (ref) => vault.resolvePath(rel, ref),
      (path) => vault.document(path),
    );
    if (quoted === null) return null;
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(
      quoted
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    );
    markdown.appendMarkdown(`\n\n— \`${link.pageRef}#${link.fragment ?? ""}\``);
    return new vscode.Hover(markdown, rangeIn(document, link.span.start, link.span.end));
  }
}

class Completions implements vscode.CompletionItemProvider {
  constructor(private readonly catalog: VaultCatalog) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const card = this.catalog.cardFor(document.uri);
    if (card === null) return [];
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const typing = fragmentInProgress(before);
    if (typing === null) return [];
    const path = typing.pageRef === "" ? card.rel : card.vault.resolvePath(card.rel, typing.pageRef);
    if (path === null) return [];
    const target = card.vault.document(path);
    if (target === undefined) return [];

    const replace = new vscode.Range(position.translate(0, -typing.partial.length), position);
    return suggest(target, typing.done).map((s) => {
      const item = new vscode.CompletionItem(
        s.label,
        s.kind === "heading"
          ? vscode.CompletionItemKind.Reference
          : s.kind === "anchor"
            ? vscode.CompletionItemKind.Constant
            : vscode.CompletionItemKind.Unit,
      );
      item.detail = s.detail;
      item.range = replace;
      return item;
    });
  }
}

/**
 * Copy `[[/card#address]]` for the selection, minted by the core. When the
 * address roots on a count rather than a name, offer to anchor the block
 * first, since a count breaks as soon as a block is inserted before it.
 */
async function copyAddress(catalog: VaultCatalog): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return;
  const card = await catalog.openCard(editor.document.uri);
  if (card === null) {
    void vscode.window.setStatusBarMessage("HyperMarkDown: this file is not a card in a vault", 2000);
    return;
  }

  const mint = (): string | null => {
    const parsed = parse(card.rel, editor.document.getText());
    const start = editor.document.offsetAt(editor.selection.start);
    const end = editor.document.offsetAt(editor.selection.end);
    return mintAddress(parsed, start, end);
  };

  let address = mint();
  if (address === null) {
    void vscode.window.setStatusBarMessage("HyperMarkDown: the selection is in no block", 2000);
    return;
  }

  if (!address.startsWith("^")) {
    const parsed = parse(card.rel, editor.document.getText());
    const offer = anchorSuggestion(parsed, editor.document.offsetAt(editor.selection.start));
    if (offer !== null) {
      const choice = await vscode.window.showInformationMessage(
        `The address #${address} counts blocks, so it breaks when one is inserted before it. Anchor the block as ^${offer.id}?`,
        "Anchor and Copy",
        "Copy As Is",
      );
      if (choice === undefined) return;
      if (choice === "Anchor and Copy") {
        const at = editor.document.positionAt(offer.at);
        const selection = editor.selection;
        await editor.edit((edit) => edit.insert(at, ` ^${offer.id}`));
        editor.selection = selection;
        address = mint() ?? address;
      }
    }
  }

  const name = card.rel.replace(/\.(hmd|md|markdown)$/, "").replace(/\/index$/, "");
  const link = `[[/${name}#${address}]]`;
  await vscode.env.clipboard.writeText(link);
  void vscode.window.setStatusBarMessage(`HyperMarkDown: copied ${link}`, 3000);
}

export function registerLinks(catalog: VaultCatalog): vscode.Disposable[] {
  return [
    vscode.languages.registerDefinitionProvider(SELECTOR, new Definitions(catalog)),
    vscode.languages.registerHoverProvider(SELECTOR, new Hovers(catalog)),
    vscode.languages.registerCompletionItemProvider(SELECTOR, new Completions(catalog), "#", "/", "^"),
    vscode.commands.registerCommand("hyperMarkdown.copyAddress", () => copyAddress(catalog)),
  ];
}
