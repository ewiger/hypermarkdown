/**
 * The message boundary and the shell (HMD-0021 §4, §11).
 */

import { describe, expect, it } from "vitest";

import { buildShell, makeNonce } from "../src/preview/html.js";
import { isSafeRelativePath, parseWebviewMessage } from "../src/protocol.js";
import { suggestedPath } from "../src/commands/createCard.js";

describe("inbound messages", () => {
  it("accepts the shapes the webview sends", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseWebviewMessage({ type: "scrolled", line: 12 })).toEqual({
      type: "scrolled",
      line: 12,
    });
    expect(parseWebviewMessage({ type: "openTarget", path: "a.hmd", fragment: "x" })).toEqual({
      type: "openTarget",
      path: "a.hmd",
      fragment: "x",
    });
    expect(parseWebviewMessage({ type: "modeChanged", mode: "graph" })).toEqual({
      type: "modeChanged",
      mode: "graph",
    });
    expect(
      parseWebviewMessage({
        type: "graphView",
        view: { scope: "network", direction: "upstream" },
      }),
    ).toEqual({ type: "graphView", view: { scope: "network", direction: "upstream" } });
    expect(parseWebviewMessage({ type: "fullScreen", on: true })).toEqual({
      type: "fullScreen",
      on: true,
    });
  });

  it("rejects anything malformed rather than throwing", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "ready",
      {},
      { type: "nope" },
      { type: "openSource", path: 5, line: 1 },
      { type: "scrolled", line: "twelve" },
      // The backlinks tab is gone, and a message from a webview that predates
      // its removal names a mode this build does not have.
      { type: "modeChanged", mode: "backlinks" },
      { type: "createCard" },
      { type: "graphView" },
      { type: "graphView", view: { scope: "network" } },
      { type: "graphView", view: { scope: "everything", direction: "upstream" } },
      { type: "fullScreen" },
      { type: "fullScreen", on: "yes" },
    ]) {
      expect(parseWebviewMessage(bad)).toBeNull();
    }
  });
});

describe("path safety", () => {
  it("accepts a root-relative card path", () => {
    expect(isSafeRelativePath("specs/auth/login.hmd")).toBe(true);
  });

  it("rejects traversal, absolutes, and separators that are not '/'", () => {
    for (const bad of [
      "",
      "/etc/passwd",
      "../secrets.hmd",
      "specs/../../out.hmd",
      "specs\\auth.hmd",
      "a\0b.hmd",
    ]) {
      expect(isSafeRelativePath(bad)).toBe(false);
    }
  });
});

describe("content security policy", () => {
  const shell = buildShell({
    scriptUri: "vscode-resource://media/webview.js",
    styleUri: "vscode-resource://media/webview.css",
    katexUri: "vscode-resource://media/katex/katex.min.css",
    cspSource: "vscode-resource://self",
    nonce: "deadbeef",
  });

  it("forbids everything by default and grants no network access", () => {
    expect(shell).toContain("default-src 'none'");
    expect(shell).not.toContain("connect-src");
  });

  it("admits script only under the nonce, and stamps every script tag with it", () => {
    expect(shell).toContain("script-src 'nonce-deadbeef'");
    const scripts = [...shell.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain('nonce="deadbeef"');
  });

  it("carries a tab strip of exactly the tabs this build has", () => {
    expect(shell).toContain('data-mode="rendered"');
    expect(shell).toContain('data-mode="graph"');
    // Backlinks is one direction of the card scope, and a strip offering both
    // would offer the same thing twice (HMD-0025).
    expect(shell).not.toContain("backlinks");
  });

  it("carries the elements the graph tab wires itself to", () => {
    // The tab reaches into the shell by selector, so the two are one contract:
    // a renamed class here is a tab that silently never draws.
    const shellDocument = new DOMParser().parseFromString(shell, "text/html");
    const graph = shellDocument.getElementById("hmd-graph");

    expect(graph?.querySelector(".hmd-graph-canvas")).not.toBeNull();
    expect(graph?.querySelector(".hmd-graph-note")).not.toBeNull();
    expect(
      Array.from(graph!.querySelectorAll(`[data-scope]`), (node) =>
        node.getAttribute("data-scope"),
      ),
    ).toEqual(["card", "network"]);
    expect(
      Array.from(graph!.querySelectorAll(`[data-direction]`), (node) =>
        node.getAttribute("data-direction"),
      ),
    ).toEqual(["upstream", "downstream"]);
    expect(
      Array.from(graph!.querySelectorAll(`[data-action]`), (node) =>
        node.getAttribute("data-action"),
      ),
    ).toEqual(["zoom-in", "zoom-out", "fit", "layout", "fullscreen"]);
  });

  it("mints a fresh nonce per load", () => {
    expect(makeNonce()).not.toBe(makeNonce());
    expect(makeNonce()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("create-card path derivation", () => {
  it("puts a bare name beside the card that links to it", () => {
    expect(suggestedPath("specs/auth/login.hmd", "tokens")).toBe("specs/auth/tokens.hmd");
  });

  it("puts an absolute name at the root", () => {
    expect(suggestedPath("specs/auth/login.hmd", "/shared/tokens")).toBe("shared/tokens.hmd");
  });

  it("declines a target it cannot place", () => {
    expect(suggestedPath("a.hmd", "../up")).toBeNull();
    expect(suggestedPath("a.hmd", "page#Section")).toBeNull();
  });
});
