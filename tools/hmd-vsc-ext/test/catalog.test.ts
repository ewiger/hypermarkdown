/**
 * Vault discovery: one folder in the editor, several vaults (issue 0108).
 *
 * The tree these tests build is this repository in miniature — cards in
 * `doc/wiki` with no marker at the root, and a self-contained example vault
 * under `examples/` carrying its own `.hmd/`. Before per-card discovery the
 * extension chose one namespace root at startup and every card outside it was
 * invisible.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as vscode from "vscode";

import { VaultCatalog } from "../src/catalog.js";
import { nodeFileSystem } from "./stubs/fs.js";

const stub = vscode as unknown as {
  workspace: {
    fs: unknown;
    workspaceFolders: { uri: unknown; name: string; index: number }[] | undefined;
  };
};

let folder: string;
let catalog: VaultCatalog;

async function write(path: string, text: string): Promise<void> {
  await mkdir(join(folder, path, ".."), { recursive: true });
  await writeFile(join(folder, path), text, "utf8");
}

function uri(path: string): vscode.Uri {
  return vscode.Uri.file(join(folder, path));
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "hmd-catalog-"));

  // The repository's own shape: a wiki with no marker above it ...
  await write("doc/wiki/index.hmd", "# Wiki\n\nSee [[topic]].\n");
  await write("doc/wiki/topic.hmd", "# Topic\n");

  // ... and an example tree that is its own vault, rooted at itself.
  await write("examples/sorting/.hmd/config.toml", 'wiki = "."\n');
  await write("examples/sorting/complexity.hmd", "# Complexity\n\nSee [[quicksort]].\n");
  await write("examples/sorting/quicksort.hmd", "# Quicksort\n");

  stub.workspace.fs = nodeFileSystem;
  stub.workspace.workspaceFolders = [{ uri: vscode.Uri.file(folder), name: "repo", index: 0 }];

  catalog = new VaultCatalog(vscode.Uri.file("/ext"));
  await catalog.initialize();
});

afterEach(async () => {
  catalog.dispose();
  stub.workspace.workspaceFolders = undefined;
  stub.workspace.fs = undefined;
  await rm(folder, { recursive: true, force: true });
});

describe("which vault claims a card", () => {
  it("resolves a card in a nested vault against that vault, not the folder's", async () => {
    const wikiCard = await catalog.openCard(uri("doc/wiki/topic.hmd"));
    const exampleCard = await catalog.openCard(uri("examples/sorting/complexity.hmd"));

    expect(wikiCard?.rel).toBe("topic.hmd");
    expect(exampleCard?.rel).toBe("complexity.hmd");

    // The same path in two vaults is two cards, so the roots must differ.
    expect(wikiCard?.vault.root.toString()).toBe(uri("doc/wiki").toString());
    expect(exampleCard?.vault.root.toString()).toBe(uri("examples/sorting").toString());
    expect(exampleCard?.vault).not.toBe(wikiCard?.vault);
  });

  it("renders a card no workspace-level root would have indexed", async () => {
    // The symptom in issue 0108: the preview said "Open a .hmd card to preview
    // it" about a card that was open, because the card was outside the one
    // root the extension had chosen.
    const card = await catalog.openCard(uri("examples/sorting/complexity.hmd"));
    expect(card).not.toBeNull();
    expect(card?.vault.render("complexity.hmd")).not.toBeNull();
  });

  it("resolves a wikilink inside the nested vault against that vault", async () => {
    const card = await catalog.openCard(uri("examples/sorting/complexity.hmd"));
    const ir = card?.vault.render("complexity.hmd");

    const links = JSON.stringify(ir);
    expect(links).toContain("quicksort.hmd");
    // A link never leaves its namespace: two vaults are two namespaces, and a
    // card that resolved into a neighbour would render differently depending
    // on what else was checked out.
    expect(card?.vault.pages()).toEqual(["complexity.hmd", "quicksort.hmd"]);
  });

  it("keeps the folder's own root for cards with no marker above them", async () => {
    // `doc/wiki` works with no `.hmd/` at the repository root, which is what
    // the fallback exists for.
    const card = await catalog.openCard(uri("doc/wiki/index.hmd"));
    expect(card?.rel).toBe("index.hmd");
    expect(card?.vault.projectRoot.toString()).toBe(vscode.Uri.file(folder).toString());
  });

  it("indexes a vault once, however many cards ask for it", async () => {
    const first = await catalog.openCard(uri("examples/sorting/complexity.hmd"));
    const second = await catalog.openCard(uri("examples/sorting/quicksort.hmd"));

    expect(second?.vault).toBe(first?.vault);
    expect(catalog.loaded()).toHaveLength(2);
  });

  it("answers synchronously once a vault is indexed", async () => {
    // The editor's own events — a scroll, a cursor move — cannot wait for a
    // walk over the file system.
    const card = uri("examples/sorting/quicksort.hmd");
    expect(catalog.cardFor(card)).toBeNull();

    await catalog.openCard(card);
    expect(catalog.cardFor(card)?.rel).toBe("quicksort.hmd");
  });

  it("claims nothing outside every workspace folder", async () => {
    const outside = vscode.Uri.file(join(tmpdir(), "elsewhere", "stray.hmd"));
    expect(await catalog.openCard(outside)).toBeNull();
  });
});

describe("a vault nested inside an indexed one (issue 0009)", () => {
  async function nest(): Promise<void> {
    // `doc/wiki/public` is its own vault, inside the folder's `doc/wiki`, and
    // holds a card named like one of the outer vault's.
    await write("doc/wiki/public/.hmd/config.toml", 'wiki = "."\n');
    await write("doc/wiki/public/topic.hmd", "# Inner topic\n\nSee [[/topic]].\n");
    // `beforeEach` indexed the folder's vault before the nested one existed.
    catalog.dispose();
    catalog = new VaultCatalog(vscode.Uri.file("/ext"));
    await catalog.initialize();
  }

  it("is not part of the outer vault", async () => {
    await nest();
    const outer = await catalog.openCard(uri("doc/wiki/index.hmd"));
    expect(outer?.vault.pages()).toEqual(["index.hmd", "topic.hmd"]);
    // `[[topic]]` is unique in the outer vault, so nothing is ambiguous.
    expect(outer?.vault.diagnostics()).toEqual([]);
  });

  it("claims its own cards, even after the outer vault is indexed", async () => {
    await nest();
    const outer = await catalog.openCard(uri("doc/wiki/index.hmd"));
    const inner = await catalog.openCard(uri("doc/wiki/public/topic.hmd"));

    expect(outer?.vault.relFor(uri("doc/wiki/public/topic.hmd"))).toBeNull();
    expect(inner?.rel).toBe("topic.hmd");
    expect(inner?.vault.root.toString()).toBe(uri("doc/wiki/public").toString());
    expect(inner?.vault.diagnostics()).toEqual([]);
  });
});
