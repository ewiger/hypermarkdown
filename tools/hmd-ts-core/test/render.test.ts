import { describe, expect, it } from "vitest";

import { MemoryHost } from "../src/host.js";
import { IR_VERSION, type Block, type DocumentIR, type EmbedBlock } from "../src/ir.js";
import { Renderer } from "../src/render.js";
import { Workspace } from "../src/workspace.js";

async function render(
  files: Record<string, string>,
  path: string,
): Promise<DocumentIR> {
  const workspace = await Workspace.load(MemoryHost.from(files), {
    autodiscovery: true,
    mode: "both",
    source: null,
  });
  const ir = new Renderer(workspace).render(path);
  if (ir === null) throw new Error(`no such card: ${path}`);
  return ir;
}

function html(ir: DocumentIR): string {
  return ir.blocks
    .filter((b): b is Extract<Block, { kind: "html" }> => b.kind === "html")
    .map((b) => b.html)
    .join("");
}

function embeds(ir: DocumentIR): EmbedBlock[] {
  return ir.blocks.filter((b): b is EmbedBlock => b.kind === "embed");
}

describe("inline constructs", () => {
  it("renders a resolved link with its pinned attributes", async () => {
    const ir = await render(
      { "tokens.hmd": "# Tokens\n", "a.hmd": "see [[tokens]]\n" },
      "a.hmd",
    );
    expect(html(ir)).toContain('class="hmd-link"');
    expect(html(ir)).toContain('data-hmd-path="tokens.hmd"');
    expect(html(ir)).toContain(">tokens</a>");
  });

  it("renders an unresolved link as a red link", async () => {
    const ir = await render({ "a.hmd": "see [[nope]]\n" }, "a.hmd");
    expect(html(ir)).toContain("hmd-redlink");
    expect(html(ir)).toContain('data-hmd-target="nope"');
  });

  it("renders an ambiguous link distinctly, with its candidates", async () => {
    const ir = await render(
      { "x/t.hmd": "# T\n", "y/t.hmd": "# T\n", "a.hmd": "see [[t]]\n" },
      "a.hmd",
    );
    expect(html(ir)).toContain("hmd-ambiguous");
    expect(html(ir)).toContain('data-hmd-candidates="x/t.hmd,y/t.hmd"');
  });

  it("uses the display text when one is given", async () => {
    const ir = await render(
      { "tokens.hmd": "# Tokens\n", "a.hmd": "see [[tokens|the tokens card]]\n" },
      "a.hmd",
    );
    expect(html(ir)).toContain(">the tokens card</a>");
  });

  it("escapes display text rather than trusting it", async () => {
    const ir = await render(
      { "tokens.hmd": "# T\n", "a.hmd": "see [[tokens|<img src=x onerror=alert(1)>]]\n" },
      "a.hmd",
    );
    expect(html(ir)).not.toContain("<img");
    expect(html(ir)).toContain("&lt;img");
  });

  it("escapes raw HTML in the body", async () => {
    const ir = await render({ "a.hmd": "<script>alert(1)</script>\n" }, "a.hmd");
    expect(html(ir)).not.toContain("<script>");
  });

  it("leaves a malformed link as literal text", async () => {
    const ir = await render({ "a.hmd": "see [[Page|]] here\n" }, "a.hmd");
    expect(html(ir)).toContain("[[Page|]]");
  });

  it("strips a trailing block anchor from the rendered output", async () => {
    const ir = await render({ "a.hmd": "A definition. ^definition\n" }, "a.hmd");
    expect(html(ir)).not.toContain("^definition");
    expect(html(ir)).toContain("A definition.");
  });
});

describe("data-line", () => {
  it("stamps every block element with its source line", async () => {
    const ir = await render({ "a.hmd": "# One\n\npara\n\n## Two\n" }, "a.hmd");
    const lines = [...html(ir).matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));
    expect(lines).toContain(1);
    expect(lines).toContain(3);
    expect(lines).toContain(5);
  });

  it("never renders a block anchor, and leaves one in code alone", async () => {
    const ir = await render(
      { "a.hmd": "# A ^top\n\nprose ^p\n\n```markdown\ncode ^kept\n```\n" },
      "a.hmd",
    );
    expect(html(ir)).not.toContain("^top");
    expect(html(ir)).not.toContain("^p<");
    expect(html(ir)).toContain("prose");
    expect(html(ir)).toContain("code ^kept");
  });

  it("places a link after an astral character on its own line", async () => {
    const ir = await render(
      { "tokens.hmd": "# Tokens\n", "a.hmd": "\u{1F600} see [[tokens]] now\n" },
      "a.hmd",
    );
    expect(html(ir)).toContain("\u{1F600} see <a");
    expect(html(ir)).toContain("</a> now");
  });

  it("keeps line numbers correct below frontmatter", async () => {
    const ir = await render({ "a.hmd": "---\ntags: [x]\n---\n\n# Heading\n" }, "a.hmd");
    expect(html(ir)).toContain('data-line="5"');
  });
});

