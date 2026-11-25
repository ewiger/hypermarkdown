/**
 * Which `hmd-lsp` to start, and whether to start one at all (HMD-0033).
 *
 * Free of the `vscode` API, so every decision here is tested: the order the
 * program is looked for in, and the reasons the server stays off.
 *
 * The order is the one `d2` and `hql` use:
 *
 *   1. the path in the `hyperMarkdown.languageServer.path` setting;
 *   2. the binary this build carries in `toolchain/bin/`;
 *   3. `hmd-lsp` on `PATH`.
 *
 * A configured path that is not a file is an answer and not a fall-through:
 * the user named a program, and starting a different one would hide the typo.
 */

import { delimiter, join } from "node:path";

/** The program's file name on this platform. */
export function programName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "hmd-lsp.exe" : "hmd-lsp";
}

export interface LocateInput {
  /** The setting, or `null` when it is empty. */
  configuredPath: string | null;
  /** The binary in the VSIX, or `null` when this build carries none. */
  bundledPath: string | null;
  /** The value of the `PATH` environment variable. */
  pathEnv: string | undefined;
  platform: NodeJS.Platform;
  /** Whether a path names a file. Injected so the search is tested without a disk. */
  isFile: (path: string) => boolean;
}

export type Located =
  | { found: true; command: string; source: "setting" | "bundled" | "PATH" }
  | { found: false; reason: string };

export function locateServer(input: LocateInput): Located {
  const configured = input.configuredPath?.trim() ?? "";
  if (configured !== "") {
    return input.isFile(configured)
      ? { found: true, command: configured, source: "setting" }
      : {
          found: false,
          reason: `hyperMarkdown.languageServer.path names ${configured}, which is not a file`,
        };
  }
  if (input.bundledPath !== null) {
    return { found: true, command: input.bundledPath, source: "bundled" };
  }
  const name = programName(input.platform);
  for (const dir of (input.pathEnv ?? "").split(delimiterFor(input.platform))) {
    if (dir === "") continue;
    const candidate = joinFor(input.platform, dir, name);
    if (input.isFile(candidate)) return { found: true, command: candidate, source: "PATH" };
  }
  return {
    found: false,
    reason: "this build carries no hmd-lsp for this platform, and none is on PATH",
  };
}

/**
 * `PATH` is split and joined by the rules of the platform being asked about,
 * not the one the test runs on.
 */
function delimiterFor(platform: NodeJS.Platform): string {
  if (platform === process.platform) return delimiter;
  return platform === "win32" ? ";" : ":";
}

function joinFor(platform: NodeJS.Platform, dir: string, name: string): string {
  if (platform === process.platform) return join(dir, name);
  const separator = platform === "win32" ? "\\" : "/";
  return dir.endsWith(separator) ? `${dir}${name}` : `${dir}${separator}${name}`;
}

export interface StartInput {
  /** The `hyperMarkdown.languageServer.enabled` setting. */
  enabled: boolean;
  /** Whether the user trusts the workspace. */
  trusted: boolean;
  /** The scheme of every workspace folder. */
  folderSchemes: readonly string[];
  located: Located;
}

export type Decision =
  | { start: true; command: string; source: "setting" | "bundled" | "PATH" }
  /** `notify` is whether the reason is worth telling the user once. */
  | { start: false; reason: string; notify: boolean };

/**
 * Whether the server starts in this window.
 *
 * The server is a process that reads the disk. It does not start in an
 * untrusted workspace, where the extension runs nothing, or in a virtual one,
 * where there is no disk to read. Neither is a fault to report: the extension
 * declares both as limited support. Only a program that could not be found is
 * told to the user, and only once.
 */
export function decideStart(input: StartInput): Decision {
  if (!input.enabled) {
    return { start: false, reason: "the language server is turned off", notify: false };
  }
  if (!input.trusted) {
    return { start: false, reason: "the workspace is not trusted", notify: false };
  }
  if (input.folderSchemes.some((scheme) => scheme !== "file")) {
    return { start: false, reason: "the workspace is virtual", notify: false };
  }
  if (!input.located.found) {
    return { start: false, reason: input.located.reason, notify: true };
  }
  return { start: true, command: input.located.command, source: input.located.source };
}
