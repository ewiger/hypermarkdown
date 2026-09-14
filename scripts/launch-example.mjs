/**
 * Launch the extension against an example tree.
 *
 * Builds both bundles, then opens a VS Code Extension Development Host with
 * every other extension disabled. This exists because F5 depends on VS Code's
 * remembered launch selection, which is state you cannot see and cannot reset
 * from a file — a command has no memory.
 *
 *   node scripts/launch-example.mjs <name> [--print]
 *
 * `<name>` is a directory under examples/, or `repo` for this whole repository
 * — which is the target that holds several vaults at once, `doc/wiki` plus one
 * per example tree, and so the only one that exercises discovery (issue 0108).
 * `wiki` is kept as an older name for the same target. `--print` shows the
 * command without running it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(repoRoot, "tools", "hmd-vsc-ext");

const args = process.argv.slice(2);
const dryRun = args.includes("--print");
const name = args.find((a) => !a.startsWith("--")) ?? "cs-alg-sorting";

// `repo` and `wiki` both mean the repository itself: a workspace folder with
// no `.hmd/` of its own, holding a vault in `doc/wiki` and one per example.
const target = name === "repo" || name === "wiki" ? repoRoot : join(repoRoot, "examples", name);

if (!existsSync(target)) {
  console.error(`launch-example: no such example: ${name}`);
  console.error(`  looked for ${target}`);
  console.error("  try one of: cs-alg-sorting, small, repo");
  process.exit(2);
}

const codeArgs = [
  // Without -n, `code` hands its arguments to an already-running instance,
  // which ignores --extensionDevelopmentPath and opens an ordinary window.
  "-n",
  `--extensionDevelopmentPath=${extensionPath}`,
  "--disable-extensions",
  target,
];

if (dryRun) {
  console.log(["code", ...codeArgs].join(" "));
  process.exit(0);
}

// Build first, so the window never opens on a stale bundle.
const build = spawnSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const child = spawn("code", codeArgs, { cwd: repoRoot, stdio: "inherit", detached: true });

child.on("error", (error) => {
  if ("code" in error && error.code === "ENOENT") {
    console.error("launch-example: the `code` command is not on your PATH.");
    console.error("  In VS Code: Cmd+Shift+P -> \"Shell Command: Install 'code' command in PATH\"");
    process.exit(127);
  }
  console.error(`launch-example: ${error.message}`);
  process.exit(1);
});

child.on("spawn", () => {
  console.log(`\nOpened the extension host on ${target}`);
  console.log("Click the ⚡ at the top right of any editor group to open a preview tab.");
  child.unref();
});
