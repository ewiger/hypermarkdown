import { describe, expect, it } from "vitest";

import { check } from "../src/lint.js";
import { Workspace, DEFAULT_CONFIG } from "../src/workspace.js";
import { MemoryHost } from "../src/host.js";

/** `p0` embeds `p1`, and so on: `embeds` nested embeds below `p0`. */
async function chain(embeds: number): Promise<Workspace> {
  const files: Record<string, string> = {};
  for (let i = 0; i < embeds; i += 1) files[`p${i}.hmd`] = `# P${i}\n\n![[p${i + 1}]]\n`;
  files[`p${embeds}.hmd`] = "# End\n";
  return Workspace.load(new MemoryHost(new Map(Object.entries(files))), DEFAULT_CONFIG);
}

describe("the embed depth limit (HMD008)", () => {
  it("allows a depth of exactly sixteen, the starting card being depth zero", async () => {
    expect(check(await chain(16)).filter((d) => d.rule === "HMD008")).toEqual([]);
  });

  it("is reported once, at the embed that would exceed the limit", async () => {
    const found = check(await chain(17)).filter((d) => d.rule === "HMD008");
    expect(found.map((d) => [d.path, d.line, d.column])).toEqual([["p16.hmd", 3, 1]]);
  });
});
