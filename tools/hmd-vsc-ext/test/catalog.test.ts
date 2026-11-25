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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as vscode from "vscode";

import { VaultCatalog } from "../src/catalog.js";
import { nodeFileSystem } from "./stubs/fs.js";

const stub = vscode as unknown as {
  workspace: {
    fs: unknown;
    workspaceFolders: { uri: unknown; name: string; index: number }[] | undefined;
    getConfiguration: () => { get: <T>(key: string, fallback: T) => T };
  };
};

let folder: string;
let catalog: VaultCatalog;

/** A fresh catalog over the tree as it is now, the way a reload would see it. */
async function reopen(): Promise<void> {
  catalog.dispose();
  catalog = new VaultCatalog(vscode.Uri.file("/ext"));
  await catalog.initialize();
}

/** Make the workspace folder itself a vault: an empty `.hmd/` is a whole one. */
async function markFolder(): Promise<void> {
  await mkdir(join(folder, ".hmd"), { recursive: true });
  await reopen();
}

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
  await write("examples/sorting/.hmd/config.toml", 'location_path = "."\n');
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
    await markFolder();
    const wikiCard = await catalog.openCard(uri("doc/wiki/topic.hmd"));
    const exampleCard = await catalog.openCard(uri("examples/sorting/complexity.hmd"));

    // The folder's own `.hmd/` claims the wiki card, and its namespace root is
    // the folder itself: `location_path` defaults to `.`.
    expect(wikiCard?.rel).toBe("doc/wiki/topic.hmd");
    expect(exampleCard?.rel).toBe("complexity.hmd");

    // The same path in two vaults is two cards, so the roots must differ.
    expect(wikiCard?.vault.root.toString()).toBe(vscode.Uri.file(folder).toString());
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

  it("reads no card that has no `.hmd/` above it (issue 0116)", async () => {
    // With no vault found and no explicit root, the specification says to
    // report an error and read nothing, as git does in a folder that was never
    // initialized. The workspace folder is not a vault of last resort.
    expect(await catalog.openCard(uri("doc/wiki/index.hmd"))).toBeNull();
    expect(await catalog.explain(uri("doc/wiki/index.hmd"))).toBe("missing");
    expect(catalog.loaded()).toHaveLength(0);
    expect(catalog.ready).toBe(false);
  });

  it("claims those cards once the folder holds an empty `.hmd/`", async () => {
    await markFolder();
    const card = await catalog.openCard(uri("doc/wiki/index.hmd"));
    expect(card?.rel).toBe("doc/wiki/index.hmd");
    expect(card?.vault.projectRoot.toString()).toBe(vscode.Uri.file(folder).toString());
  });

  it("reads them from an explicit `hyperMarkdown.root`, with no `.hmd/` at all", async () => {
    const config = stub.workspace.getConfiguration;
    stub.workspace.getConfiguration = () => ({
      get: <T>(key: string, fallback: T): T => (key === "root" ? ("doc/wiki" as T) : fallback),
    });
    try {
      await reopen();
      const card = await catalog.openCard(uri("doc/wiki/index.hmd"));
      expect(card?.rel).toBe("index.hmd");
      expect(card?.vault.root.toString()).toBe(uri("doc/wiki").toString());
    } finally {
      stub.workspace.getConfiguration = config;
    }
  });

  it("indexes a vault once, however many cards ask for it", async () => {
    const first = await catalog.openCard(uri("examples/sorting/complexity.hmd"));
    const second = await catalog.openCard(uri("examples/sorting/quicksort.hmd"));

    expect(second?.vault).toBe(first?.vault);
    expect(catalog.loaded()).toHaveLength(1);
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
    await write("doc/wiki/public/.hmd/config.toml", 'location_path = "."\n');
    await write("doc/wiki/public/topic.hmd", "# Inner topic\n\nSee [[/topic]].\n");
    // The folder is the outer vault.
    await markFolder();
  }

  it("is not part of the outer vault", async () => {
    await nest();
    const outer = await catalog.openCard(uri("doc/wiki/index.hmd"));
    // The outer vault is the folder itself; the example vault and the nested
    // one are other namespaces, so neither contributes a page.
    expect(outer?.vault.pages()).toEqual(["doc/wiki/index.hmd", "doc/wiki/topic.hmd"]);
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

describe("a vault whose config sets `wiki`", () => {
  it("is refused: the error names both keys, and none of its cards opens", async () => {
    const shown = vi.spyOn(vscode.window, "showErrorMessage");
    await write("examples/legacy/.hmd/config.toml", 'wiki = "."\n');
    await write("examples/legacy/old.hmd", "# Old\n");
    await reopen();

    expect(await catalog.openCard(uri("examples/legacy/old.hmd"))).toBeNull();
    // Not claimed by the folder's vault either: that would show the card in a
    // namespace it is not part of.
    expect(catalog.cardFor(uri("examples/legacy/old.hmd"))).toBeNull();
    expect(catalog.loaded().map((vault) => vault.root.toString())).not.toContain(
      uri("examples/legacy").toString(),
    );

    const messages = shown.mock.calls.map((call) => String(call[0]));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("`wiki`");
    expect(messages[0]).toContain("`location_path`");
    shown.mockRestore();
  });

  it("refuses the folder's own vault when the folder's config sets it", async () => {
    await write(".hmd/config.toml", 'location_path = "doc/wiki"\nwiki = "doc/wiki"\n');
    await reopen();

    expect(await catalog.openCard(uri("doc/wiki/topic.hmd"))).toBeNull();
    // A vault with a config of its own is unaffected.
    expect(await catalog.openCard(uri("examples/sorting/complexity.hmd"))).not.toBeNull();
  });
});
