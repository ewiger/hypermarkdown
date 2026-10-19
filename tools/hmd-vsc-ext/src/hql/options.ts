/**
 * Where this installation's `hql` may be found (HMD-0026, issue 0111).
 *
 * Split from `engine.ts` for the reason `diagram/options.ts` is: the engine is
 * given paths and knows the order to try them in, and this file is the only
 * place that knows they come from a setting and from the VSIX layout.
 *
 * The default is the `hql` the pinned toolchain release puts in a
 * platform-specific VSIX, beside `d2`. HQL publishes Linux x64 and both macOS
 * targets; the other VSIXes carry no `hql`, and fall through to `PATH`.
 */

import { existsSync } from "node:fs";

import * as vscode from "vscode";

import { executable } from "../diagram/options.js";
import type { HqlEngineOptions } from "./engine.js";

/** The bundled binary's path inside the extension, when a build carries one. */
const BUNDLED = ["toolchain", "bin", process.platform === "win32" ? "hql.exe" : "hql"];

export function hqlOptions(extensionUri: vscode.Uri): HqlEngineOptions {
  const configured = vscode.workspace
    .getConfiguration("hyperMarkdown")
    .get<string>("hql.path", "")
    .trim();
  const bundled = vscode.Uri.joinPath(extensionUri, ...BUNDLED).fsPath;
  return {
    configuredPath: configured === "" ? null : configured,
    // The executable bit may not survive the VSIX, as with `d2`; restoring it
    // here keeps the bundled default from silently becoming `PATH`.
    bundledPath: existsSync(bundled) && executable(bundled) ? bundled : null,
  };
}
