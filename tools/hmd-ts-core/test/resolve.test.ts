import { describe, expect, it } from "vitest";

import { MemoryHost } from "../src/host.js";
import { check } from "../src/lint.js";
import { parse } from "../src/parse.js";
import { Workspace, type WorkspaceConfig } from "../src/workspace.js";

const card = (body = "# H\n"): string => body;

async function build(
  files: Record<string, string>,
  config?: Partial<WorkspaceConfig>,
): Promise<Workspace> {
  return Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
    ...config,
  });
}

describe("phase 1 — the spine", () => {
  it("prefers a nearer card to a distant one", async () => {
    const ws = await build({
      "tokens.hmd": card(),
      "specs/tokens.hmd": card(),
      "specs/auth/login.hmd": card("see [[tokens]]\n"),
      "specs/auth/tokens.hmd": card(),
    });
    const result = ws.resolve("specs/auth/login.hmd", "tokens");
    expect(result).toMatchObject({ outcome: "resolved", path: "specs/auth/tokens.hmd", phase: 1 });
  });

  it("walks up to the root", async () => {
    const ws = await build({
      "tokens.hmd": card(),
      "specs/auth/login.hmd": card("see [[tokens]]\n"),
    });
    expect(ws.resolve("specs/auth/login.hmd", "tokens").path).toBe("tokens.hmd");
  });

  it("never reaches sideways into a sibling namespace", async () => {
    const ws = await build({
      "specs/billing/invoices.hmd": card(),
      "specs/auth/login.hmd": card("see [[invoices]]\n"),
    });
    // Phase 1 misses it; phase 3 finds it, because it is unique in the tree.
    expect(ws.resolve("specs/auth/login.hmd", "invoices")).toMatchObject({ phase: 3 });
  });

  it("binds a folder note by its directory name", async () => {
    const ws = await build({
      "specs/auth/index.hmd": card(),
      "specs/billing/index.hmd": card("see [[auth]]\n"),
    });
    expect(ws.resolve("specs/billing/index.hmd", "auth").path).toBe("specs/auth/index.hmd");
  });
});

describe("absolute and relative forms", () => {
  it("resolves an absolute ref from the root", async () => {
    const ws = await build({
      "shared/tokens.hmd": card(),
      "specs/auth/login.hmd": card(),
    });
    expect(ws.resolve("specs/auth/login.hmd", "/shared/tokens").path).toBe("shared/tokens.hmd");
  });

  it("resolves a relative ref", async () => {
    const ws = await build({
      "shared/tokens.hmd": card(),
      "specs/auth/login.hmd": card(),
    });
    expect(ws.resolve("specs/auth/login.hmd", "../../shared/tokens").path).toBe(
      "shared/tokens.hmd",
    );
  });

  it("reports a ref that climbs above the root", async () => {
    const ws = await build({ "specs/auth/login.hmd": card() });
    expect(ws.resolve("specs/auth/login.hmd", "../../../secrets").outcome).toBe("escapes");
  });
});

describe("phase 3 — autodiscovery", () => {
  it("reports two matches as ambiguous with sorted candidates", async () => {
    const ws = await build({
      "a/tokens.hmd": card(),
      "b/tokens.hmd": card(),
      "c/here.hmd": card("see [[tokens]]\n"),
    });
    const result = ws.resolve("c/here.hmd", "tokens");
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates).toEqual(["a/tokens.hmd", "b/tokens.hmd"]);
  });

  it("is suppressed by `use: [no_autodiscovery]`", async () => {
    const ws = await build({
      "a/tokens.hmd": card(),
      "c/here.hmd": "---\nuse: [no_autodiscovery]\n---\n\nsee [[tokens]]\n",
    });
    expect(ws.resolve("c/here.hmd", "tokens").outcome).toBe("unresolved");
  });

  it("inherits a toggle from the nearest folder note", async () => {
    const ws = await build({
      "a/tokens.hmd": card(),
      "c/index.hmd": "---\nuse: [no_autodiscovery]\n---\n\n# C\n",
      "c/here.hmd": card("see [[tokens]]\n"),
    });
    expect(ws.resolve("c/here.hmd", "tokens").outcome).toBe("unresolved");
  });
});

