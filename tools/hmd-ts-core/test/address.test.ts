import { describe, expect, it } from "vitest";

import { locateFragment, mintAddress, parseAddress, AddressSyntaxError } from "../src/address.js";
import { MemoryHost } from "../src/host.js";
import { parse } from "../src/parse.js";
import { Renderer } from "../src/render.js";
import { Workspace } from "../src/workspace.js";

const TOKENS = `# Tokens

## The limit

A token has a limit. It expires after one hour! Refresh it before then. ^limit

Second paragraph here.

| a | b |
| - | - |
| 1 | 2 |

\`\`\`python
x = 1
y = 2
\`\`\`

## Other

### Setup

Other setup.
`;

const doc = parse("tokens.hmd", TOKENS);

function select(fragment: string): string {
  const at = locateFragment(doc, fragment);
  if (at === null) throw new Error(`no location for ${fragment}`);
  return TOKENS.slice(at.start, at.end);
}

function mintFor(selected: string, occurrence = 0): string | null {
  let start = -1;
  for (let i = 0; i <= occurrence; i += 1) start = TOKENS.indexOf(selected, start + 1);
  return mintAddress(doc, start, start + selected.length);
}

describe("parsing", () => {
  it("reads steps, ranges, and the digest", () => {
    const address = parseAddress("the-limit/^limit/Sentence2/Word5-Word9@sha256-0123456789abcdef");
    expect(address.steps.map((s) => s.kind)).toEqual(["heading", "anchor", "counted", "counted"]);
    expect(address.steps[3]).toMatchObject({ value: "Word", first: 5, last: 9, isRange: true });
    expect(address.digest).toBe("0123456789abcdef");
  });

  it("refuses what the canonical implementation refuses", () => {
    for (const bad of ["Para3-Para5/Word1", "w1-Word2", "Para0", "a//b", "a/Line3", "Sentence1", "Para1/Para2"]) {
      expect(() => parseAddress(bad), bad).toThrow(AddressSyntaxError);
    }
  });
});

describe("locating", () => {
  it("selects passages and marks them as passages", () => {
    expect(select("^limit/Sentence2")).toBe("It expires after one hour!");
    expect(select("the-limit/Code1/Line2")).toBe("y = 2");
    expect(locateFragment(doc, "^limit")?.passage).toBe(false);
    expect(locateFragment(doc, "the-limit/p2")?.passage).toBe(true);
    expect(locateFragment(doc, "the-limit/Para9")).toBeNull();
  });
});

describe("minting", () => {
  it("roots on an anchor and descends only as far as needed", () => {
    expect(mintFor("It expires after one hour!")).toBe("^limit/Sentence2");
    expect(mintFor("after one")).toBe("^limit/Sentence2/Word3-Word4");
    expect(mintFor("limit. It")).toBe("^limit/Word5-Word6");
  });

  it("roots on the deepest heading otherwise", () => {
    expect(mintFor("Second paragraph here.")).toBe("the-limit/Para2");
    expect(mintFor("paragraph")).toBe("the-limit/Para2/Sentence1/Word2");
    expect(mintFor("y = 2")).toBe("the-limit/Code1/Line2");
    expect(mintFor("Other setup.")).toBe("setup/Para1");
    expect(mintFor("Other")).toBe("other");
  });

  it("names a run of blocks as a range", () => {
    const start = TOKENS.indexOf("Second paragraph");
    const end = TOKENS.indexOf("| 1 | 2 |") + 9;
    expect(mintAddress(doc, start, end)).toBe("the-limit/Block2-Block3");
  });

  it("every minted address lands on its selection", () => {
    for (const selected of ["token", "hour!", "| a | b |", "x = 1", "Second", "Other"]) {
      const minted = mintFor(selected);
      expect(minted, selected).not.toBeNull();
      expect(select(minted!)).toContain(selected);
    }
  });
});

describe("rendering", () => {
  it("quotes an addressed embed and carries the written fragment", async () => {
    const workspace = await Workspace.load(
      MemoryHost.from({ "tokens.hmd": TOKENS, "a.hmd": "# A\n\n![[tokens#^limit/Sentence2]]\n\n[[tokens#the-limit/p2]]\n" }),
      { autodiscovery: true, mode: "both", source: null },
    );
    const ir = new Renderer(workspace).render("a.hmd")!;
    const json = JSON.stringify(ir);
    expect(json).toContain("It expires after one hour!");
    expect(json).not.toContain("Refresh it before then");
    expect(json).toContain('data-hmd-address=\\"the-limit/p2\\"');
  });
});
