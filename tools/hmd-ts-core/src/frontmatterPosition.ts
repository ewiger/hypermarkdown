/**
 * Where a frontmatter diagnostic is reported (the specification's frontmatter
 * rules) — a port of `tools/hmd/src/hypermarkdown/frontmatter_position.py`,
 * which the two keep line for line in step.
 *
 * A YAML parser hands back values without their source positions, and every
 * implementation has to put a diagnostic on the same line and column, so the
 * positions are found by reading the block's lines with a rule simple enough to
 * write the same way everywhere:
 *
 * 1. A block that is not valid YAML, or not a mapping, is at line 1, column 1.
 * 2. A malformed value of a top-level key is at that key.
 * 3. A problem inside `nav` is at the offending key inside `nav`.
 * 4. A malformed list entry is at the entry's first character: in a block
 *    list, the first character after `- `; in a flow list, the entry's own
 *    first character, its opening quote included.
 * 5. Anything else is at its nearest enclosing key, and failing that at the
 *    beginning of the block.
 *
 * Lines and columns are the card's: the opening `---` is line 1, so the block's
 * first line is line 2, and a column counts code points from 1.
 */

/** The block's first line, in the card's numbering: line 1 is the `---` fence. */
const FIRST_LINE = 2;

export type Where =
  | { kind: "key"; name: string }
  | { kind: "nested"; parent: string; name: string }
  | { kind: "entry"; parent: string; index: number }
  | null;

export const key = (name: string): Where => ({ kind: "key", name });
export const nested = (parent: string, name: string): Where => ({ kind: "nested", parent, name });
export const entry = (parent: string, index: number): Where => ({ kind: "entry", parent, index });

export type Position = readonly [line: number, column: number];

/** Positions inside one frontmatter block, as (line, column) of the card. */
export class Locator {
  /** Each line as code points, so an index is a column less one. */
  private readonly lines: string[][];

  constructor(raw: string) {
    this.lines = raw.split(/\r\n|\r|\n/).map((line) => [...line]);
  }

  locate(where: Where): Position {
    if (where === null) return [1, 1];
    if (where.kind === "key") return this.key(where.name);
    if (where.kind === "nested") return this.nested(where.parent, where.name);
    return this.entry(where.parent, where.index);
  }

  // -- the three kinds of place --------------------------------------------

  key(name: string): Position {
    const row = this.top(name);
    return row === null ? [1, 1] : [row + FIRST_LINE, 1];
  }

  nested(parent: string, name: string): Position {
    const row = this.top(parent);
    if (row === null) return [1, 1];
    // A flow mapping on the key's own line: `nav: {order: x}`.
    const flow = new RegExp(`^(.*?[{,][ \\t]*)${keyPattern(name)}[ \\t]*:`, "u").exec(this.text(row));
    if (flow) return [row + FIRST_LINE, [...flow[1]!].length + 1];
    const pattern = new RegExp(`^([ \\t]+)${keyPattern(name)}[ \\t]*:`, "u");
    for (const inner of this.block(row)) {
      const m = pattern.exec(this.text(inner));
      if (m) return [inner + FIRST_LINE, [...m[1]!].length + 1];
    }
    return this.key(parent);
  }