describe("imports", () => {
  it("binds a named import, aliased", async () => {
    const ws = await build({
      "shared/tokens.hmd": card(),
      "specs/login.hmd": "---\nimport:\n  - from /shared import tokens as shared-tokens\n---\n\nsee [[shared-tokens]]\n",
    });
    const result = ws.resolve("specs/login.hmd", "shared-tokens");
    expect(result).toMatchObject({ outcome: "resolved", path: "shared/tokens.hmd", phase: 0 });
  });

  it("does not bind the original name when aliased", async () => {
    const ws = await build({
      "shared/tokens.hmd": card(),
      "specs/login.hmd": "---\nimport:\n  - from /shared import tokens as t\n---\n\n# H\n",
    });
    // Phase 0 misses; the sweep still finds the unique card in phase 3.
    expect(ws.resolve("specs/login.hmd", "tokens")).toMatchObject({ phase: 3 });
  });

  it("probes a wildcard origin after the whole spine", async () => {
    const ws = await build({
      "glossary/token.hmd": card(),
      "specs/token.hmd": card(),
      "specs/auth/login.hmd": "---\nimport:\n  - from /glossary import *\n---\n\n# H\n",
    });
    // The spine holds specs/token.hmd, so it wins over the imported origin.
    expect(ws.resolve("specs/auth/login.hmd", "token")).toMatchObject({
      path: "specs/token.hmd",
      phase: 1,
    });
  });

  it("reports a non-existent import ref as HMD015", async () => {
    const ws = await build({
      "specs/login.hmd": "---\nimport:\n  - from /nope import x\n---\n\n# H\n",
    });
    expect(check(ws).map((d) => d.rule)).toContain("HMD015");
  });

  it("reports an import ref outside the root as HMD003", async () => {
    const ws = await build({
      "specs/login.hmd": "---\nimport:\n  - from ../../etc import x\n---\n\n# H\n",
    });
    expect(check(ws).map((d) => d.rule)).toContain("HMD003");
  });
});

