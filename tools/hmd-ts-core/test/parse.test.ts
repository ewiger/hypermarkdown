import { describe, expect, it } from "vitest";

import { headingContent, parse, parseTarget, visibleText } from "../src/parse.js";
import { caseFold, headingKey } from "../src/unicode.js";

describe("grammar", () => {
  it("parses every part of a full target", () => {
    expect(parseTarget("specs/auth/login#Rotation|the window")).toEqual({
      pageRef: "specs/auth/login",
      fragment: "Rotation",
      fragmentKind: "heading",
      display: "the window",
    });
  });

  it("parses a block reference", () => {
    expect(parseTarget("token#^definition")).toMatchObject({
      pageRef: "token",
      fragment: "definition",
      fragmentKind: "block",
    });
  });

  it("rejects an empty display", () => {
    expect(() => parseTarget("Page|")).toThrow(/empty display text/);
  });

  it("rejects a target that is only a fragment", () => {
    expect(() => parseTarget("#tag")).toThrow(/no page reference/);
  });

  it("rejects a reserved character in a target", () => {
    expect(() => parseTarget("a^b")).toThrow(/reserved character/);
  });

  it("accepts a 64-character block id and rejects 65", () => {
    const ok = "a".repeat(64);
    expect(parseTarget(`p#^${ok}`).fragment).toBe(ok);
    expect(() => parseTarget(`p#^${"a".repeat(65)}`)).toThrow(/invalid block id/);
  });

  it("reads a [[ that begins no link as text", () => {
    for (const text of ["see [[tokens\n", "[[\n", "$[[1,2],[3,4]]$\n"]) {
      const doc = parse("a.hmd", text);
      expect(doc.links).toEqual([]);
      expect(doc.diagnostics).toEqual([]);
    }
  });

  it("reserves ':' in a target", () => {
    expect(() => parseTarget("ns:article")).toThrow(/reserved character ':'/);
  });

  it("refuses a backslash anywhere in a wikilink", () => {
    for (const inner of ["a\\b", "\\a", "a#x\\y", "a#^x\\y", "a|x\\y"]) {
      expect(() => parseTarget(inner), inner).toThrow(/backslash in wikilink/);
    }
  });

  it("never throws on partial input", () => {
    // Every truncation of a card is a state the author types through.
    const source = "---\ntags: [a]\n---\n\n# H\n\nsee [[tokens#^id|x]] and ![[other]]\n";
    for (let i = 0; i <= source.length; i += 1) {
      expect(() => parse("a.hmd", source.slice(0, i))).not.toThrow();
    }
  });
});

describe("frontmatter", () => {
  it("reads the reserved keys", () => {
    const doc = parse(
      "a.hmd",
      "---\ntags: [area/auth]\nuse: [no_autodiscovery]\nimport:\n  - from /shared import tokens as t\n---\n\n# H\n",
    );
    expect(doc.card.tags).toEqual(["area/auth"]);
    expect(doc.card.use).toEqual({ autodiscovery: false });
    expect(doc.card.imports[0]).toMatchObject({ ref: "/shared", wildcard: false });
    expect(doc.diagnostics).toEqual([]);
  });

  it("reports invalid YAML as HMD009", () => {
    const doc = parse("a.hmd", "---\n: :\n---\n\n# H\n");
    expect(doc.diagnostics[0]!.rule).toBe("HMD009");
  });

  it("reports an unknown `use` feature as HMD013", () => {
    const doc = parse("a.hmd", "---\nuse: [no_autodiscovry]\n---\n\n# H\n");
    expect(doc.diagnostics[0]!.rule).toBe("HMD013");
  });

  it("treats an unterminated fence as no frontmatter", () => {
    const doc = parse("a.hmd", "---\ntags: [a]\n\n# H\n");
    expect(doc.frontmatter).toEqual({});
  });
});

