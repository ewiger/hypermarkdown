import { describe, expect, it } from "vitest";

import { pyRepr } from "../src/pyrepr.js";

describe("pyRepr writes a value as Python's repr does", () => {
  it("quotes strings with single quotes unless the text holds one", () => {
    expect(pyRepr("import tokens from /lib")).toBe("'import tokens from /lib'");
    expect(pyRepr("it's")).toBe(`"it's"`);
    expect(pyRepr(`it's "x"`)).toBe(`'it\\'s "x"'`);
    expect(pyRepr("a\\b\n")).toBe("'a\\\\b\\n'");
  });

  it("writes mappings, lists, and scalars in Python's spelling", () => {
    expect(pyRepr({ key: "value" })).toBe("{'key': 'value'}");
    expect(pyRepr(["a", 1, true, null])).toBe("['a', 1, True, None]");
    expect(pyRepr(false)).toBe("False");
  });
});