describe("lint rules", () => {
  it("reports a red link as HMD001, a warning", async () => {
    const ws = await build({ "a.hmd": card("see [[nope]]\n") });
    const [diagnostic] = check(ws);
    expect(diagnostic).toMatchObject({ rule: "HMD001", severity: "warning", line: 1, column: 5 });
  });

  it("reports a missing heading fragment as HMD004", async () => {
    const ws = await build({
      "target.hmd": card("# Present\n"),
      "a.hmd": card("see [[target#Absent]]\n"),
    });
    expect(check(ws).map((d) => d.rule)).toContain("HMD004");
  });

  it("reports a missing block id as HMD005", async () => {
    const ws = await build({
      "target.hmd": card("# H\n\nbody ^present\n"),
      "a.hmd": card("see [[target#^absent]]\n"),
    });
    expect(check(ws).map((d) => d.rule)).toContain("HMD005");
  });

  it("reports a duplicate anchor as HMD006", async () => {
    const ws = await build({ "a.hmd": card("one ^x\n\ntwo ^x\n") });
    expect(check(ws).map((d) => d.rule)).toContain("HMD006");
  });

  it("reports a folder-note collision as HMD012", async () => {
    const ws = await build({ "foo.hmd": card(), "foo/index.hmd": card() });
    expect(check(ws).map((d) => d.rule)).toContain("HMD012");
  });

  it("reports an embed cycle as HMD007", async () => {
    const ws = await build({
      "a.hmd": card("![[b]]\n"),
      "b.hmd": card("![[a]]\n"),
    });
    expect(check(ws).map((d) => d.rule)).toContain("HMD007");
  });

  it("emits diagnostics sorted by (path, line, column, rule)", async () => {
    const ws = await build({
      "b.hmd": card("[[nope]]\n\n[[nope2]]\n"),
      "a.hmd": card("[[nope]]\n"),
    });
    const keys = check(ws).map((d) => `${d.path}:${d.line}:${d.column}:${d.rule}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("determinism", () => {
  it("does not depend on host directory order", async () => {
    const files = {
      "a/tokens.hmd": card(),
      "b/tokens.hmd": card(),
      "c/here.hmd": card("see [[tokens]]\n"),
    };
    const forward = await build(files);
    const reversed = await Workspace.load(
      {
        readFile: async (rel) => files[rel as keyof typeof files]!,
        listDirectory: async (rel) => {
          const host = MemoryHost.from(files);
          const entries = await host.listDirectory(rel);
          return entries.reverse();
        },
      },
      { autodiscovery: true, mode: "both", source: null },
    );
    expect(JSON.stringify(check(reversed))).toBe(JSON.stringify(check(forward)));
  });
});

describe("Markdown cards (HMD-0029)", () => {
  it("shadowing follows cards as they are added and removed", async () => {
    const ws = await build({ "here.hmd": card("[[x]]\n"), "far/x.md": card() });
    expect(ws.resolve("here.hmd", "x")).toMatchObject({ outcome: "resolved", path: "far/x.md" });

    ws.addDocument("far/x.hmd", parse("far/x.hmd", card()));
    expect(ws.shadowedBy("far/x.md")).toBe("far/x.hmd");
    expect(ws.resolve("here.hmd", "x")).toMatchObject({ outcome: "resolved", path: "far/x.hmd" });

    ws.removeDocument("far/x.hmd");
    expect(ws.shadowedBy("far/x.md")).toBeNull();
    expect(ws.resolve("here.hmd", "x")).toMatchObject({ outcome: "resolved", path: "far/x.md" });
  });

  it("a Markdown card is parsed for headings only", () => {
    const doc = parse("a.md", "---\ntitle: A\n---\n# A\n\n[[b]] ^id\n");
    expect(doc.kind).toBe("markdown");
    expect(doc.frontmatter).toEqual({ title: "A" });
    expect(doc.links).toEqual([]);
    expect(doc.anchors).toEqual([]);
    expect(doc.headings.map((h) => h.key)).toEqual(["a"]);
  });
});

describe("heading fragments match by key", () => {
  it("reaches a heading whatever its case and punctuation", async () => {
    const ws = await build({
      "errors.hmd": "# Errors\n\n## Ошибка 404!\n\n## Straße\n",
      "a.hmd": "[[errors#ошибка 404]] [[errors#STRASSE]]\n",
    });
    expect(check(ws)).toEqual([]);
  });

  it("names the fragment as written when nothing matches (HMD004)", async () => {
    const ws = await build({ "e.hmd": "# Café\n", "a.hmd": "[[e#Cafe Menu]]\n" });
    expect(check(ws).map((d) => d.message)).toEqual(["e.hmd has no heading '#Cafe Menu'"]);
  });

  it("reports every later heading with the same key and no anchor (HMD011)", async () => {
    const ws = await build({
      "s.hmd": "# Guide\n\n## Setup\n\n## setup!\n\n## Setup ^linux\n\n## SETUP\n",
    });
    expect(check(ws).map((d) => [d.rule, d.line, d.message])).toEqual([
      [
        "HMD011",
        5,
        "heading 'setup!' has the same key as the heading on line 3, which a fragment reaches instead; anchor this one with a block id to link to it",
      ],
      [
        "HMD011",
        9,
        "heading 'SETUP' has the same key as the heading on line 3, which a fragment reaches instead; anchor this one with a block id to link to it",
      ],
    ]);
  });

  it("no longer reaches a repeat by a numbered suffix", async () => {
    const ws = await build({ "s.hmd": "## Setup\n\n## Setup\n", "a.hmd": "[[s#setup_1]]\n" });
    expect(check(ws, ["a.hmd"]).map((d) => d.rule)).toEqual(["HMD004"]);
  });
});
