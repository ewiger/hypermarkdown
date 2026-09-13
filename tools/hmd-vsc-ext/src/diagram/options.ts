/**
 * Where this installation's `d2` may be found (issue 0107).
 *
 * Split from `engine.ts` so the engine stays free of the `vscode` API: it is
 * given two paths and knows the order to try them in, and this file is the only
 * place that knows those paths come from a setting and from the VSIX layout.
 */

import { accessSync, chmodSync, constants, existsSync } from "node:fs";

import * as vscode from "vscode";

import type { DiagramEngineOptions } from "./engine.js";

/**
 * The bundled binary's path inside the extension, as the release workflow
 * writes it. `d2.exe` on Windows; the platform-specific VSIX for a Windows
 * target is the only one that carries it.
 */
const BUNDLED = ["toolchain", "bin", process.platform === "win32" ? "d2.exe" : "d2"];

export function diagramOptions(extensionUri: vscode.Uri): DiagramEngineOptions {
  const configured = vscode.workspace
    .getConfiguration("hyperMarkdown")
    .get<string>("diagram.d2Path", "")
    .trim();

  // A platform-neutral VSIX has no `toolchain/`, and neither does a source
  // checkout running under the Extension Development Host. Both are supported:
  // the engine falls through to `PATH`.
  const bundled = vscode.Uri.joinPath(extensionUri, ...BUNDLED).fsPath;

  return {
    configuredPath: configured === "" ? null : configured,
    bundledPath: existsSync(bundled) && executable(bundled) ? bundled : null,
  };
}

/**
 * Make sure the bundled binary can be run, restoring the bit if it was lost.
 *
 * Whether the executable bit survives the VSIX depends on the packer and on the
 * installer that unpacked it, and losing it turns the deterministic default into
 * a silent fall-through to whatever `d2` happens to be on `PATH` — the
 * unpinned behaviour issue 0107 removed, reappearing as a permissions bug. One
 * `chmod` at resolution time costs nothing and closes it.
 */
function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    try {
      chmodSync(path, 0o755);
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      // A read-only install location. `PATH` is the honest answer here.
      return false;
    }
  }
}
