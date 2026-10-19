/**
 * Where this installation's `hql` may be found (HMD-0026).
 *
 * Split from `engine.ts` for the reason `diagram/options.ts` is: the engine is
 * given paths and knows the order to try them in, and this file is the only
 * place that knows they come from a setting and from the VSIX layout.
 */

import { existsSync } from "node:fs";

import * as vscode from "vscode";

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
    bundledPath: existsSync(bundled) ? bundled : null,
  };
}
