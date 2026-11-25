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

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

describe("a renderer that exits without reading stdin", () => {
  it("reports the failure instead of crashing on EPIPE", async () => {
    // Writing to the stdin of a process that has already gone raises EPIPE on
    // the stream, not on the promise. Unhandled, that ends the extension host.
    const path = join(dir, "deaf");
    writeFileSync(path, "#!/bin/sh\necho 'not today' >&2\nexit 2\n");
    chmodSync(path, 0o755);

    const engine = new DiagramEngine({ configuredPath: path });
    // Large enough that the write cannot fit in the pipe buffer and complete
    // before the child is gone, which is what makes the EPIPE reliable.
    const { dataUri, failure } = await engine.render("a -> b\n".repeat(20_000));
    expect(dataUri).toBeNull();
    expect(failure).not.toBeNull();
  });
});

describe("the Mermaid renderer", () => {
  /** A stand-in for `merman-cli`: an SVG that names itself and its arguments. */
  function fakeMerman(name: string): string {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\ncat >/dev/null\nprintf '<svg id="${name}" data-args="%s"/>' "$*"\n`);
    chmodSync(path, 0o755);
    return path;
  }

  it("draws a Mermaid diagram with its own binary, not with d2", async () => {
    const engine = new DiagramEngine({
      bundledPath: bundled,
      mermaid: { bundledPath: fakeMerman("merman-bundled") },
    });
    const mermaid = await engine.render("flowchart LR\n  a --> b\n", "mermaid");
    expect(mermaid.failure).toBeNull();
    expect(decode(mermaid.dataUri)).toContain('id="merman-bundled"');
    expect(decode((await engine.render("a -> b", "d2")).dataUri)).toContain('id="bundled"');
  });

  it("reads stdin, asks for SVG text labels, and bounds the render", async () => {
    const engine = new DiagramEngine({ mermaid: { configuredPath: fakeMerman("merman-args") } });
    const svg = decode((await engine.render("flowchart LR\n  a --> b\n", "mermaid")).dataUri);
    expect(svg).toContain("render - --format svg");
    // HTML labels in `foreignObject` do not show inside an `<img>`.
    expect(svg).toContain("--svg-pipeline resvg-safe");
    expect(svg).toContain("--resource-profile constrained");
    expect(svg).toContain("--operation-timeout-ms 2000");
  });

  it("prefers the configured path, then the bundled binary, then PATH", async () => {
    const both = new DiagramEngine({
      mermaid: { configuredPath: fakeMerman("merman-configured"), bundledPath: fakeMerman("merman-b") },
    });
    expect(decode((await both.render("x", "mermaid")).dataUri)).toContain('id="merman-configured"');

    fakeMerman("merman-cli");
    process.env.PATH = `${dir}:/bin:/usr/bin`;
    const onPath = new DiagramEngine({ mermaid: { bundledPath: null } });
    expect(decode((await onPath.render("x", "mermaid")).dataUri)).toContain('id="merman-cli"');
  });

  it("keeps the two languages apart in the cache", async () => {
    const engine = new DiagramEngine({
      bundledPath: bundled,
      mermaid: { bundledPath: fakeMerman("merman-cache") },
    });
    const source = "a --> b";
    expect(decode((await engine.render(source, "d2")).dataUri)).toContain('id="bundled"');
    expect(decode((await engine.render(source, "mermaid")).dataUri)).toContain('id="merman-cache"');
    expect(decode((await engine.render(source, "d2")).dataUri)).toContain('id="bundled"');
  });

  it("reports a configured path that is not an executable, by its setting", async () => {
    const engine = new DiagramEngine({
      mermaid: { configuredPath: join(dir, "no-merman"), bundledPath: fakeMerman("merman-unused") },
    });
    const { dataUri, failure } = await engine.render("x", "mermaid");
    expect(dataUri).toBeNull();
    expect(failure).toContain("hyperMarkdown.diagram.mermaidPath");
  });

  it("says which program is missing when there is none", async () => {
    process.env.PATH = join(dir, "empty");
    const engine = new DiagramEngine({ bundledPath: bundled });
    const { dataUri, failure } = await engine.render("x", "mermaid");
    expect(dataUri).toBeNull();
    expect(failure).toContain("merman-cli");
    expect(failure).toMatch(/PATH/);
    // A missing Mermaid renderer does not take D2 down with it.
    process.env.PATH = realPath;
    expect((await engine.render("a -> b", "d2")).failure).toBeNull();
  });

  it("refuses a source over the size bound without starting a renderer", async () => {
    const engine = new DiagramEngine({ mermaid: { configuredPath: join(dir, "never-run") } });
    const { dataUri, failure } = await engine.render("x".repeat(64 * 1024 + 1), "mermaid");
    expect(dataUri).toBeNull();
    expect(failure).toContain("64 KiB");
  });
});

describe("Show", () => {
  it("answers a repeated failure from the cache, and tries again when asked", async () => {
    // Fails its first two runs and draws from then on: a renderer that timed
    // out under load. Two, because finding the renderer is a run of its own.
    const runs = join(dir, "flaky-runs");
    const flaky = join(dir, "flaky");
    writeFileSync(
      flaky,
      `#!/bin/sh\ncat >/dev/null\necho run >> '${runs}'\nif [ "$(wc -l < '${runs}')" -gt 2 ]; then printf '<svg id="second"/>'; else echo 'first time' >&2; exit 1; fi\n`,
    );
    chmodSync(flaky, 0o755);

    const engine = new DiagramEngine({ mermaid: { configuredPath: flaky } });
    expect((await engine.render("x", "mermaid")).failure).toContain("first time");
    // Answered from the cache: the renderer would have drawn it this time.
    expect((await engine.render("x", "mermaid")).failure).toContain("first time");
    const retried = await engine.render("x", "mermaid", { retry: true });
    expect(decode(retried.dataUri)).toContain('id="second"');
  });

  it("looks again for a renderer that was missing", async () => {
    const engine = new DiagramEngine({ mermaid: { bundledPath: null } });
    process.env.PATH = join(dir, "empty");
    expect((await engine.render("x", "mermaid")).failure).toContain("merman-cli");

    const bin = join(dir, "late");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "merman-cli"), `#!/bin/sh\ncat >/dev/null\nprintf '<svg id="late"/>'\n`);
    chmodSync(join(bin, "merman-cli"), 0o755);
    process.env.PATH = `${bin}:/bin:/usr/bin`;
    expect((await engine.render("x", "mermaid")).failure).toContain("merman-cli");
    expect(decode((await engine.render("x", "mermaid", { retry: true })).dataUri)).toContain('id="late"');
  });
});

