// Render the site's link-preview card: doc/assets/social-card.png, 1200x630.
//
//   node scripts/social-card.mjs
//
// The card is drawn in scripts/social-card/card.html and photographed by a
// headless Chrome over the DevTools protocol, with no dependencies. Set
// CHROME to the browser's path where it is not the macOS default. The fonts
// come from Google Fonts, so this needs a network. The PNG is committed; run
// this only when the card changes.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = pathToFileURL(join(root, "scripts", "social-card", "card.html")).href;
const out = join(root, "doc", "assets", "social-card.png");
const chromePath =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "card-"))}`,
    "--hide-scrollbars",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = pages.find((t) => t.type === "page");
  } catch {
    await sleep(200);
  }
}
if (!target) {
  chrome.kill();
  throw new Error(`no browser at ${chromePath}`);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 630,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: source });
await sleep(500);
await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
await sleep(300);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
ws.close();
chrome.kill();