describe("heading keys", () => {
  it("folds case and punctuation away and keeps every script", () => {
    expect(headingKey("Ошибка 404!")).toBe("ошибка 404");
    expect(headingKey("Café — Menu")).toBe(headingKey("CAFÉ, menu"));
    expect(headingKey("数据 · 分析")).toBe("数据 分析");
  });

  it("keeps accents significant", () => {
    expect(headingKey("Café")).not.toBe(headingKey("Cafe"));
  });

  it("compares composed and decomposed text alike", () => {
    expect(headingKey("Cafe\u0301")).toBe(headingKey("Caf\u00e9"));
  });

  it("applies full case folding, which toLowerCase is not", () => {
    expect(caseFold("Straße")).toBe("strasse");
    expect(caseFold("\u1e9e")).toBe("ss"); // capital sharp s
    expect(caseFold("ΣΑΣ ς")).toBe("σασ σ"); // final sigma folds to sigma
    expect(caseFold("\ufb03")).toBe("ffi"); // a ligature unfolds
    expect(headingKey("STRASSE")).toBe(headingKey("Straße"));
  });

  it("is empty for a heading with no letters or numbers", () => {
    expect(headingKey("!!! — ???")).toBe("");
  });
});

describe("heading text", () => {
  it("removes inline markup the way a reader sees it", () => {
    expect(visibleText("The *fast* path")).toBe("The fast path");
    expect(visibleText("The `hmd` CLI")).toBe("The hmd CLI");
    expect(visibleText("See [the guide](guide.md) and ![logo](a.png)")).toBe("See the guide and logo");
    expect(visibleText("[[guide#Install|Installing]] or [[guide#Install]]")).toBe("Installing or guide");
    expect(visibleText("a <b>bold</b> <!-- note --> move")).toBe("a bold move");
    expect(visibleText("Fish &amp; chips &#x41;")).toBe("Fish & chips A");
  });

  it("keeps a delimiter that flanks nothing, and an intraword underscore", () => {
    expect(visibleText("2 * 3")).toBe("2 * 3");
    expect(visibleText("snake_case and _emphasis_")).toBe("snake_case and emphasis");
  });

  it("drops the markers, the closing run, and a trailing anchor", () => {
    expect(headingContent("## Setup ##")).toBe("Setup");
    expect(headingContent("## Setup ^setup-linux")).toBe("Setup");
    expect(headingContent("Two\nlines\n----")).toBe("Two\nlines");
  });

  it("reads headings from the original text, not the masked copy", () => {
    const doc = parse("a.hmd", "## The `hmd` CLI\n");
    expect(doc.headings[0]!.text).toBe("The hmd CLI");
    expect(doc.headings[0]!.key).toBe("the hmd cli");
  });
});

describe("setext headings", () => {
  const levels = (text: string) =>
    parse("a.hmd", text).headings.map((h) => [h.level, h.text, h.span.line]);

  it("finds a paragraph over === or --- as a level 1 or 2 heading", () => {
    expect(levels("Guide\n=====\n\nInstall\n-------\n")).toEqual([
      [1, "Guide", 1],
      [2, "Install", 4],
    ]);
  });

  it("joins a multi-line paragraph into one heading", () => {
    expect(levels("Two\nlines\n---\n")).toEqual([[2, "Two lines", 1]]);
  });

  it("reads a --- after a blank line as a thematic break", () => {
    expect(levels("Prose.\n\n---\n")).toEqual([]);
  });

  it("finds no heading inside a fence, a quote, a list, or indented code", () => {
    expect(levels("```\nHidden\n------\n```\n")).toEqual([]);
    expect(levels("> quoted\n---\n")).toEqual([]);
    expect(levels("- item\n---\n")).toEqual([]);
    expect(levels("    code\n---\n")).toEqual([]);
  });

  it("does not take frontmatter for a paragraph", () => {
    expect(levels("---\ntags: [a]\n---\nTitle\n=====\n")).toEqual([[1, "Title", 4]]);
  });
});

describe("anchors", () => {
  it("finds a trailing block anchor", () => {
    const doc = parse("a.hmd", "A token is a bearer credential. ^definition\n");
    expect(doc.anchors.map((a) => a.blockId)).toEqual(["definition"]);
  });

  it("keeps the anchor out of the heading text", () => {
    const doc = parse("a.hmd", "## Rotation ^rot\n");
    expect(doc.headings[0]!.text).toBe("Rotation");
  });
});
