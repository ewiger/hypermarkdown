// Build the cover's live editor: `doc/wiki/assets/hmd-demo.bundle.js`.
//
//   node scripts/build-site-demo.mjs
//
// One ES module holding the TypeScript implementation and the example vault.
// The page loads it the first time a visitor opens the "Try it" tab, so it
// costs nothing to anyone who does not. The file is build output and is not
// committed; the site works without it, with one tab fewer.

import { build } from "esbuild";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = join(root, "examples", "small");
const out = join(root, "doc", "wiki", "assets", "hmd-demo.bundle.js");

/** What the page may cost a visitor who opens the tab, before compression. */
export const BUDGET_BYTES = 300 * 1024;

function cardsUnder(dir) {
  const found = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name.startsWith(".")) continue;
      Object.assign(found, cardsUnder(path));
    } else if (name.endsWith(".hmd")) {
      found[relative(vaultDir, path).split("\\").join("/")] = readFileSync(path, "utf8");
    }
  }
  return found;
}

await build({
  entryPoints: [join(root, "scripts", "site-demo", "entry.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  alias: { katex: join(root, "scripts", "site-demo", "katex-stub.mjs") },
  define: { __HMD_DEMO_VAULT__: JSON.stringify(cardsUnder(vaultDir)) },
});

const size = statSync(out).size;
console.log(`${relative(root, out)}: ${(size / 1024).toFixed(1)} KiB`);
if (size > BUDGET_BYTES) {
  console.error(`over the budget of ${BUDGET_BYTES / 1024} KiB`);
  process.exit(1);
}
