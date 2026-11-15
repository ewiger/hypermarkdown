/**
 * `.hmd/config.toml` (HMD-0001 §4, §5.3, HMD-0020 §5).
 *
 * Root *discovery* — walking up for a `.hmd/` or `.git` directory — belongs to
 * the host, which is the only party with a filesystem above the namespace root.
 * The core reads exactly three settings and nothing else.
 */

import { parse as parseToml } from "smol-toml";

import type { WorkspaceConfig } from "./workspace.js";

export const MARKER_DIR = ".hmd";
export const CONFIG_NAME = "config.toml";
export const DEFAULT_WIKI = "doc/wiki";
export const DEFAULT_MODE = "both";
export const VALID_MODES: ReadonlySet<string> = new Set(["both", "recursive"]);

/** An unusable root or config file — not a lint finding. */
export class ConfigError extends Error {}

export interface ProjectConfig extends WorkspaceConfig {
  /** The `wiki` setting: the cards location, naming the namespace root relative to the project root. */
  wiki: string;
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  wiki: DEFAULT_WIKI,
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

  const wiki = data["wiki"] ?? DEFAULT_WIKI;
  if (typeof wiki !== "string") {
    throw new ConfigError(`\`wiki\` must be a string in ${source ?? CONFIG_NAME}`);
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

  return { wiki, autodiscovery, mode: mode as "both" | "recursive", source };
}
