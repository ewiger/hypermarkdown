/**
 * Addresses in the editor (HMD-0006): targets, quotations, completion, anchors.
 */

import { describe, expect, it } from "vitest";

import { parse } from "@hypermarkdown/core";

import {
  anchorSuggestion,
  fragmentInProgress,
  linkAt,
  quoteOf,
  suggest,
  targetOf,
} from "../src/addressing.js";

const TOKENS = `---
tags: [demo]
---

# Tokens

## The limit

A token has a limit. It expires after one hour! ^limit

Second paragraph here.

\`\`\`python
x = 1
\`\`\`

### Setup

Nested.
`;

const tokens = parse("tokens.hmd", TOKENS);
const reader = parse(
  "reader.hmd",
  "[[tokens#^limit/Sentence2]] [[tokens#the-limit]] [[tokens#nope/Para1]] [[nowhere]]\n",
);
const resolve = (ref: string): string | null => (ref === "tokens" ? "tokens.hmd" : null);
const lookup = (path: string) => (path === "tokens.hmd" ? tokens : undefined);

function link(index: number) {
  return reader.links[index]!;
}

describe("targets", () => {
  it("finds the link under the cursor", () => {
    expect(linkAt(reader, 3)?.raw).toBe("[[tokens#^limit/Sentence2]]");
    expect(linkAt(reader, 27)?.raw).toBe("[[tokens#^limit/Sentence2]]");
    expect(linkAt(reader, 28)?.raw).toBe("[[tokens#the-limit]]");
    expect(linkAt(parse("a.hmd", "plain text\n"), 3)).toBeNull();
  });

  it("lands on a passage, a heading, or the card's top", () => {
    const passage = targetOf(link(0), resolve, lookup)!;
    expect(TOKENS.slice(passage.start, passage.end)).toBe("It expires after one hour!");
    expect(passage.passage).toBe(true);
    const heading = targetOf(link(1), resolve, lookup)!;
    expect(TOKENS.slice(heading.start, heading.start + 13)).toBe("## The limit\n");
    expect(heading.passage).toBe(false);
    expect(targetOf(link(2), resolve, lookup)).toMatchObject({ start: 0, found: false });
    expect(targetOf(link(3), resolve, lookup)).toBeNull();
  });

  it("quotes only an address", () => {
    expect(quoteOf(link(0), resolve, lookup)).toBe("It expires after one hour!");
    expect(quoteOf(link(1), resolve, lookup)).toBeNull();
  });
});

describe("completion", () => {
  it("reads the fragment being typed", () => {
    expect(fragmentInProgress("see [[tokens#the-limit/Pa")).toEqual({
      pageRef: "tokens",
      done: "the-limit",
      partial: "Pa",
    });
    expect(fragmentInProgress("see [[tokens")).toBeNull();
    expect(fragmentInProgress("see [[tokens#x]] and")).toBeNull();
  });

  it("offers headings, anchors and units at each depth", () => {
    const top = suggest(tokens, "").map((s) => s.label);
    expect(top).toEqual(expect.arrayContaining(["tokens", "the-limit", "setup", "^limit", "Para1", "Code1", "Block1", "Line1"]));
    expect(top).not.toContain("Table1");
    const inSection = suggest(tokens, "the-limit").map((s) => s.label);
    expect(inSection).toEqual(expect.arrayContaining(["setup", "^limit", "Para1"]));
    expect(inSection).not.toContain("the-limit");
    expect(suggest(tokens, "^limit").map((s) => s.label)).toEqual(["Sentence1", "Word1", "Line1"]);
    expect(suggest(tokens, "the-limit/Code1").map((s) => s.label)).toEqual(["Line1"]);
    expect(suggest(tokens, "^limit/Sentence1").map((s) => s.label)).toEqual(["Word1"]);
    expect(suggest(tokens, "^limit/Word1")).toEqual([]);
  });

  it("does not read frontmatter as blocks", () => {
    const detail = suggest(tokens, "").find((s) => s.label === "Para1")!.detail;
    expect(detail).toBe("3 here, Para1 to Para3");
  });
});

describe("anchoring", () => {
  it("offers an id from the block's first words, at the end of its last line", () => {
    const offset = TOKENS.indexOf("Second paragraph");
    const offer = anchorSuggestion(tokens, offset)!;
    expect(offer.id).toBe("second-paragraph-here");
    expect(TOKENS.slice(0, offer.at).endsWith("Second paragraph here.")).toBe(true);
  });

  it("declines a block that is anchored already, or cannot carry one", () => {
    expect(anchorSuggestion(tokens, TOKENS.indexOf("A token"))).toBeNull();
    expect(anchorSuggestion(tokens, TOKENS.indexOf("x = 1"))).toBeNull();
  });
});
