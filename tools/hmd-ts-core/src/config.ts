/**
 * `.hmd/config.toml` (HMD-0001 §4, §5.3, HMD-0020 §5).
 *
 * Root *discovery* — walking up for a `.hmd/` directory — belongs to
 * the host, which is the only party with a filesystem above the namespace root.
 * The core reads exactly three settings and nothing else.
 */

import { parse as parseToml } from "smol-toml";

import type { WorkspaceConfig } from "./workspace.js";

export const MARKER_DIR = ".hmd";
export const CONFIG_NAME = "config.toml";
export const DEFAULT_LOCATION_PATH = ".";
export const DEFAULT_MODE = "both";
export const VALID_MODES: ReadonlySet<string> = new Set(["both", "recursive"]);

/** An unusable root or config file — not a lint finding. */
export class ConfigError extends Error {}

export interface ProjectConfig extends WorkspaceConfig {
  /** The `location_path` setting: the namespace root, relative to the vault. */
  locationPath: string;
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  locationPath: DEFAULT_LOCATION_PATH,
  autodiscovery: true,
  mode: DEFAULT_MODE,
  source: null,
};

/** Parse `.hmd/config.toml`. `source` is recorded for reporting only. */
export function parseConfigToml(text: string, source: string | null = null): ProjectConfig {
  let data: Record<string, unknown>;
  try {
    data = parseToml(text) as Record<string, unknown>;
  } catch (exc) {
    throw new ConfigError(`cannot read ${source ?? CONFIG_NAME}: ${String(exc)}`);
  }

  // `wiki` was this key's name before 0.1. A config that still sets it is
  // refused rather than read with the default, so a vault never loads from a
  // namespace root its author did not choose.
  if ("wiki" in data) {
    throw new ConfigError(
      `${source ?? CONFIG_NAME} sets \`wiki\`, which is no longer read: rename it to \`location_path\``,
    );
  }

  const locationPath = data["location_path"] ?? DEFAULT_LOCATION_PATH;
  if (typeof locationPath !== "string") {
    throw new ConfigError(`\`location_path\` must be a string in ${source ?? CONFIG_NAME}`);
  }

  const discovery =
    typeof data["discovery"] === "object" && data["discovery"] !== null
      ? (data["discovery"] as Record<string, unknown>)
      : {};

  const autodiscovery = discovery["autodiscovery"] ?? true;
  if (typeof autodiscovery !== "boolean") {
    throw new ConfigError("[discovery] autodiscovery must be a boolean");
  }

  const mode = discovery["mode"] ?? DEFAULT_MODE;
  if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
    throw new ConfigError(
      `[discovery] mode must be one of ${[...VALID_MODES].sort().join(", ")}, got ${JSON.stringify(mode)}`,
    );
  }

  return { locationPath, autodiscovery, mode: mode as "both" | "recursive", source };
}

/**
 * Refuse a `location_path` that resolves into a nested vault.
 *
 * The namespace root has to lie in the vault whose config names it: a
 * directory between the vault and the root that carries its own `.hmd/` is
 * another vault, and its cards are never the enclosing vault's. `hasMarker`
 * answers for a directory given relative to the vault, with `/` between its
 * components; the vault's own marker is never asked about. The core has no
 * filesystem, so the host supplies it.
 */
export async function checkLocationPath(
  locationPath: string,
  hasMarker: (directory: string) => Promise<boolean>,
): Promise<void> {
  const parts = locationPath.split("/").filter((part) => part !== "" && part !== ".");
  for (let end = 1; end <= parts.length; end += 1) {
    const directory = parts.slice(0, end).join("/");
    if (await hasMarker(directory)) {
      throw new ConfigError(
        `\`location_path\` "${locationPath}" resolves into the nested vault at ${directory}; ` +
          `the namespace root must lie in the vault that names it`,
      );
    }
  }
}