/**
 * The real renderer, when `MERMAN_BIN` names one. The fakes above cannot say
 * whether the flags this engine passes are flags `merman-cli` accepts, or
 * whether what comes back survives being shown as an image.
 */
const MERMAN_BIN = process.env["MERMAN_BIN"];

describe.skipIf(MERMAN_BIN === undefined)("against the real merman-cli", () => {
  const real = (): DiagramEngine => new DiagramEngine({ mermaid: { configuredPath: MERMAN_BIN! } });

  it("draws a flowchart whose labels are SVG text, with nothing that runs", async () => {
    const { dataUri, failure } = await real().render(
      "flowchart TD\n  A[Card on disk] -->|parse| B{Has cells?}\n",
      "mermaid",
    );
    expect(failure).toBeNull();
    const svg = decode(dataUri);
    expect(svg.startsWith("<svg")).toBe(true);
    // An `<img>` shows neither of these: the label would be a blank box.
    expect(svg).not.toContain("<foreignObject");
    expect(svg).not.toContain("<script");
    expect(svg).toMatch(/<text[^>]*>Card on disk<\/text>/);
    expect(svg).toMatch(/<text[^>]*>parse<\/text>/);
  });

  it("draws the same bytes for the same source", async () => {
    const source = "sequenceDiagram\n  A->>B: hello\n";
    const first = await real().render(source, "mermaid");
    const second = await real().render(source, "mermaid");
    expect(first.dataUri).not.toBeNull();
    expect(second.dataUri).toBe(first.dataUri);
  });

  it("reports a syntax error as the reason, in one line", async () => {
    const { dataUri, failure } = await real().render("flowchart TD\n  A --> --> [\n", "mermaid");
    expect(dataUri).toBeNull();
    expect(failure).toContain("parse error");
    expect(failure!.split("\n")).toHaveLength(1);
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
