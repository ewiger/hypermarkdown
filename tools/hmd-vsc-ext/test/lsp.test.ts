/**
 * How the extension decides which `hmd-lsp` to start, and whether to start
 * one (HMD-0033).
 *
 * The client itself is a few lines over `vscode-languageclient`, and needs a
 * running editor to mean anything. What is tested here is every decision it
 * makes before it starts a process, and that the names this extension gives
 * colours to are the names the server sends.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decideStart, locateServer, programName, type Located } from "../src/lsp/locate.js";

const files = (...paths: string[]) => (path: string) => paths.includes(path);

describe("the program's name", () => {
  it("carries .exe on Windows only", () => {
    expect(programName("win32")).toBe("hmd-lsp.exe");
    expect(programName("linux")).toBe("hmd-lsp");
    expect(programName("darwin")).toBe("hmd-lsp");
  });
});

describe("where the server is looked for", () => {
  const base = {
    configuredPath: null,
    bundledPath: null,
    pathEnv: "/usr/bin:/opt/hmd/bin",
    platform: "linux" as NodeJS.Platform,
    isFile: files(),
  };

  it("takes the setting first", () => {
    expect(
      locateServer({
        ...base,
        configuredPath: "/home/me/hmd-lsp",
        bundledPath: "/ext/toolchain/bin/hmd-lsp",
        isFile: files("/home/me/hmd-lsp", "/opt/hmd/bin/hmd-lsp"),
      }),
    ).toEqual({ found: true, command: "/home/me/hmd-lsp", source: "setting" });
  });

  it("reports a setting that names no file, and looks no further", () => {
    const located = locateServer({
      ...base,
      configuredPath: "/home/me/typo",
      bundledPath: "/ext/toolchain/bin/hmd-lsp",
      isFile: files("/opt/hmd/bin/hmd-lsp"),
    });
    expect(located).toEqual({
      found: false,
      reason: "hyperMarkdown.languageServer.path names /home/me/typo, which is not a file",
    });
  });

  it("takes the bundled binary before PATH", () => {
    expect(
      locateServer({
        ...base,
        bundledPath: "/ext/toolchain/bin/hmd-lsp",
        isFile: files("/opt/hmd/bin/hmd-lsp"),
      }),
    ).toEqual({ found: true, command: "/ext/toolchain/bin/hmd-lsp", source: "bundled" });
  });

  it("searches PATH in order", () => {
    expect(
      locateServer({ ...base, isFile: files("/opt/hmd/bin/hmd-lsp", "/usr/bin/hmd-lsp") }),
    ).toEqual({ found: true, command: "/usr/bin/hmd-lsp", source: "PATH" });
    expect(locateServer({ ...base, isFile: files("/opt/hmd/bin/hmd-lsp") })).toEqual({
      found: true,
      command: "/opt/hmd/bin/hmd-lsp",
      source: "PATH",
    });
  });

  it("searches PATH by the rules of Windows on Windows", () => {
    expect(
      locateServer({
        ...base,
        platform: "win32",
        pathEnv: "C:\\Windows;C:\\tools\\",
        isFile: files("C:\\tools\\hmd-lsp.exe"),
      }),
    ).toEqual({ found: true, command: "C:\\tools\\hmd-lsp.exe", source: "PATH" });
  });

  it("says so when there is no program anywhere", () => {
    for (const pathEnv of ["/usr/bin", "", undefined]) {
      expect(locateServer({ ...base, pathEnv })).toEqual({
        found: false,
        reason: "this build carries no hmd-lsp for this platform, and none is on PATH",
      });
    }
  });

  it("treats a blank setting as no setting", () => {
    expect(
      locateServer({ ...base, configuredPath: "   ", isFile: files("/usr/bin/hmd-lsp") }),
    ).toEqual({ found: true, command: "/usr/bin/hmd-lsp", source: "PATH" });
  });
});

describe("whether the server starts", () => {
  const found: Located = { found: true, command: "/usr/bin/hmd-lsp", source: "PATH" };
  const base = { enabled: true, trusted: true, folderSchemes: ["file"], located: found };

  it("starts in a trusted workspace on disk", () => {
    expect(decideStart(base)).toEqual({
      start: true,
      command: "/usr/bin/hmd-lsp",
      source: "PATH",
    });
  });

  it("starts with no folder open", () => {
    expect(decideStart({ ...base, folderSchemes: [] }).start).toBe(true);
  });

  it("stays off, silently, when the setting turns it off", () => {
    expect(decideStart({ ...base, enabled: false })).toEqual({
      start: false,
      reason: "the language server is turned off",
      notify: false,
    });
  });

  it("stays off, silently, in an untrusted workspace", () => {
    expect(decideStart({ ...base, trusted: false })).toEqual({
      start: false,
      reason: "the workspace is not trusted",
      notify: false,
    });
  });

  it("stays off, silently, when any folder is virtual", () => {
    expect(decideStart({ ...base, folderSchemes: ["file", "vscode-vfs"] })).toEqual({
      start: false,
      reason: "the workspace is virtual",
      notify: false,
    });
  });

  it("tells the user when no program was found", () => {
    expect(
      decideStart({ ...base, located: { found: false, reason: "none is on PATH" } }),
    ).toEqual({ start: false, reason: "none is on PATH", notify: true });
  });

  it("does not look for a reason to notify when it is off for another reason", () => {
    const missing: Located = { found: false, reason: "none is on PATH" };
    expect(decideStart({ ...base, trusted: false, located: missing }).start).toBe(false);
    expect(decideStart({ ...base, trusted: false, located: missing })).toMatchObject({
      notify: false,
    });
  });
});

describe("the names this extension colours", () => {
  const read = (relative: string): string =>
    readFileSync(join(__dirname, relative), "utf8");
  const manifest = JSON.parse(read("../package.json")) as {
    contributes: {
      semanticTokenModifiers: { id: string }[];
      semanticTokenScopes: { language: string; scopes: Record<string, string[]> }[];
      configurationDefaults: Record<string, Record<string, unknown>>;
    };
  };
  const server = read("../../hmd-lsp/src/tokens.rs");

  /** The strings of a `pub const NAME: [&str; N] = [...]` in the server. */
  function legend(name: string): string[] {
    const match = new RegExp(`pub const ${name}: \\[&str; \\d+\\] = \\[([^\\]]*)\\]`).exec(server);
    if (match === null) throw new Error(`the server declares no ${name}`);
    return [...match[1]!.matchAll(/"([^"]+)"/g)].map((found) => found[1]!);
  }

  it("declares every modifier the server sends, and no other", () => {
    expect(manifest.contributes.semanticTokenModifiers.map((modifier) => modifier.id)).toEqual(
      legend("MODIFIERS"),
    );
  });

  it("gives a scope to every token type the server sends", () => {
    const scopes = manifest.contributes.semanticTokenScopes.find(
      (entry) => entry.language === "hmd",
    )!.scopes;
    for (const type of legend("TYPES")) expect(scopes[type]).toBeDefined();
  });

  it("colours only types and modifiers the server sends", () => {
    const scopes = manifest.contributes.semanticTokenScopes.find(
      (entry) => entry.language === "hmd",
    )!.scopes;
    const types = legend("TYPES");
    const modifiers = legend("MODIFIERS");
    for (const selector of Object.keys(scopes)) {
      const [type, ...rest] = selector.split(".");
      expect(types).toContain(type);
      for (const modifier of rest) expect(modifiers).toContain(modifier);
    }
  });

  it("gives a reference that does not resolve a scope themes colour as an error", () => {
    const scopes = manifest.contributes.semanticTokenScopes[0]!.scopes;
    for (const modifier of ["unresolved", "ambiguous", "outside"]) {
      expect(scopes[`class.${modifier}`]![0]).toMatch(/^invalid\.illegal\./);
    }
  });

  it("keeps a resolved reference the colour the grammar gives it", () => {
    const grammar = read("../syntaxes/hmd.tmLanguage.json");
    const scopes = manifest.contributes.semanticTokenScopes[0]!.scopes;
    for (const type of ["class", "property", "string"]) {
      expect(grammar).toContain(`"${scopes[type]![0]}"`);
    }
  });

  it("turns semantic highlighting on for cards, whatever the theme says", () => {
    expect(
      manifest.contributes.configurationDefaults["[hmd]"]![
        "editor.semanticHighlighting.enabled"
      ],
    ).toBe(true);
  });
});
