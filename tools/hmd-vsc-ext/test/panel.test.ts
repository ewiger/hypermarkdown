/**
 * The editor-column surface (HMD-0021 §3, issue 0103).
 *
 * These are the three properties that make a column of previews work, and all
 * three were wrong before: the tab lands in the column that asked for it, more
 * than one may exist, and one opened from a card keeps showing that card.
 */

import { beforeEach, describe, expect, it } from "vitest";

import * as vscode from "vscode";

import type { VaultCatalog } from "../src/catalog.js";
import { PreviewPanel } from "../src/preview/panel.js";
import type { Vault } from "../src/vault.js";

const stub = vscode as unknown as {
  createdPanels: {
    showOptions: { viewColumn: number };
    panel: { dispose(): void; receive(message: unknown): void };
  }[];
  window: {
    activeTextEditor: { document: { uri: unknown } } | undefined;
    activeEditorChanged: { fire(value: void): void };
    tabGroups: { all: { viewColumn: number }[] };
  };
  commands: { executed: string[] };
  ViewColumn: { Active: number; Beside: number };
};

const extensionUri = { path: "/ext", toString: () => "/ext" } as unknown as vscode.Uri;

/** One vault, named the way the catalog names it. */
const vault = { key: "file:///vault" } as unknown as Vault;

/**
 * A catalog that knows paths and nothing else.
 *
 * `ready` is false, so the controller stops before rendering — every property
 * under test is about which card a preview holds, not what it draws.
 */
function fakeCatalog(): VaultCatalog {
  const cardFor = (uri: unknown): { vault: Vault; rel: string } | null => {
    const rel = (uri as { rel: string | null }).rel;
    return rel === null ? null : { vault, rel };
  };
  return {
    ready: false,
    onDidChange: () => ({ dispose: () => undefined }),
    cardFor,
    openCard: async (uri: unknown) => cardFor(uri),
    vaultAt: (key: string) => (key === vault.key ? vault : undefined),
  } as unknown as VaultCatalog;
}

/**
 * Let the catalog answer.
 *
 * Following an editor is asynchronous now: the vault that claims a card is
 * discovered from the card, and discovery reads the file system (issue 0108).
 */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function editorFor(rel: string | null): { document: { uri: unknown } } {
  return { document: { uri: { rel } } };
}

function openPanels(): { showOptions: { viewColumn: number }; panel: { dispose(): void } }[] {
  return stub.createdPanels;
}

beforeEach(() => {
  for (const created of stub.createdPanels.splice(0)) created.panel.dispose();
  stub.window.activeTextEditor = undefined;
  stub.window.tabGroups.all = [];
  stub.commands.executed.length = 0;
});

describe("opening a preview", () => {
  it("lands in the column that asked for it, not beside it", () => {
    const catalog = fakeCatalog();
    PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });

    expect(openPanels()).toHaveLength(1);
    expect(openPanels()[0]?.showOptions.viewColumn).toBe(stub.ViewColumn.Active);
  });

  it("still offers the side-by-side column for the palette command", () => {
    const catalog = fakeCatalog();
    PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Beside });

    expect(openPanels()[0]?.showOptions.viewColumn).toBe(stub.ViewColumn.Beside);
  });

  it("reveals the unpinned preview already in that column", () => {
    const catalog = fakeCatalog();
    const first = PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });
    const second = PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });

    // Two unpinned previews in one column both show the active card, so the
    // second is only a way to lose track of the first.
    expect(second).toBe(first);
    expect(openPanels()).toHaveLength(1);
    expect(openPanels()[0]?.panel).toHaveProperty("revealed", 1);
  });

  it("creates a second panel once the first is pinned", () => {
    const catalog = fakeCatalog();
    stub.window.activeTextEditor = editorFor("notes/alpha.hmd");
    const first = PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });
    first.togglePin();

    const second = PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });

    expect(second).not.toBe(first);
    expect(openPanels()).toHaveLength(2);
  });

  it("does not reuse a preview living in a different column", () => {
    const catalog = fakeCatalog();
    PreviewPanel.open(catalog, extensionUri, { column: 1 as vscode.ViewColumn });
    PreviewPanel.open(catalog, extensionUri, { column: 2 as vscode.ViewColumn });

    expect(openPanels()).toHaveLength(2);
  });
});

