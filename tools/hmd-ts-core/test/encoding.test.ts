import { describe, expect, it } from "vitest";

import { decodeCard, firstInvalidByte } from "../src/encoding.js";
import { MemoryHost } from "../src/host.js";
import { check } from "../src/lint.js";
import { Workspace } from "../src/workspace.js";

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

async function build(files: Record<string, string | Uint8Array>): Promise<Workspace> {
  return Workspace.load(MemoryHost.from(files));
}

describe("decoding a card", () => {
  it("accepts well-formed UTF-8 of every length", () => {
    expect(firstInvalidByte(utf8("a é € \u{1F600}"))).toBe(-1);
  });

  it("names the byte where an ill-formed sequence starts", () => {
    expect(firstInvalidByte(join(utf8("# Caf"), bytes(0xe9), utf8("\n")))).toBe(5);
    expect(firstInvalidByte(bytes(0x61, 0xc0, 0x80))).toBe(1); // overlong
    expect(firstInvalidByte(bytes(0xed, 0xa0, 0x80))).toBe(0); // a surrogate
    expect(firstInvalidByte(bytes(0xf4, 0x90, 0x80, 0x80))).toBe(0); // above U+10FFFF
    expect(firstInvalidByte(bytes(0x61, 0x62, 0xe2, 0x82))).toBe(2); // truncated
  });

  it("drops a leading byte-order mark, and counts from the byte after it", () => {
    expect(decodeCard(join(bytes(0xef, 0xbb, 0xbf), utf8("# A\n")))).toEqual({
      ok: true,
      text: "# A\n",
    });
    expect(decodeCard(join(bytes(0xef, 0xbb, 0xbf), utf8("ab"), bytes(0xff)))).toEqual({
      ok: false,
      message: "not valid UTF-8 (byte 2 cannot be decoded), so it is not a card",
    });
  });
});

describe("a byte-order mark", () => {
  it("does not hide the frontmatter after it", async () => {
    const ws = await build({
      "card.hmd": join(bytes(0xef, 0xbb, 0xbf), utf8("---\nuse: [no_autodiscovery]\n---\n# Card\n\n[[deep]]\n")),
      "sub/deep.hmd": "# Deep\n",
    });
    expect(ws.documents.get("card.hmd")!.card.use).toEqual({ autodiscovery: false });
    expect(check(ws).map((d) => [d.rule, d.line, d.column])).toEqual([["HMD001", 6, 1]]);
  });

  it("is dropped from text a host already decoded, too", async () => {
    const ws = await Workspace.load({
      readFile: async () => "\ufeff---\ntags: [a]\n---\n# A\n",
      listDirectory: async (rel) => (rel === "" ? [{ name: "a.hmd", isDirectory: false }] : []),
    });
    expect(ws.documents.get("a.hmd")!.card.tags).toEqual(["a"]);
  });
});

describe("a file that is not UTF-8 (HMD019)", () => {
  const files = {
    "bad.hmd": join(utf8("# Caf"), bytes(0xe9), utf8("\n\n[[good]]\n")),
    "good.hmd": "# Good\n\n[[bad]]\n",
  };

  it("is reported at line 1, column 1, and is not a card", async () => {
    const ws = await build(files);
    expect(ws.pages()).toEqual(["good.hmd"]);
    expect(ws.documents.has("bad.hmd")).toBe(false);
    expect(check(ws).map((d) => [d.rule, d.severity, d.path, d.line, d.column, d.message])).toEqual([
      [
        "HMD019",
        "error",
        "bad.hmd",
        1,
        1,
        "not valid UTF-8 (byte 5 cannot be decoded), so it is not a card",
      ],
      ["HMD001", "warning", "good.hmd", 3, 1, "[[bad]] does not resolve to a page"],
    ]);
  });

  it("is reported when it is named, and only then", async () => {
    const ws = await build(files);
    expect(check(ws, ["good.hmd"]).map((d) => d.rule)).toEqual(["HMD001"]);
    expect(check(ws, ["bad.hmd"]).map((d) => d.rule)).toEqual(["HMD019"]);
  });

  it("stops being reported once the file is a card again", async () => {
    const ws = await build(files);
    const good = ws.documents.get("good.hmd")!;
    ws.addUndecodable("good.hmd", "not valid UTF-8 (byte 0 cannot be decoded), so it is not a card");
    expect(ws.pages()).toEqual([]);
    expect(check(ws, ["good.hmd"]).map((d) => d.rule)).toEqual(["HMD019"]);
    ws.addDocument("good.hmd", good);
    expect(check(ws, ["good.hmd"]).map((d) => d.rule)).toEqual(["HMD001"]);
  });
});

describe("names compare in NFC", () => {
  const decomposed = "Cafe\u0301";
  const composed = "Caf\u00e9";

  it("resolves a composed reference to a decomposed name on disk", async () => {
    const ws = await build({
      [`${decomposed}.hmd`]: "# Menu\n",
      "a.hmd": `[[${composed}]]\n`,
    });
    expect(ws.resolve("a.hmd", composed)).toMatchObject({
      outcome: "resolved",
      path: `${decomposed}.hmd`,
    });
    expect(check(ws)).toEqual([]);
  });

  it("finds an import origin whichever form either side is stored in", async () => {
    const ws = await build({
      [`${decomposed}/menu.hmd`]: "# Menu\n",
      "a.hmd": `---\nimport: from /${composed} import menu\n---\n[[menu]]\n`,
    });
    expect(check(ws)).toEqual([]);
    expect(ws.resolve("a.hmd", "menu").path).toBe(`${decomposed}/menu.hmd`);
  });

  it("keeps only the first of two names that are one name in NFC", async () => {
    const ws = await build({
      [`${composed}.hmd`]: "# One\n",
      [`${decomposed}.hmd`]: "# Two\n",
    });
    expect(ws.pages()).toHaveLength(1);
  });
});
