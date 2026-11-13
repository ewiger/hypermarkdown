/**
 * A directory carrying its own `.hmd/` is another vault (issue 0009). Parity
 * with `tools/hmd/tests/test_nested_vault.py`.
 */

import { describe, expect, it } from "vitest";

import { MemoryHost } from "../src/host.js";
import { check } from "../src/lint.js";
import { parse } from "../src/parse.js";
import { DEFAULT_CONFIG, Workspace } from "../src/workspace.js";

const TREE: Record<string, string> = {
  "here.hmd": "# Here\n\nSee [[time]].\n",
  "wiki/time.hmd": "# Time\n",
  "inner/.hmd/config.toml": 'wiki = "."\n',
  "inner/time.hmd": "# Inner time\n",
  "inner/abs.hmd": "# Abs\n\nSee [[/time]].\n",
};

const load = (files: Record<string, string>) =>
  Workspace.load(MemoryHost.from(files), DEFAULT_CONFIG);

/** The subtree under `prefix`, re-rooted, as a host handed that root would see it. */
const subtree = (files: Record<string, string>, prefix: string) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([rel]) => rel.startsWith(`${prefix}/`))
      .map(([rel, text]) => [rel.slice(prefix.length + 1), text]),
  );

describe("a nested vault", () => {
  it("is not loaded into the outer vault", async () => {
    const ws = await load(TREE);
    expect(ws.pages()).toEqual(["here.hmd", "wiki/time.hmd"]);
    expect(ws.hasDirectory("inner")).toBe(false);
  });

  it("does not make a bare name ambiguous in the outer vault", async () => {
    const ws = await load(TREE);
    expect(ws.resolve("here.hmd", "time")).toMatchObject({
      outcome: "resolved",
      path: "wiki/time.hmd",
    });
    expect(check(ws)).toEqual([]);
  });

  it("ignores an incremental add of one of its cards", async () => {
    const ws = await load(TREE);
    expect(ws.inNestedVault("inner/new.hmd")).toBe(true);
    ws.addDocument("inner/new.hmd", parse("inner/new.hmd", "# New\n"));
    expect(ws.pages()).toEqual(["here.hmd", "wiki/time.hmd"]);
  });

  it("still resolves against its own root", async () => {
    const ws = await load(subtree(TREE, "inner"));
    expect(ws.pages()).toEqual(["abs.hmd", "time.hmd"]);
    expect(ws.resolve("abs.hmd", "/time")).toMatchObject({ outcome: "resolved", path: "time.hmd" });
  });

  it("cannot be reached by an import", async () => {
    const ws = await load({
      "a.hmd": "---\nimport:\n  - from /inner import time\n---\n\n# A\n",
      "inner/.hmd/config.toml": 'wiki = "."\n',
      "inner/time.hmd": "# Inner time\n",
    });
    const table = ws.importTable("a.hmd");
    expect(table.bindings.size).toBe(0);
    expect(table.problems.map(([rule]) => rule)).toEqual(["HMD015"]);
  });
});
