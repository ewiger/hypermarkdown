/**
 * HQL cells (HMD-0026). Every hash below was produced by `hql 0.4.2`, so these
 * tests pin agreement with HQL rather than with this implementation's reading
 * of it.
 */

import { describe, expect, it } from "vitest";

import { MemoryHost, Renderer, Workspace } from "../src/index.js";
import {
  cellReads,
  maskForHql,
  outputEdit,
  scanCells,
  type CellBlock,
} from "../src/index.js";

const READING_LIST = `# The club's reading list

\`\`\`hql#eval id=books hidden
cards | filter(c => c.metadata.category == "book")
\`\`\`

## Still to read

\`\`\`hql#eval id=todo
books
| filter(c => c.metadata.status == "todo")
| sort(by = c => c.title)
| map(c => c.title)
\`\`\`

## How far along

\`\`\`hql#query
{books: books | size, to_read: todo | size}
\`\`\`
`;

describe("which fences are cells", () => {
  it("runs hql#eval and hql#query, and shows a bare hql fence as code", () => {
    const text = "```hql\ncards | size\n```\n\n```hql#eval\n1\n```\n\n```hql#query\n2\n```\n";
    const { cells } = scanCells(text);
    expect(cells.map((c) => c.kind)).toEqual(["hql#eval", "hql#query"]);
    expect(cells.map((c) => c.index)).toEqual([0, 1]);
  });

  it("treats hql#query as hql#eval hidden", () => {
    const { cells } = scanCells("```hql#query id=q\n1\n```\n\n```hql#eval id=e\n1\n```\n");
    expect(cells.map((c) => [c.id, c.hidden])).toEqual([
      ["q", true],
      ["e", false],
    ]);
  });

  it("reads id and hidden from the info string", () => {
    const [books] = scanCells(READING_LIST).cells;
    expect(books!.id).toBe("books");
    expect(books!.hidden).toBe(true);
  });

  it("closes a fence on the next backtick line, whatever its info string", () => {
    const text = "```hql#eval\n1\n```python\n```hql#eval\n2\n```\n";
    // HQL's rule, not CommonMark's: the `python` line closes the first cell.
    const { cells } = scanCells(text);
    expect(cells.map((c) => c.source)).toEqual(["1", "2"]);
  });
});

describe("hashes agree with HQL", () => {
  it("hashes a cell that reads nothing", () => {
    const { cells } = scanCells("```hql#eval\n[1,2] | map(x => x * 2)\n```\n");
    expect(cells[0]!.hash).toBe("dcba52b6c100");
  });

  it("folds the hashes of the cells it reads into a cell's hash", () => {
    const { cells } = scanCells(READING_LIST);
    expect(cells.map((c) => c.hash)).toEqual(["544cfa725aa3", "9c9f41e99b94", "a9f86aea53d2"]);
  });

  it("ignores trailing whitespace and trailing blank lines", () => {
    const a = scanCells("```hql#eval\n[1,2] | map(x => x * 2)   \n\n\n```\n").cells[0]!;
    expect(a.hash).toBe("dcba52b6c100");
  });
});

describe("what a cell reads", () => {
  const ids = new Map([
    ["books", 0],
    ["todo", 1],
  ]);

  it("reads a name that is another cell's id", () => {
    expect(cellReads("books | size", ids, 2)).toEqual([0]);
  });

  it("does not read a field, a string, a comment, or its own id", () => {
    expect(cellReads('c.books | x("todo") // todo', ids, 2)).toEqual([]);
    expect(cellReads("todo", ids, 1)).toEqual([]);
  });

  it("does not read a name it binds at the start of a line", () => {
    expect(cellReads("books = [1]\nbooks | size", ids, 2)).toEqual([]);
  });

  it("reads a name passed as a named argument's value, not its key", () => {
    expect(cellReads("x | take(todo = books)", ids, 2)).toEqual([0]);
  });

  it("finds nothing in source that does not lex", () => {
    expect(cellReads("books @ todo", ids, 2)).toEqual([]);
  });
});

