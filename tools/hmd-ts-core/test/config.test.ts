import { describe, expect, it } from "vitest";

import { ConfigError, DEFAULT_LOCATION_PATH, parseConfigToml } from "../src/config.js";

describe("`.hmd/config.toml`", () => {
  it("reads the namespace root from `location_path`", () => {
    expect(parseConfigToml('location_path = "doc/wiki"\n').locationPath).toBe("doc/wiki");
  });

  it("defaults `location_path` to the vault itself", () => {
    expect(DEFAULT_LOCATION_PATH).toBe(".");
    expect(parseConfigToml("").locationPath).toBe(".");
  });

  it("refuses a config that sets the key's old name, `wiki`", () => {
    // Refused, not read with the default: alone, beside `location_path`, and
    // whatever its value. The error names both keys.
    for (const text of ['wiki = "doc/wiki"\n', 'location_path = "."\nwiki = "."\n']) {
      expect(() => parseConfigToml(text, ".hmd/config.toml")).toThrow(ConfigError);
      expect(() => parseConfigToml(text, ".hmd/config.toml")).toThrow(
        ".hmd/config.toml sets `wiki`, which is no longer read: rename it to `location_path`",
      );
    }
  });

  it("rejects a `location_path` that is not a string", () => {
    expect(() => parseConfigToml("location_path = 3\n")).toThrow(ConfigError);
  });
});
