/**
 * The host/webview message contract (HMD-0021 §4).
 *
 * Shared by both sides so a change to one is a compile error in the other. The
 * host validates every inbound message against these shapes: the webview is
 * the extension's own code, but the message boundary is still a trust boundary.
 */

import type { BacklinkEntry, DocumentIR } from "@hypermarkdown/core";

export type PreviewMode = "rendered" | "backlinks";

export interface PreviewSettings {
  scrollSync: boolean;
  embeds: "expanded" | "collapsed";
}

export type HostMessage =
  | {
      type: "render";
      irVersion: number;
      /** The vault this card belongs to, which the webview persists with it. */
      vault: string;
      document: DocumentIR;
      mode: PreviewMode;
      settings: PreviewSettings;
      pinned: boolean;
    }
  | { type: "backlinks"; irVersion: number; items: BacklinkEntry[] }
  | { type: "revealLine"; line: number }
  | { type: "setMode"; mode: PreviewMode }
  | { type: "error"; message: string };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "openSource"; path: string; line: number }
  | { type: "openTarget"; path: string; fragment: string | null }
  | { type: "createCard"; target: string }
  | { type: "scrolled"; line: number }
  | { type: "modeChanged"; mode: PreviewMode };

const MODES: readonly PreviewMode[] = ["rendered", "backlinks"];

function isMode(value: unknown): value is PreviewMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/**
 * Narrow an untrusted `postMessage` payload, or return null.
 *
 * Returning null rather than throwing keeps one malformed message from taking
 * down the message listener for the rest of the session.
 */
export function parseWebviewMessage(raw: unknown): WebviewMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as Record<string, unknown>;

  switch (message["type"]) {
    case "ready":
      return { type: "ready" };
    case "openSource":
      return typeof message["path"] === "string" && Number.isFinite(message["line"])
        ? { type: "openSource", path: message["path"], line: Number(message["line"]) }
        : null;
    case "openTarget":
      return typeof message["path"] === "string"
        ? {
            type: "openTarget",
            path: message["path"],
            fragment: typeof message["fragment"] === "string" ? message["fragment"] : null,
          }
        : null;
    case "createCard":
      return typeof message["target"] === "string"
        ? { type: "createCard", target: message["target"] }
        : null;
    case "scrolled":
      return Number.isFinite(message["line"])
        ? { type: "scrolled", line: Number(message["line"]) }
        : null;
    case "modeChanged":
      return isMode(message["mode"]) ? { type: "modeChanged", mode: message["mode"] } : null;
    default:
      return null;
  }
}

/**
 * Reject a path that leaves the namespace root.
 *
 * The renderer only ever sends paths the core produced, so this can only fire
 * on a defect — which is exactly when a file-read primitive would be worth
 * having, and exactly why the check is here.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  return !path.split("/").includes("..");
}
