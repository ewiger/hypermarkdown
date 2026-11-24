/**
 * Where a frontmatter diagnostic is reported: the specification's five rules.
 *
 * The same table as the canonical implementation's
 * `tests/test_frontmatter_position.py`, row for row.
 */

import { describe, expect, it } from "vitest";

import { Locator, entry, key, nested, type Where } from "../src/frontmatterPosition.js";

const CASES: Array<[string, Where, [number, number]]> = [
  ["tags: 5\n", key("tags"), [2, 1]],
  ["owner: me\ntags: 5\n", key("tags"), [3, 1]],
  ['"tags": 5\n', key("tags"), [2, 1]],
  ["other: 1\n", key("tags"), [1, 1]],
  ["nav:\n  order: 1\n  colour: red\n", nested("nav", "colour"), [4, 3]],
  ["nav:\n\torder: x\n", nested("nav", "order"), [3, 2]],
  ["nav:\n  order: 1\n", nested("nav", "colour"), [2, 1]],
  ["nav: {order: x}\n", nested("nav", "order"), [2, 7]],
  ["nav: {visibility: x, 'order': y}\n", nested("nav", "order"), [2, 22]],
  ["import:\n  - from /a import b\n  - bad\n", entry("import", 1), [4, 5]],
  ["tags:\n- a\n- ''\n", entry("tags", 1), [4, 3]],
  ["tags:\n  - a\n  # a comment\n\n  - b\n", entry("tags", 1), [6, 5]],
  ["tags:\n  - a\n  -\n", entry("tags", 1), [4, 3]],
  ["tags:\n  - - x\n  - y\n", entry("tags", 1), [4, 5]],
  ["tags: # note\n  - a\n  - b\n", entry("tags", 1), [4, 5]],
  ['tags: ["", area]\n', entry("tags", 0), [2, 8]],
  ["tags: [area, {key: value}]\n", entry("tags", 1), [2, 14]],
  ['tags: ["a, b", c]\n', entry("tags", 1), [2, 16]],
  ["tags: ['it''s', [x, y], z]\n", entry("tags", 2), [2, 25]],
  ["tags: [\n  a,\n  '',\n]\n", entry("tags", 1), [4, 3]],
  ["tags: [a]\n", entry("tags", 3), [2, 1]],
  ["use: no_discovery\n", entry("use", 0), [2, 1]],
  ["tags: []\n", key("tags"), [2, 1]],
  // Columns count code points: the astral `𝒜` is one column, not two.
  ["tags: [𝒜, '']\n", entry("tags", 1), [2, 11]],
];

describe("the position of a frontmatter diagnostic", () => {
  it.each(CASES)("%j at %j", (block, where, position) => {
    expect(new Locator(block).locate(where)).toEqual(position);
  });

  it("puts the block itself at line 1, column 1", () => {
    expect(new Locator("tags: [unclosed\n").locate(null)).toEqual([1, 1]);
  });
});

describe("the raw value of a nested key", () => {
  it.each([
    ["nav:\n  order: 1.0\n", "1.0"],
    ["nav:\n  order: 1e3  # an exponent\n", "1e3"],
    ["nav:\n  visibility: public\n  order:   -3\n", "-3"],
    ["nav:\n  visibility: public\n", null],
    ["nav: {order: 1.0}\n", "1.0"],
    ["nav: {visibility: public, order: 2}\n", "2"],
  ])("%j is %j", (block, value) => {
    expect(new Locator(block).nestedValue("nav", "order")).toBe(value);
  });
});