describe("saved outputs", () => {
  it("attaches an output across blank lines", () => {
    const text = "```hql#eval\n1\n```\n\n<!-- hql:output hash=abc status=ok -->\n- 1\n<!-- /hql:output -->\n";
    const [cell] = scanCells(text).cells;
    expect(cell!.output).toMatchObject({ hash: "abc", status: "ok", body: "- 1" });
  });

  it("does not attach an output that names another cell", () => {
    const text =
      "```hql#eval id=a\n1\n```\n<!-- hql:output id=b hash=abc status=ok -->\n- 1\n<!-- /hql:output -->\n";
    const scan = scanCells(text);
    expect(scan.cells[0]!.output).toBeNull();
    expect(scan.orphans).toHaveLength(1);
  });

  it("writes an output exactly where and how hql render does", () => {
    // `hql render --emit after` on this input wrote exactly `expected`.
    const text = "```hql#eval\n[1,2] | map(x => x * 2)\n```\n\n\n<!-- hql:output hash=000000000000 status=ok -->\nold\n<!-- /hql:output -->\n";
    const expected = "```hql#eval\n[1,2] | map(x => x * 2)\n```\n<!-- hql:output hash=dcba52b6c100 status=ok -->\n- 2\n- 4\n<!-- /hql:output -->\n";
    const [cell] = scanCells(text).cells;
    const edit = outputEdit(text, cell!, { status: "ok", hash: "dcba52b6c100", markdown: "- 2\n- 4" });
    expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(expected);
  });

  it("inserts an output after a cell that has none, keeping what follows", () => {
    const text = "```hql#eval id=x\n1\n```\nafter\n";
    const [cell] = scanCells(text).cells;
    const edit = outputEdit(text, cell!, { status: "error", hash: "h", markdown: "error: no" });
    expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(
      "```hql#eval id=x\n1\n```\n<!-- hql:output id=x hash=h status=error -->\nerror: no\n<!-- /hql:output -->\nafter\n",
    );
  });

  it("writes after a closing fence on an unterminated last line", () => {
    const text = "```hql#eval\n1\n```";
    const [cell] = scanCells(text).cells;
    const edit = outputEdit(text, cell!, { status: "ok", hash: "h", markdown: "1" });
    expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(
      "```hql#eval\n1\n```\n<!-- hql:output hash=h status=ok -->\n1\n<!-- /hql:output -->",
    );
  });

  it("keeps no output for a query cell that ran, and keeps its error", () => {
    const text = "```hql#query id=q\n1\n```\n<!-- hql:output id=q hash=h status=ok -->\n1\n<!-- /hql:output -->\n";
    const [cell] = scanCells(text).cells;
    const ok = outputEdit(text, cell!, { status: "ok", hash: "h", markdown: "1" });
    expect(text.slice(0, ok.start) + ok.text + text.slice(ok.end)).toBe("```hql#query id=q\n1\n```\n");
    const failed = outputEdit(text, cell!, { status: "error", hash: "h", markdown: "error: x" });
    expect(text.slice(0, failed.start) + failed.text + text.slice(failed.end)).toContain("status=error -->\nerror: x\n");
  });

  it("keeps no output for a hidden cell that ran", () => {
    const text = "```hql#eval id=x hidden\n1\n```\n<!-- hql:output id=x hash=h status=ok -->\n1\n<!-- /hql:output -->\nafter\n";
    const [cell] = scanCells(text).cells;
    const edit = outputEdit(text, cell!, { status: "ok", hash: "h", markdown: "1" });
    expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(
      "```hql#eval id=x hidden\n1\n```\nafter\n",
    );
  });
});

describe("masking for HQL", () => {
  it("renames a bare hql fence without moving a byte", () => {
    const text = "```hql id=x\n1\n```\n\n```hql#eval\nx\n```\n";
    const masked = maskForHql(text);
    expect(masked).toBe("```txt id=x\n1\n```\n\n```hql#eval\nx\n```\n");
    expect(masked.length).toBe(text.length);
  });

  it("leaves a closing fence alone even when it reads hql", () => {
    expect(maskForHql("```hql#eval\n1\n```hql\n")).toBe("```hql#eval\n1\n```hql\n");
  });

  it("marks a query cell hidden, once, keeping its line ending", () => {
    expect(maskForHql("```hql#query id=q\r\n1\n```\n")).toBe("```hql#query id=q hidden\r\n1\n```\n");
    expect(maskForHql("```hql#query hidden\n1\n```\n")).toBe("```hql#query hidden\n1\n```\n");
  });

  it("changes no hash", () => {
    const text = "```hql#query id=q\n[1]\n```\n\n```hql\nq\n```\n\n```hql#eval\nq | size\n```\n";
    expect(scanCells(maskForHql(text)).cells.map((c) => c.hash)).toEqual(
      scanCells(text).cells.map((c) => c.hash),
    );
  });
});

describe("the IR", () => {
  async function render(text: string): Promise<CellBlock[]> {
    const host = MemoryHost.from({ "toc.hmd": text, "dune.hmd": "# Dune\n" });
    const ws = await Workspace.load(host, { root: "" });
    const ir = new Renderer(ws).render("toc.hmd")!;
    return ir.blocks.filter((b): b is CellBlock => b.kind === "cell");
  }

  it("draws a cell and its output, and not the markers", async () => {
    const text =
      "# Contents\n\n```hql#eval id=toc\ncards\n```\n<!-- hql:output id=toc hash=x status=ok -->\n- [[dune]]\n<!-- /hql:output -->\n";
    const [cell] = await render(text);
    expect(cell).toMatchObject({ id: "toc", language: "hql#eval", source: "cards", index: 0 });
    expect(cell!.output!.current).toBe(false);
    const html = cell!.output!.blocks.map((b) => (b.kind === "html" ? b.html : "")).join("");
    // The output's wikilink resolves like any other link in the card.
    expect(html).toContain('data-hmd-path="dune.hmd"');
    expect(html).not.toContain("hql:output");
  });

  it("calls an output current when its hash is the cell's", async () => {
    const text = "```hql#eval\n[1,2] | map(x => x * 2)\n```\n<!-- hql:output hash=dcba52b6c100 status=ok -->\n- 2\n<!-- /hql:output -->\n";
    const [cell] = await render(text);
    expect(cell!.output!.current).toBe(true);
  });

  it("keys a cell by name, so a new output keeps its element", async () => {
    const a = await render("```hql#eval id=t\n1\n```\n");
    const b = await render("```hql#eval id=t\n1\n```\n<!-- hql:output id=t hash=h status=ok -->\n1\n<!-- /hql:output -->\n");
    expect(a[0]!.key).toBe(b[0]!.key);
  });

  it("leaves a bare hql fence as an ordinary code block", async () => {
    expect(await render("```hql\ncards\n```\n")).toEqual([]);
  });
});
