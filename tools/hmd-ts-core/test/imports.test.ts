import { describe, expect, it } from "vitest";

import { ImportSyntaxError, parseStatement } from "../src/imports.js";

describe("the import statement grammar", () => {
  it("takes spaces and tabs as WS, and around a comma", () => {
    const stmt = parseStatement("from\t./a\timport\ta,b , c\t,\td\tas\te");
    expect(stmt.bindings).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
      ["d", "e"],
    ]);
  });

  it("refuses other whitespace, a reserved character in a name, and other case", () => {
    for (const raw of [
      "from\u00a0./a import a",
      "from ./a import\u00a0a",
      "from ./a import a,\u00a0b",
      "from ./a import a\u00a0as b",
      "from ./a import x:y",
      "from ./a import a as x#y",
      "From ./a import a",
      "from ./a Import a",
      "from ./a import a AS b",
    ]) {
      expect(() => parseStatement(raw), raw).toThrow(ImportSyntaxError);
    }
  });
});
