/**
 * The webview entry point (HMD-0021 §4, §6).
 *
 * Message handling, the tab strip, scroll sync, and click routing. All DOM
 * construction lives in `render.ts`; this file is the wiring.
 */

import { IR_VERSION } from "@hypermarkdown/core";

import type { HostMessage, PreviewMode, WebviewMessage } from "../src/protocol.js";
import { GraphTab } from "./graph.js";
import {
  collectAnchors,
  lineForOffset,
  offsetForLine,
  patchBlocks,
  renderBreadcrumb,
  type Anchor,
  type RenderSettings,
} from "./render.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const ECHO_LOCKOUT_MS = 250;
const SCROLL_THROTTLE_MS = 50;

const vscode = acquireVsCodeApi();

const content = document.getElementById("hmd-content") as HTMLElement;
const breadcrumb = document.getElementById("hmd-breadcrumb") as HTMLElement;
const status = document.getElementById("hmd-status") as HTMLElement;
const chrome = document.querySelector(".hmd-chrome") as HTMLElement;

const graph = new GraphTab(
  document.getElementById("hmd-graph") as HTMLElement,
  {
    // A node opens the card it stands for, which is the same request a link in
    // the rendered tab makes.
    open: (path) => vscode.postMessage({ type: "openTarget", path, fragment: null }),
    setView: (view) => vscode.postMessage({ type: "graphView", view }),
    setFullScreen: (on) => vscode.postMessage({ type: "fullScreen", on }),
  },
  { scope: "card", direction: "downstream" },
);

let mode: PreviewMode = "rendered";
let settings: RenderSettings = { embeds: "expanded" };
let anchors: Anchor[] = [];
let scrollSync = true;
let lastApplied = 0;
let lastSent = 0;

// -- messages ------------------------------------------------------------

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message === null || typeof message !== "object") return;

  switch (message.type) {
    case "render": {
      // A consumer receiving an unknown version refuses to render rather than
      // guessing: a stale webview after an update is the ordinary case.
      if (message.irVersion !== IR_VERSION) {
        showStatus(`Preview is out of date (IR v${message.irVersion}). Reload the window.`);
        return;
      }
      clearStatus();
      settings = { embeds: message.settings.embeds };
      scrollSync = message.settings.scrollSync;
      document.body.classList.toggle("is-pinned", message.pinned);
      applyMode(message.mode);
      // The host cannot see this; a restored panel is handed back only what
      // the webview persisted for itself. The card and the vault that claims
      // it, and nothing else — a persisted `pinned` outlives the build that
      // wrote it and comes back as a frozen preview with nothing on screen to
      // explain it (issue 0105).
      vscode.setState({ card: message.document.path, vault: message.vault });
      renderBreadcrumb(breadcrumb, message.document);
      patchBlocks(content, message.document.blocks, settings);
      anchors = collectAnchors(content);
      return;
    }
    case "graph": {
      if (message.irVersion !== IR_VERSION) return;
      clearStatus();
      applyMode("graph");
      graph.update(message.graph);
      return;
    }
    case "revealLine": {
      if (!scrollSync) return;
      if (Date.now() - lastSent < ECHO_LOCKOUT_MS) return;
      lastApplied = Date.now();
      // Editor -> preview is applied on the next frame, unthrottled: it is the
      // direction the user perceives as latency (§6).
      requestAnimationFrame(() => {
        window.scrollTo({ top: offsetForLine(anchors, message.line) });
      });
      return;
    }
    case "setMode":
      selectTab(message.mode);
      return;
    case "error":
      // Never blank the panel: stale content plus a warning beats an empty one,
      // because the author can still read what they wrote (§5.1).
      showStatus(message.message);
      return;
    default:
      return;
  }
});

// -- tabs ----------------------------------------------------------------

/**
 * Show one tab.
 *
 * Both tabs keep their DOM — the rendered card is patched rather than rebuilt,
 * and the graph's canvas costs a layout to recreate — so switching is a matter
 * of which one is on screen (HMD-0025).
 */
function applyMode(next: PreviewMode): void {
  mode = next;
  for (const tab of Array.from(document.querySelectorAll<HTMLElement>(".hmd-tab"))) {
    const active = tab.dataset["mode"] === next;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  content.hidden = next !== "rendered";
  if (next === "graph") {
    measureChrome();
    graph.show();
  } else {
    graph.hide();
  }
}

/** Switch tabs on the reader's behalf, and tell the host what to send. */
function selectTab(next: PreviewMode): void {
  applyMode(next);
  vscode.postMessage({ type: "modeChanged", mode: next });
}

for (const tab of Array.from(document.querySelectorAll<HTMLElement>(".hmd-tab"))) {
  tab.addEventListener("click", () => {
    const next = tab.dataset["mode"];
    if (next === "rendered" || next === "graph") selectTab(next);
  });
}

/**
 * Tell the stylesheet how tall the chrome is.
 *
 * The graph fills everything below it and cannot scroll with the page — a
 * canvas that scrolls away is a canvas you cannot pan — so it is positioned
 * against the viewport and needs the one measurement CSS cannot take.
 */
function measureChrome(): void {
  document.body.style.setProperty("--hmd-chrome-height", `${chrome.offsetHeight}px`);
}

// -- clicks --------------------------------------------------------------

content.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target === null) return;

  const toggle = target.closest<HTMLElement>(".hmd-embed-toggle");
  if (toggle !== null) {
    const card = toggle.closest<HTMLElement>(".hmd-embed");
    if (card !== null) {
      const collapsed = card.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.textContent = collapsed ? "▸" : "▾";
      anchors = collectAnchors(content);
    }
    event.preventDefault();
    return;
  }

  const link = target.closest<HTMLElement>("a[data-hmd-path], a[data-hmd-target]");
  if (link !== null) {
    event.preventDefault();
    const path = link.dataset["hmdPath"];
    if (path !== undefined) {
      vscode.postMessage({
        type: "openTarget",
        path,
        fragment: link.dataset["hmdFragment"] ?? null,
      });
      return;
    }
    const wanted = link.dataset["hmdTarget"];
    if (wanted !== undefined && link.classList.contains("hmd-redlink")) {
      vscode.postMessage({ type: "createCard", target: wanted });
    }
    return;
  }

  // Any other element reveals its source line (VSX-021).
  const anchored = target.closest<HTMLElement>("[data-line]");
  if (anchored !== null) {
    const line = Number(anchored.dataset["line"]);
    if (Number.isFinite(line)) {
      vscode.postMessage({ type: "openSource", path: "", line });
    }
  }
});

// -- scroll --------------------------------------------------------------

window.addEventListener("scroll", () => {
  if (!scrollSync || mode !== "rendered") return;
  if (Date.now() - lastApplied < ECHO_LOCKOUT_MS) return;
  if (Date.now() - lastSent < SCROLL_THROTTLE_MS) return;
  lastSent = Date.now();
  vscode.postMessage({ type: "scrolled", line: lineForOffset(anchors, window.scrollY) });
});

window.addEventListener("resize", () => {
  anchors = collectAnchors(content);
  if (mode === "graph") {
    measureChrome();
    graph.show();
  }
});

// -- status --------------------------------------------------------------

function showStatus(message: string): void {
  status.textContent = message;
  status.hidden = false;
}

function clearStatus(): void {
  status.hidden = true;
  status.textContent = "";
}

vscode.postMessage({ type: "ready" });
