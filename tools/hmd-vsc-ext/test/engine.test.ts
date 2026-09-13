/**
 * How the extension decides which `d2` draws a diagram (issue 0107).
 *
 * The order is the point: an explicit setting wins, the binary bundled in the
 * platform-specific VSIX is the deterministic default, and `PATH` is the last
 * resort for a source checkout. The old Docker fallback is gone, so a diagram
 * can no longer be rendered by an image nobody pinned.
 *
 * The candidates here are tiny scripts rather than a mocked `execFile`: the
 * thing worth testing is that the engine runs the executable it chose, and a
 * mock that records a command string would pass whether or not it could.
 */

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DiagramEngine } from "../src/diagram/engine.js";

const dir = mkdtempSync(join(tmpdir(), "hmd-engine-"));

/** A stand-in for `d2 - -`: reads stdin, writes an SVG naming itself. */
function fakeD2(name: string): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\ncat >/dev/null\nprintf '<svg id="${name}"/>'\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

/** A stand-in that exists and runs but refuses every diagram. */
function brokenD2(name: string): string {
  const path = join(dir, name);
  writeFileSync(path, "#!/bin/sh\ncat >/dev/null\necho 'syntax error' >&2\nexit 1\n");
  chmodSync(path, 0o755);
  return path;
}

function decode(dataUri: string | null): string {
  expect(dataUri).not.toBeNull();
  const payload = dataUri!.split(",")[1];
  expect(payload).toBeDefined();
  return Buffer.from(payload!, "base64").toString("utf8");
}

const configured = fakeD2("configured");
const bundled = fakeD2("bundled");

const realPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = realPath;
});

describe("resolution order", () => {
  it("prefers the configured path over the bundled binary", async () => {
    const engine = new DiagramEngine({ configuredPath: configured, bundledPath: bundled });
    const { dataUri, failure } = await engine.render("a -> b");
    expect(failure).toBeNull();
    expect(decode(dataUri)).toContain('id="configured"');
  });

  it("uses the bundled binary when nothing is configured", async () => {
    const engine = new DiagramEngine({ bundledPath: bundled });
    const { dataUri } = await engine.render("a -> b");
    expect(decode(dataUri)).toContain('id="bundled"');
  });

  it("falls back to PATH when nothing is bundled", async () => {
    // The source checkout this runs in may or may not have a real `d2`, so the
    // fake is put on `PATH` rather than assuming either way.
    fakeD2("d2");
    process.env.PATH = dir;
    const engine = new DiagramEngine({ bundledPath: join(dir, "absent") });
    const { dataUri, failure } = await engine.render("a -> b");
    expect(failure).toBeNull();
    expect(decode(dataUri)).toContain('id="d2"');
  });
});

describe("a configured path that does not work", () => {
  it("is reported rather than silently replaced by the bundled one", async () => {
    const engine = new DiagramEngine({
      configuredPath: join(dir, "not-an-executable"),
      bundledPath: bundled,
    });
    const { dataUri, failure } = await engine.render("a -> b");
    expect(dataUri).toBeNull();
    expect(failure).toContain("hyperMarkdown.diagram.d2Path");
  });

  it("still counts as the renderer when it runs and rejects the diagram", async () => {
    // A d2 that exists and says "syntax error" is the renderer answering, not
    // a missing renderer — the message belongs to the card, not to the setup.
    const engine = new DiagramEngine({ configuredPath: brokenD2("broken"), bundledPath: bundled });
    const { dataUri, failure } = await engine.render("a ->");
    expect(dataUri).toBeNull();
    expect(failure).toContain("syntax error");
  });
});

describe("no renderer at all", () => {
  it("names what it looked for, and does not reach for Docker", async () => {
    process.env.PATH = join(dir, "empty");
    const engine = new DiagramEngine({ configuredPath: null, bundledPath: null });
    const { dataUri, failure } = await engine.render("a -> b");
    expect(dataUri).toBeNull();
    expect(failure).toMatch(/bundled/);
    expect(failure).toMatch(/PATH/);
    // The fallback this issue removed. If it ever comes back, this fails.
    expect(failure).not.toMatch(/docker/i);
  });
});
