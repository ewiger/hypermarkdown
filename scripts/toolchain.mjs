#!/usr/bin/env node
/**
 * Install the pinned `hypermarkdown-toolchain` release (issue 0107).
 *
 * `d2` is the project's only native binary, and before this script it was
 * acquired three different ways — `docker create terrastruct/d2:latest` in
 * `ci.yml`, the same lines copy-pasted into `pages.yml`, and whatever happened
 * to be on `PATH` in the VS Code extension. `:latest` is not a pin: identical
 * cards could render differently in two runs and nothing recorded why.
 *
 * There is now one pin, `toolchain.json`, and one way to honour it: this file.
 * It downloads the archive for a platform, checks it against the digest pinned
 * in the repository rather than against anything the download itself carries,
 * unpacks it, and prints where `bin/` landed.
 *
 *   node scripts/toolchain.mjs                       # this host, print bin/
 *   node scripts/toolchain.mjs --platform windows-x86_64 --dest build/win
 *   node scripts/toolchain.mjs --github-path         # also append to PATH in CI
 *
 * Node 20+, no dependencies. Unpacking shells out to `tar` and `unzip`, which
 * every runner and developer machine this project supports already has; adding
 * an archive reader in the repository that pins archives would be a dependency
 * on our own code being right about a format we do not control.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`toolchain: ${message}`);
  process.exit(1);
}

/** The platform names the toolchain publishes, from what Node reports. */
function hostPlatform() {
  const os = { linux: "linux", darwin: "macos", win32: "windows" }[platform()];
  const cpu = { x64: "x86_64", arm64: "arm64" }[arch()];
  if (!os || !cpu) fail(`unsupported host ${platform()}/${arch()}`);
  // The toolchain publishes no windows-arm64 archive; Windows on ARM runs the
  // x86_64 binary under emulation, which is what VS Code itself ships for.
  if (os === "windows") return "windows-x86_64";
  return `${os}-${cpu}`;
}

const args = process.argv.slice(2);
function flag(name) {
  return args.includes(`--${name}`);
}
function option(name, fallback) {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value`);
  return value;
}

const pin = JSON.parse(readFileSync(join(ROOT, "toolchain.json"), "utf8"));
const target = option("platform", hostPlatform());
const archive = pin.archives[target];
if (!archive) fail(`toolchain ${pin.version} publishes no archive for ${target}`);

// Default cache: one directory per version and platform, so a version bump is
// a fresh download rather than a half-updated tree, and two platforms can be
// staged side by side — which is exactly what the VSIX matrix does.
const dest = resolve(ROOT, option("dest", join(".toolchain", pin.version, target)));
const bin = join(dest, "bin");
const exe = join(bin, target.startsWith("windows") ? "d2.exe" : "d2");

async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail(`GET ${url} → ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

if (!flag("force") && existsSync(exe)) {
  // The marker is written last, after the digest check and the unpack, so a
  // run interrupted midway does not leave a directory that looks complete.
  if (existsSync(join(dest, ".installed"))) {
    process.stdout.write(`${bin}\n`);
    if (flag("github-path")) appendFileSync(process.env.GITHUB_PATH, `${bin}\n`);
    process.exit(0);
  }
}

const url =
  `https://github.com/${pin.repo}/releases/download/v${pin.version}/${archive.name}`;
console.error(`toolchain ${pin.version} (${target}): ${url}`);

const body = await download(url);
const digest = createHash("sha256").update(body).digest("hex");
// Against `toolchain.json`, not against a `SHA256SUMS` fetched beside the
// archive: a checksum file downloaded from the same place as the thing it
// describes proves only that the two agree. The pin is in this repository, it
// is reviewed, and it is what makes the release immutable to us.
if (digest !== archive.sha256) {
  fail(`digest mismatch for ${archive.name}\n  expected ${archive.sha256}\n  got      ${digest}`);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const staged = join(dest, archive.name);
writeFileSync(staged, body);

if (archive.name.endsWith(".zip")) {
  execFileSync("unzip", ["-q", "-o", staged, "-d", dest], { stdio: "inherit" });
} else {
  execFileSync("tar", ["-xzf", staged, "-C", dest], { stdio: "inherit" });
}
rmSync(staged);

if (!existsSync(exe)) fail(`${archive.name} unpacked without ${exe}`);

// The manifest travels with the binary and names the d2 version inside it, so
// a consumer that has only the unpacked directory can still say what it has.
const manifest = JSON.parse(readFileSync(join(dest, "manifest.json"), "utf8"));
if (manifest.toolchain !== pin.version) {
  fail(`archive manifest says toolchain ${manifest.toolchain}, pin says ${pin.version}`);
}

writeFileSync(join(dest, ".installed"), `${digest}\n`);
console.error(`toolchain: d2 ${manifest.tools?.d2?.version ?? "?"} at ${exe}`);

process.stdout.write(`${bin}\n`);
if (flag("github-path")) appendFileSync(process.env.GITHUB_PATH, `${bin}\n`);
