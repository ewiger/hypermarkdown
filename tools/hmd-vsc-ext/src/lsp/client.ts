/**
 * The extension as a client of `hmd-lsp`, the language server (HMD-0033).
 *
 * The server adds what a grammar cannot know: whether a link resolves, where
 * it leads, and why. It adds nothing the extension depends on. The preview,
 * the graph, the cells and the diagnostics all come from the TypeScript core,
 * and every one of them behaves the same whether this file starts a process
 * or not.
 *
 * The decisions are in `locate.ts`, which is tested. This file is the part
 * that touches the editor and the process.
 */

import { existsSync, statSync } from "node:fs";

import * as vscode from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

import { executable } from "../diagram/options.js";
import { decideStart, locateServer, programName, type Decision } from "./locate.js";

/** Set once the user has been told that no server was found. */
const TOLD = "hyperMarkdown.languageServer.toldAbsent";

const SETTINGS = "hyperMarkdown.languageServer";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function decide(extensionUri: vscode.Uri): Decision {
  const config = vscode.workspace.getConfiguration("hyperMarkdown");
  const configured = config.get<string>("languageServer.path", "").trim();
  const bundled = vscode.Uri.joinPath(
    extensionUri,
    "toolchain",
    "bin",
    programName(process.platform),
  ).fsPath;
  return decideStart({
    enabled: config.get<boolean>("languageServer.enabled", true),
    trusted: vscode.workspace.isTrusted,
    folderSchemes: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.scheme),
    located: locateServer({
      configuredPath: configured === "" ? null : configured,
      // The executable bit may not survive the VSIX, as with `d2`.
      bundledPath: existsSync(bundled) && executable(bundled) ? bundled : null,
      pathEnv: process.env["PATH"],
      platform: process.platform,
      isFile,
    }),
  });
}

/**
 * Starts the server, stops it, and starts it again when a setting or the
 * workspace's trust changes.
 */
export class LanguageServer implements vscode.Disposable {
  private client: LanguageClient | null = null;
  private readonly subscriptions: vscode.Disposable[] = [];
  /** Restarts run one after another, so two never overlap. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTINGS)) this.restart();
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.restart()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.restart()),
    );
  }

  /** Stops any running server and starts one when this window should have it. */
  restart(): void {
    this.queue = this.queue.then(() => this.apply()).catch(() => undefined);
  }

  private async apply(): Promise<void> {
    await this.stop();
    const decision = decide(this.context.extensionUri);
    if (!decision.start) {
      if (decision.notify) this.tellOnce(decision.reason);
      return;
    }

    const server: ServerOptions = { command: decision.command, args: ["--stdio"] };
    const options: LanguageClientOptions = {
      // Only files: a card under another scheme has no path, and the server
      // resolves nothing for it.
      documentSelector: [{ scheme: "file", language: "hmd" }],
      // The core already reports an unresolved, an ambiguous and an escaping
      // reference, with the rest of the linter's rules. The server's three
      // would show each of them twice.
      initializationOptions: { diagnostics: false },
      revealOutputChannelOn: RevealOutputChannelOn.Never,
    };
    const client = new LanguageClient(
      "hyperMarkdown.languageServer",
      "HyperMarkDown Language Server",
      server,
      options,
    );
    try {
      await client.start();
      this.client = client;
    } catch (exc) {
      // A program that does not start takes nothing else down with it.
      await client.dispose().catch(() => undefined);
      this.tellOnce(
        `${decision.command} did not start: ${exc instanceof Error ? exc.message : String(exc)}`,
      );
    }
  }

  private async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client !== null) await client.dispose().catch(() => undefined);
  }

  /**
   * Says that the server is absent, once per installation.
   *
   * Once, because the extension works without it: a notice on every window
   * would read as a fault, and nothing is broken.
   */
  private tellOnce(reason: string): void {
    if (this.context.globalState.get<boolean>(TOLD, false)) return;
    void this.context.globalState.update(TOLD, true);
    void vscode.window
      .showInformationMessage(
        `HyperMarkDown: the language server is not running — ${reason}. ` +
          "Everything else works without it. With it, a link that names no card is " +
          "coloured as broken, and hover and Go to Definition work on links.",
        "Open Settings",
      )
      .then((choice) => {
        if (choice === "Open Settings") {
          void vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS);
        }
      });
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.queue = this.queue.then(() => this.stop()).catch(() => undefined);
  }
}
