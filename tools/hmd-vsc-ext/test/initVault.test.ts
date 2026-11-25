/**
 * Vault not found, and Initialize Vault (issue 0116).
 *
 * The tree is a repository with cards and no `.hmd/` anywhere: the state a
 * new user is in. A card there is read by no vault, the user is told so and
 * offered the fix, and the fix is one empty directory, after which the card is
 * claimed without a reload.
 */

import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as vscode from "vscode";

import { VaultCatalog } from "../src/catalog.js";
import {
  INIT_VAULT,
  initializeVault,
  reportMissingVault,
  resetMissingVaultReports,
} from "../src/commands/initVault.js";
import { vaultCandidates } from "../src/workspaceHost.js";
import { nodeFileSystem } from "./stubs/fs.js";

interface Item {
  label: string;
  description?: string;
  directory: vscode.Uri;
}

const stub = vscode as unknown as {
  workspace: {
    fs: unknown;
    isTrusted: boolean;
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
  return path === "" ? vscode.Uri.file(folder) : vscode.Uri.file(join(folder, path));
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(join(folder, path)).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

/** Answer the quick pick with the entry whose label ends in `label`. */
function pick(label: string): { offered: () => Item[] } {
  let offered: Item[] = [];
  vi.spyOn(vscode.window, "showQuickPick").mockImplementation((async (items: Item[]) => {
    offered = items;
    return items.find((item) => item.label.endsWith(label));
  }) as never);
  return { offered: () => offered };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "hmd-init-"));
  await write("doc/wiki/index.hmd", "# Wiki\n\nSee [[topic]].\n");
  await write("doc/wiki/topic.hmd", "# Topic\n");
  await write("notes.hmd", "# Notes\n");

  stub.workspace.fs = nodeFileSystem;
  stub.workspace.isTrusted = true;
  stub.workspace.workspaceFolders = [{ uri: vscode.Uri.file(folder), name: "repo", index: 0 }];
  resetMissingVaultReports();

  catalog = new VaultCatalog(vscode.Uri.file("/ext"));
  await catalog.initialize();
});

afterEach(async () => {
  vi.restoreAllMocks();
  catalog.dispose();
  stub.workspace.workspaceFolders = undefined;
  stub.workspace.fs = undefined;
  await rm(folder, { recursive: true, force: true });
});

describe("where a vault can go", () => {
  it("is every directory from the workspace folder down to the card", async () => {
    const candidates = await vaultCandidates(uri(""), uri("doc/wiki/topic.hmd"));
    expect(candidates.map(String)).toEqual([uri(""), uri("doc"), uri("doc/wiki")].map(String));
  });

  it("is only the folder for a card at its top", async () => {
    const candidates = await vaultCandidates(uri(""), uri("notes.hmd"));
    expect(candidates.map(String)).toEqual([uri("").toString()]);
  });

  it("is the folder and its doc/ with no card", async () => {
    const candidates = await vaultCandidates(uri(""), null);
    expect(candidates.map(String)).toEqual([uri(""), uri("doc")].map(String));
  });

  it("is nothing for a card outside the folder", async () => {
    const outside = vscode.Uri.file(join(tmpdir(), "elsewhere", "stray.hmd"));
    expect(await vaultCandidates(uri(""), outside)).toEqual([]);
  });
});

describe("Initialize Vault", () => {
  it("creates an empty .hmd/ where the user picked, and the card is then claimed", async () => {
    expect(await catalog.openCard(uri("doc/wiki/topic.hmd"))).toBeNull();
    const quickPick = pick("repo/doc");

    const created = await initializeVault(catalog, uri("doc/wiki/topic.hmd"));

    expect(created?.toString()).toBe(uri("doc").toString());
    expect(await isDirectory("doc/.hmd")).toBe(true);
    // Nothing but the marker: the specification's defaults need no config.
    expect(await isDirectory("doc/.hmd/config.toml")).toBe(false);
    // The workspace folder is offered first, as the default.
    expect(quickPick.offered().map((item) => item.label)).toEqual(["repo", "repo/doc", "repo/doc/wiki"]);
    expect(quickPick.offered()[0]?.description).toContain("default");

    // No reload: the rebuilt catalog finds the new vault from the card.
    const card = await catalog.openCard(uri("doc/wiki/topic.hmd"));
    expect(card?.rel).toBe("wiki/topic.hmd");
    expect(card?.vault.projectRoot.toString()).toBe(uri("doc").toString());
  });

  it("does not offer a directory that is a vault already", async () => {
    await mkdir(join(folder, "doc", ".hmd"), { recursive: true });
    const quickPick = pick("repo");
    await initializeVault(catalog, uri("notes.hmd"));
    expect(quickPick.offered().map((item) => item.label)).toEqual(["repo"]);

    const second = pick("repo/doc/wiki");
    await initializeVault(catalog, uri("doc/wiki/topic.hmd"));
    expect(second.offered().map((item) => item.label)).toEqual(["repo/doc/wiki"]);
  });

  it("creates nothing when the pick is dismissed", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue(undefined as never);
    expect(await initializeVault(catalog, uri("notes.hmd"))).toBeNull();
    expect(await isDirectory(".hmd")).toBe(false);
  });

  it("writes nothing in an untrusted workspace", async () => {
    stub.workspace.isTrusted = false;
    const quickPick = vi.spyOn(vscode.window, "showQuickPick");
    expect(await initializeVault(catalog, uri("notes.hmd"))).toBeNull();
    expect(quickPick).not.toHaveBeenCalled();
    expect(await isDirectory(".hmd")).toBe(false);
  });
});

describe("vault not found", () => {
  it("says so, offers Initialize Vault, and initializes on the click", async () => {
    const shown = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(INIT_VAULT as never);
    pick("repo");

    await reportMissingVault(catalog, uri("notes.hmd"));

    expect(String(shown.mock.calls[0]?.[0])).toContain("vault not found for notes.hmd");
    expect(shown.mock.calls[0]?.[1]).toBe(INIT_VAULT);
    expect(await isDirectory(".hmd")).toBe(true);
    expect((await catalog.openCard(uri("notes.hmd")))?.rel).toBe("notes.hmd");
  });

  it("is said once per folder when cards are opened, and every time a cell is run", async () => {
    const shown = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);

    await reportMissingVault(catalog, uri("notes.hmd"));
    await reportMissingVault(catalog, uri("doc/wiki/topic.hmd"));
    expect(shown).toHaveBeenCalledTimes(1);

    await reportMissingVault(catalog, uri("notes.hmd"), { always: true });
    expect(shown).toHaveBeenCalledTimes(2);
  });

  it("offers no second marker for a card whose vault is refused", async () => {
    await write("doc/.hmd/config.toml", 'wiki = "wiki"\n');
    const shown = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined as never);

    expect(await catalog.explain(uri("doc/wiki/topic.hmd"))).toBe("refused");
    shown.mockClear();
    await reportMissingVault(catalog, uri("doc/wiki/topic.hmd"), { always: true });

    expect(shown).toHaveBeenCalledTimes(1);
    expect(String(shown.mock.calls[0]?.[0])).toContain("was refused");
    expect(shown.mock.calls[0]?.[1]).toBeUndefined();
  });
});
