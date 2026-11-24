import { describe, expect, it } from "vitest";

import { parseCardConfig, parseYaml } from "../src/frontmatter.js";

function read(block: string) {
  return parseCardConfig(parseYaml(block), block);
}

describe("`nav` in frontmatter", () => {
  it("reads `order` and `visibility`", () => {
    const { card, problems } = read("nav:\n  order: 2\n  visibility: public\n");
    expect(card.nav).toEqual({ order: 2, visibility: "public" });
    expect(problems).toEqual([]);
  });

  it("leaves both unset when `nav` says nothing, so they inherit", () => {
    expect(read("tags: [a]\n").card.nav).toEqual({ order: null, visibility: null });
  });

  it.each([
    ["nav: 3\n", [2, 1], "`nav` must be a mapping"],
    ["nav:\n  order: 1\n  colour: red\n", [4, 3], "unknown key 'colour'"],
    ["nav:\n  order: first\n", [3, 3], "`nav.order` must be an integer"],
    ["nav:\n  order: true\n", [3, 3], "`nav.order` must be an integer"],
    ["nav:\n  visibility: hidden\n", [3, 3], "`nav.visibility` must be one of"],
  ])("reports %j as HMD013 at %j", (block, position, message) => {
    const { problems } = read(block);
    expect(problems.map(([rule, , where]) => [rule, where])).toEqual([["HMD013", position]]);
    expect(problems[0]![1]).toContain(message);
  });
});
