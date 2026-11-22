/**
 * Frontmatter and the three reserved keys (HMD-0001 §2, §5.3) — a port of
 * `tools/hmd/src/hypermarkdown/frontmatter.py`.
 *
 * `tags`, `use`, and `import` are reserved for the toolchain. The set is closed
 * and enumerated here; every other key stays user-owned and unexamined (P3).
 */

import { load as yamlLoad, JSON_SCHEMA, YAMLException } from "js-yaml";

import { ImportSyntaxError, parseStatement } from "./imports.js";
import type { CardConfig, ImportStmt } from "./model.js";
import { splitLines, stripEol } from "./scan.js";

export const RESERVED_KEYS: ReadonlySet<string> = new Set(["tags", "use", "import"]);

/** Features nameable in `use`. Prefixing `no_` disables, as in vim's `set no…`. */
export const KNOWN_FEATURES: ReadonlySet<string> = new Set(["autodiscovery"]);

const FENCE = "---";

export interface FrontmatterSplit {
  raw: string | null;
  body: string;
  bodyOffset: number;
}

/**
 * Split `text` into raw YAML, body, and the body's offset.
 *
 * The fence must begin at offset 0 and close with a `---` line; anything else is
 * a document with no frontmatter at all — including an unterminated fence,
 * which is the ordinary state of a card being typed.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  if (!text.startsWith(FENCE)) return { raw: null, body: text, bodyOffset: 0 };

  const lines = splitLines(text);
  const first = lines[0];
  if (first === undefined || stripEol(first) !== FENCE) {
    return { raw: null, body: text, bodyOffset: 0 };
  }

  let offset = first.length;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (stripEol(line) === FENCE) {
      const raw = text.slice(first.length, offset);
      const end = offset + line.length;
      return { raw, body: text.slice(end), bodyOffset: end };
    }
    offset += line.length;
  }

  return { raw: null, body: text, bodyOffset: 0 };
}

/** Parse frontmatter YAML, or throw (HMD009). */
export function parseYaml(raw: string): Record<string, unknown> {
  let data: unknown;
  try {
    // JSON_SCHEMA is the js-yaml analogue of yaml.safe_load: no custom tags,
    // no implicit types beyond YAML 1.2 core (HMD-0020 §5).
    data = yamlLoad(raw, { schema: JSON_SCHEMA });
  } catch (exc) {
    const detail = exc instanceof YAMLException ? exc.message : String(exc);
    throw new Error(`invalid YAML: ${detail.split(/\s+/).join(" ")}`);
  }
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`frontmatter must be a mapping, got ${typeName(data)}`);
  }
  return data as Record<string, unknown>;
}

export type Problem = readonly [rule: string, message: string];

/**
 * Read the reserved keys out of `data`, returning the config plus problems the
 * caller attaches to a span.
 *
 * Unrecognised input is reported rather than ignored: silently dropping a
 * misspelled `no_autodiscovry` hands the author the default while they believe
 * they configured something else.
 */
export function parseCardConfig(data: Record<string, unknown>): {
  card: CardConfig;
  problems: Problem[];
} {
  const problems: Problem[] = [];
  const tags = parseTags(data["tags"], problems);
  const use = parseUse(data["use"], problems);
  const imports = parseImports(data["import"], problems);
  return { card: { tags, use, imports }, problems };
}

function parseTags(value: unknown, problems: Problem[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.push(["HMD013", `\`tags\` must be a list, got ${typeName(value)}`]);
    return [];
  }
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      problems.push(["HMD013", `\`tags\` entries must be non-empty strings, got ${repr(item)}`]);
      continue;
    }
    tags.push(item.trim());
  }
  return tags;
}

function parseUse(value: unknown, problems: Problem[]): Record<string, boolean> {
  if (value === undefined || value === null) return {};
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items)) {
    problems.push(["HMD013", `\`use\` must be a string or list, got ${typeName(value)}`]);
    return {};
  }

  const use: Record<string, boolean> = {};
  for (const item of items) {
    if (typeof item !== "string") {
      problems.push(["HMD013", `\`use\` entries must be strings, got ${repr(item)}`]);
      continue;
    }
    let name = item.trim();
    let enabled = true;
    if (name.startsWith("no_")) {
      name = name.slice(3);
      enabled = false;
    }
    if (!KNOWN_FEATURES.has(name)) {
      const known = [...KNOWN_FEATURES].sort().join(", ");
      problems.push([
        "HMD013",
        `unknown feature ${repr(item.trim())} in \`use\` (known: ${known})`,
      ]);
      continue;
    }
    use[name] = enabled;
  }
  return use;
}

function parseImports(value: unknown, problems: Problem[]): ImportStmt[] {
  if (value === undefined || value === null) return [];
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items)) {
    problems.push(["HMD014", `\`import\` must be a string or list, got ${typeName(value)}`]);
    return [];
  }

  const stmts: ImportStmt[] = [];
  for (const item of items) {
    try {
      stmts.push(parseStatement(item));
    } catch (exc) {
      if (exc instanceof ImportSyntaxError) problems.push(["HMD014", exc.message]);
      else throw exc;
    }
  }
  return stmts;
}

function typeName(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "dict";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return typeof value;
}

function repr(value: unknown): string {
  return typeof value === "string" ? `'${value}'` : String(value);
}
