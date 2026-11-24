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

  it("does not read the key's old name, `wiki`", () => {
    // A config that still says only `wiki` gets the default, as any unknown
    // key does; one that says both is read by its new name.
    expect(parseConfigToml('wiki = "doc/wiki"\n').locationPath).toBe(".");
    expect(parseConfigToml('location_path = "."\nwiki = "doc/wiki"\n').locationPath).toBe(".");
  });

  it("rejects a `location_path` that is not a string", () => {
    expect(() => parseConfigToml("location_path = 3\n")).toThrow(ConfigError);
  });
});