describe("which card a panel holds", () => {
  it("follows the active editor even when opened over a card", async () => {
    const catalog = fakeCatalog();
    stub.window.activeTextEditor = editorFor("notes/alpha.hmd");

    PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });
    const tab = openPanels()[0]?.panel as unknown as { title: string };
    await settle();
    expect(tab.title).toBe("alpha");

    // Pinning on open froze the preview for the life of the tab (issue 0105).
    stub.window.activeTextEditor = editorFor("notes/beta.hmd");
    stub.window.activeEditorChanged.fire();
    await settle();
    expect(tab.title).toBe("beta");
  });

  it("stops following once pinned, and resumes when unpinned", async () => {
    const catalog = fakeCatalog();
    stub.window.activeTextEditor = editorFor("notes/alpha.hmd");

    const preview = PreviewPanel.open(catalog, extensionUri, {
      column: vscode.ViewColumn.Active,
    });
    const tab = openPanels()[0]?.panel as unknown as { title: string };
    await settle();

    expect(preview.togglePin()).toBe(true);
    stub.window.activeTextEditor = editorFor("notes/beta.hmd");
    stub.window.activeEditorChanged.fire();
    await settle();
    expect(tab.title).toBe("alpha");

    expect(preview.togglePin()).toBe(false);
    stub.window.activeEditorChanged.fire();
    await settle();
    expect(tab.title).toBe("beta");
  });

  it("follows the active editor when it was opened from a non-card", async () => {
    const catalog = fakeCatalog();
    stub.window.activeTextEditor = editorFor(null);

    PreviewPanel.open(catalog, extensionUri, { column: vscode.ViewColumn.Active });
    const tab = openPanels()[0]?.panel as unknown as { title: string };
    await settle();
    expect(tab.title).toBe("HyperMarkDown Preview");

    stub.window.activeTextEditor = editorFor("notes/beta.hmd");
    stub.window.activeEditorChanged.fire();
    await settle();
    expect(tab.title).toBe("beta");
  });

  it("comes back on its card after a reload, and still following", async () => {
    const catalog = fakeCatalog();
    const panel = new (vscode as unknown as {
      WebviewPanelStub: new (title: string) => unknown;
    }).WebviewPanelStub("HyperMarkDown Preview") as vscode.WebviewPanel;

    PreviewPanel.restore(panel, catalog, extensionUri, {
      card: "notes/gamma.hmd",
      vault: vault.key,
    });
    await settle();
    expect(panel.title).toBe("gamma");

    // Restoring a persisted `pinned` resurrected the frozen preview from
    // storage an older build had written (issue 0105).
    stub.window.activeTextEditor = editorFor("notes/beta.hmd");
    stub.window.activeEditorChanged.fire();
    await settle();
    expect(panel.title).toBe("beta");
  });

  it("ignores a card persisted without its vault", async () => {
    // A path alone named a card only while one vault could exist; state
    // written by such a build has to be dropped rather than guessed at
    // (issue 0108).
    const catalog = fakeCatalog();
    const panel = new (vscode as unknown as {
      WebviewPanelStub: new (title: string) => unknown;
    }).WebviewPanelStub("HyperMarkDown Preview") as vscode.WebviewPanel;

    PreviewPanel.restore(panel, catalog, extensionUri, { card: "notes/gamma.hmd", vault: null });
    await settle();
    expect(panel.title).toBe("HyperMarkDown Preview");
  });
});

describe("full screen", () => {
  /** The graph asking for the window, and giving it back. */
  function open(): { dispose(): void; receive(message: unknown): void } {
    PreviewPanel.open(fakeCatalog(), extensionUri, { column: vscode.ViewColumn.Active });
    stub.commands.executed.length = 0;
    return stub.createdPanels[0]!.panel;
  }

  it("stands the editor's own chrome down, not only the preview's", async () => {
    open().receive({ type: "fullScreen", on: true });
    await settle();

    // Hiding the preview's tab strip leaves the editor's tab bar, side bar,
    // panel, and status bar between the reader and the graph.
    expect(stub.commands.executed).toContain("workbench.action.toggleZenMode");
    // Zen mode centres the layout, which gives the width back.
    expect(stub.commands.executed).toContain("workbench.action.toggleCenteredLayout");
  });

  it("maximises a split group, and only then has one to restore", async () => {
    stub.window.tabGroups.all = [{ viewColumn: 1 }, { viewColumn: 2 }];
    const panel = open();

    panel.receive({ type: "fullScreen", on: true });
    await settle();
    expect(stub.commands.executed).toContain("workbench.action.toggleMaximizeEditorGroup");

    stub.commands.executed.length = 0;
    panel.receive({ type: "fullScreen", on: false });
    await settle();
    expect(stub.commands.executed).toEqual([
      "workbench.action.toggleMaximizeEditorGroup",
      "workbench.action.toggleZenMode",
    ]);
  });

  it("leaves a single group alone in both directions", async () => {
    const panel = open();

    panel.receive({ type: "fullScreen", on: true });
    await settle();
    expect(stub.commands.executed).not.toContain("workbench.action.toggleMaximizeEditorGroup");

    stub.commands.executed.length = 0;
    panel.receive({ type: "fullScreen", on: false });
    await settle();
    expect(stub.commands.executed).toEqual(["workbench.action.toggleZenMode"]);
  });

  it("ignores a second request to enter, which would toggle back out", async () => {
    const panel = open();

    panel.receive({ type: "fullScreen", on: true });
    await settle();
    stub.commands.executed.length = 0;
    panel.receive({ type: "fullScreen", on: true });
    await settle();

    expect(stub.commands.executed).toEqual([]);
  });

  it("gives the editor back when the preview is closed while it holds it", async () => {
    const panel = open();
    panel.receive({ type: "fullScreen", on: true });
    await settle();

    stub.commands.executed.length = 0;
    panel.dispose();
    await settle();

    // A closed preview that kept the window would leave an editor with no tabs
    // and nothing on screen explaining why.
    expect(stub.commands.executed).toContain("workbench.action.toggleZenMode");
  });
});