  /**
   * The raw text of a nested key's value, as written, or null.
   *
   * A YAML parser reads `1.0` as a number in some implementations and a float
   * in others; the token as written is what tells them apart.
   */
  nestedValue(parent: string, name: string): string | null {
    const row = this.top(parent);
    if (row === null) return null;
    // A flow mapping on the key's own line: `nav: {order: 1.0}`.
    const flow = new RegExp(`[{,][ \\t]*${keyPattern(name)}[ \\t]*:[ \\t]*([^,}]*)`, "u").exec(
      this.text(row),
    );
    if (flow) return flow[1]!.replace(/^[ \t]+|[ \t]+$/gu, "");
    const pattern = new RegExp(`^[ \\t]+${keyPattern(name)}[ \\t]*:(.*)$`, "u");
    for (const inner of this.block(row)) {
      const m = pattern.exec(this.text(inner));
      if (m) return m[1]!.replace(/(?:^|[ \t])#.*$/u, "").replace(/^[ \t]+|[ \t]+$/gu, "");
    }
    return null;
  }

  entry(parent: string, index: number): Position {
    const row = this.top(parent);
    if (row === null) return [1, 1];
    const line = this.lines[row]!;
    const after = [...topKeyRe(parent).exec(this.text(row))![0]].length;
    const rest = line.slice(after);
    let skip = 0;
    while (skip < rest.length && (rest[skip] === " " || rest[skip] === "\t")) skip += 1;
    const first = rest[skip];
    if (first === "[") {
      return this.flowEntry(row, after + skip, index) ?? this.key(parent);
    }
    if (first === undefined || first === "#") {
      return this.blockEntry(row, index) ?? this.key(parent);
    }
    return this.key(parent);
  }

  // -- reading the lines ---------------------------------------------------

  private text(row: number): string {
    return this.lines[row]!.join("");
  }

  private top(name: string): number | null {
    const pattern = topKeyRe(name);
    for (let row = 0; row < this.lines.length; row += 1) {
      if (pattern.test(this.text(row))) return row;
    }
    return null;
  }

  /** The lines that belong to the top-level key on `row`. */
  private block(row: number): number[] {
    const rows: number[] = [];
    for (let inner = row + 1; inner < this.lines.length; inner += 1) {
      const line = this.lines[inner]!;
      if (line.length === 0 || " \t#-".includes(line[0]!)) {
        rows.push(inner);
        continue;
      }
      break;
    }
    return rows;
  }

  private blockEntry(row: number, index: number): Position | null {
    let indent: string | null = null;
    let seen = 0;
    for (const inner of this.block(row)) {
      const m = BLOCK_ITEM_RE.exec(this.text(inner));
      if (!m) continue;
      const own = m[1]!;
      if (indent === null) indent = own;
      if (own !== indent) continue; // an item of a list nested deeper
      if (seen === index) {
        // A bare `-` has no first character after it; the dash stands in.
        const first = m[2] !== undefined ? [...m[0]].length - 1 : [...own].length;
        return [inner + FIRST_LINE, first + 1];
      }
      seen += 1;
    }
    return null;
  }

  /** The first character of entry `index` of the flow list opened at (row, column). */
  private flowEntry(row: number, column: number, index: number): Position | null {
    let depth = 0;
    let quote: string | null = null;
    let expecting = false;
    let seen = 0;
    let r = row;
    let c = column;
    while (r < this.lines.length) {
      const line = this.lines[r]!;
      while (c < line.length) {
        const ch = line[c]!;
        if (quote !== null) {
          if (quote === '"' && ch === "\\") {
            c += 2;
            continue;
          }
          if (ch === quote) {
            if (quote === "'" && line[c + 1] === "'") {
              c += 2;
              continue;
            }
            quote = null;
          }
          c += 1;
          continue;
        }
        if (expecting && ch !== " " && ch !== "\t") {
          if (depth === 1 && ch === "]") return null;
          expecting = false;
          if (seen === index) return [r + FIRST_LINE, c + 1];
          seen += 1;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === "[" || ch === "{") {
          depth += 1;
          if (depth === 1) expecting = true;
        } else if (ch === "]" || ch === "}") {
          depth -= 1;
          if (depth === 0) return null;
        } else if (ch === "," && depth === 1) {
          expecting = true;
        } else if (ch === "#" && (c === 0 || line[c - 1] === " " || line[c - 1] === "\t")) {
          break; // a comment runs to the end of the line
        }
        c += 1;
      }
      r += 1;
      c = 0;
    }
    return null;
  }
}

/** A `-` item, capturing its indent and, when there is one, its first character. */
const BLOCK_ITEM_RE = /^([ \t]*)-(?:[ \t]+(\S)|[ \t]*$)/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keyPattern(name: string): string {
  const escaped = escapeRegExp(name);
  return `(?:${escaped}|"${escaped}"|'${escaped}')`;
}

function topKeyRe(name: string): RegExp {
  return new RegExp(`^${keyPattern(name)}[ \\t]*:`, "u");
}
