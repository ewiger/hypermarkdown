import { describe, expect, it } from "vitest";

import { mask, PositionIndex } from "../src/scan.js";
import { parse } from "../src/parse.js";

function links(text: string): string[] {
  return parse("a.hmd", text).links.map((l) => l.raw);
}

describe("masking", () => {
  it("hides links inside a fenced code block", () => {
    expect(links("```\n[[hidden]]\n```\n")).toEqual([]);
  });

  it("hides links inside a code span", () => {
    expect(links("text `[[hidden]]` more\n")).toEqual([]);
  });

  it("hides links inside an HTML comment", () => {
    expect(links("<!-- [[hidden]] -->\n")).toEqual([]);
  });

  it("does NOT hide a link in an indented block", () => {
    // HMD-0001 §1: under `admonition` and `footnotes` a four-space indent
    // marks a callout body, not code. Masking it would drop real links.
    expect(links("!!! note\n    see [[tokens]]\n")).toEqual(["[[tokens]]"]);
  });

  it("preserves offsets so spans still point at the source", () => {
    const text = "`code` and [[tokens]]\n";
    const masked = mask(text);
    expect(masked).toHaveLength(text.length);
    expect(masked.indexOf("[[tokens]]")).toBe(text.indexOf("[[tokens]]"));
  });

  it("treats an unterminated fence as running to end of file", () => {
    expect(links("```\n[[hidden]]\n")).toEqual([]);
  });

  it("keeps a code span from spanning a blank line", () => {
    expect(links("`open\n\n[[tokens]]`\n")).toEqual(["[[tokens]]"]);
  });
});

describe("PositionIndex", () => {
  it("reports 1-indexed line and column", () => {
    const text = "one\ntwo\nthree";
    const index = new PositionIndex(text);
    expect(index.at(0)).toEqual({ line: 1, column: 1 });
    expect(index.at(4)).toEqual({ line: 2, column: 1 });
    expect(index.at(6)).toEqual({ line: 2, column: 3 });
    expect(index.at(text.length - 1)).toEqual({ line: 3, column: 5 });
  });

  it("agrees with a linear scan on CRLF input", () => {
    const text = "a\r\nb\r\nc";
    const index = new PositionIndex(text);
    expect(index.at(3)).toEqual({ line: 2, column: 1 });
  });
});

describe("spans", () => {
  it("counts columns in code points and offsets in UTF-8 bytes", () => {
    const doc = parse("a.hmd", "# Card\n\n\u{1F600} Ünïcödé — [[missing]]\n");
    const span = doc.links[0]!.span;
    expect([span.line, span.column]).toEqual([3, 13]);
    // 8 bytes of "# Card\n\n", 4 for the emoji, 11 for the word (four of its
    // letters take two), 3 for the dash, and three spaces: byte 29, as the
    // canonical implementation reports it.
    expect([span.start, span.end]).toEqual([29, 40]);
  });

  it("agrees with the code-unit index it slices with", () => {
    const text = "\u{1F600} [[a]]\n";
    const span = parse("a.hmd", text).links[0]!.span;
    expect(text.slice(span.index, span.indexEnd)).toBe("[[a]]");
    expect(span.column).toBe(3);
  });
});

describe("line endings", () => {
  const where = (text: string) =>
    parse("a.hmd", text).links.map((l) => [l.span.line, l.span.column]);

  it("ends a line at \\n, \\r\\n, and a lone \\r", () => {
    expect(where("a\n[[x]]")).toEqual([[2, 1]]);
    expect(where("a\r\n[[x]]")).toEqual([[2, 1]]);
    expect(where("a\r[[x]]")).toEqual([[2, 1]]);
  });

  it("does not end a line at a form feed or U+2028", () => {
    expect(where("a\f[[x]]")).toEqual([[1, 3]]);
    expect(where("a [[x]]")).toEqual([[1, 3]]);
  });

  it("finds a block anchor and a heading on a \\r\\n line", () => {
    const doc = parse("a.hmd", "# Title ^t\r\n\r\nSetup\r\n-----\r\n\r\nprose ^p\r\n");
    expect(doc.anchors.map((a) => a.blockId)).toEqual(["t", "p"]);
    expect(doc.headings.map((h) => [h.level, h.text])).toEqual([
      [1, "Title"],
      [2, "Setup"],
    ]);
  });

  it("closes frontmatter on a \\r\\n fence", () => {
    const doc = parse("a.hmd", "---\r\ntags: [a]\r\n---\r\n# H\r\n");
    expect(doc.card.tags).toEqual(["a"]);
    expect(doc.headings[0]!.span.line).toBe(4);
  });
});