describe("embeds", () => {
  const tree = {
    "token.hmd": "# Token\n\nA bearer credential. ^definition\n\n## Rotation\n\nEvery 90 days.\n\n## Other\n\nElsewhere.\n",
    "a.hmd": "intro\n\n![[token]]\n\noutro\n",
  };

  it("renders a block-level embed as its own node, not as inline text", async () => {
    const ir = await render(tree, "a.hmd");
    expect(embeds(ir)).toHaveLength(1);
    expect(embeds(ir)[0]).toMatchObject({
      kind: "embed",
      depth: 0,
      resolution: { state: "resolved", path: "token.hmd" },
    });
  });

  it("carries the expanded child document", async () => {
    const child = embeds(await render(tree, "a.hmd"))[0]!.document!;
    expect(child.path).toBe("token.hmd");
    expect(child.blocks.length).toBeGreaterThan(0);
  });

  it("expands a section embed up to the next same-or-higher heading", async () => {
    const ir = await render(
      { ...tree, "a.hmd": "![[token#Rotation]]\n" },
      "a.hmd",
    );
    const child = embeds(ir)[0]!.document!;
    const text = child.blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    expect(text).toContain("Every 90 days");
    expect(text).not.toContain("Elsewhere");
  });

  it("expands a block embed and drops the anchor marker", async () => {
    const ir = await render({ ...tree, "a.hmd": "![[token#^definition]]\n" }, "a.hmd");
    const child = embeds(ir)[0]!.document!;
    const text = child.blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    expect(text).toContain("A bearer credential.");
    expect(text).not.toContain("^definition");
  });

  it("embeds a heading's whole section through an anchor on its line", async () => {
    const files = {
      "a.hmd": "# A\n\n![[b#^linux]]\n\n![[b#Linux]]\n",
      "b.hmd": "# B\n\n## Linux ^linux\n\nkeep\n\n### Deeper\n\nalso keep\n\n## macOS\n\ndrop\n",
    };
    const [byAnchor, byHeading] = embeds(await render(files, "a.hmd")).map((e) => html(e.document!));
    expect(byAnchor).toBe(byHeading);
    expect(byAnchor).toContain("also keep");
    expect(byAnchor).not.toContain("drop");
    expect(byAnchor).not.toContain("^linux");
  });

  it("ends a section at a setext heading of the same level", async () => {
    const files = {
      "a.hmd": "![[b#Install]]\n",
      "b.hmd": "Guide\n=====\n\nInstall\n-------\n\nRun it.\n\nUse\n---\n\nLater.\n",
    };
    const child = html(embeds(await render(files, "a.hmd"))[0]!.document!);
    expect(child).toContain("Run it.");
    expect(child).not.toContain("Later.");
  });

  it("renders an unresolved embed as a failure card, never as nothing", async () => {
    const ir = await render({ "a.hmd": "![[nope]]\n" }, "a.hmd");
    const [embed] = embeds(ir);
    expect(embed!.document).toBeNull();
    expect(embed!.failure).toMatch(/HMD001/);
  });

  it("stops an embed cycle instead of recursing", async () => {
    const ir = await render({ "a.hmd": "![[b]]\n", "b.hmd": "![[a]]\n" }, "a.hmd");
    const child = embeds(ir)[0]!.document!;
    const inner = child.blocks.find((b): b is EmbedBlock => b.kind === "embed")!;
    expect(inner.failure).toMatch(/cycle/);
  });

  it("stops at the depth limit", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 24; i += 1) files[`c${i}.hmd`] = `![[c${i + 1}]]\n`;
    files["c24.hmd"] = "bottom\n";
    const ir = await render(files, "c0.hmd");

    let depth = 0;
    let node: DocumentIR | null = ir;
    let failure: string | null = null;
    while (node) {
      const embed: EmbedBlock | undefined = node.blocks.find(
        (b): b is EmbedBlock => b.kind === "embed",
      );
      if (embed === undefined) break;
      failure = embed.failure;
      node = embed.document;
      if (embed.document !== null) depth += 1;
    }
    // The entry card is depth zero: sixteen nested embeds expand, and the
    // seventeenth, which would exceed the limit, fails in place.
    expect(depth).toBe(16);
    expect(failure).toMatch(/depth/);
  });

  it("keeps an inline embed inline rather than promoting it to a card", async () => {
    const ir = await render({ ...tree, "a.hmd": "before ![[token]] after\n" }, "a.hmd");
    expect(embeds(ir)).toHaveLength(0);
    expect(html(ir)).toContain("hmd-embed-inline");
  });
});

describe("block keys", () => {
  it("declares the IR version", async () => {
    const ir = await render({ "a.hmd": "# H\n" }, "a.hmd");
    expect(ir.irVersion).toBe(IR_VERSION);
  });

  it("keeps an untouched block's key stable across an edit elsewhere", async () => {
    const before = await render({ "a.hmd": "# One\n\nstable paragraph\n" }, "a.hmd");
    const after = await render({ "a.hmd": "# One changed\n\nstable paragraph\n" }, "a.hmd");
    const keyOf = (ir: DocumentIR, needle: string): string =>
      ir.blocks.find((b) => b.kind === "html" && b.html.includes(needle))!.key;
    expect(keyOf(after, "stable paragraph")).toBe(keyOf(before, "stable paragraph"));
  });

  it("gives identical sibling blocks distinct keys", async () => {
    const ir = await render({ "a.hmd": "same\n\n![[x]]\n\nsame\n" }, "a.hmd");
    const keys = ir.blocks.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("determinism", () => {
  it("renders the same card identically twice", async () => {
    const files = { "t.hmd": "# T\n\nbody ^b\n", "a.hmd": "x [[t]]\n\n![[t#^b]]\n" };
    const first = await render(files, "a.hmd");
    const second = await render(files, "a.hmd");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
