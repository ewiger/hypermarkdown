import { describe, expect, it } from "vitest";

import {
  ConfigError,
  DEFAULT_LOCATION_PATH,
  checkLocationPath,
  parseConfigToml,
} from "../src/config.js";

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

  it("refuses a `location_path` that resolves into a nested vault", async () => {
    // `inner/` carries its own `.hmd/`, so it is another vault: a namespace
    // root at it or below it is refused, and the error names the key and the
    // nested vault.
    const markers = new Set(["inner"]);
    const hasMarker = async (directory: string) => markers.has(directory);

    for (const path of ["inner", "inner/notes", "./inner/notes/"]) {
      await expect(checkLocationPath(path, hasMarker)).rejects.toThrow(ConfigError);
      await expect(checkLocationPath(path, hasMarker)).rejects.toThrow(
        "resolves into the nested vault at inner",
      );
    }
    // The vault itself, and a sibling of the nested vault, are fine.
    for (const path of [".", "", "notes", "notes/inner"]) {
      await expect(checkLocationPath(path, hasMarker)).resolves.toBeUndefined();
    }
  });
});
