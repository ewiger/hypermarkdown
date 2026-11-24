/**
 * The `from <ref> import <names>` mini-grammar (HMD-0001 §5.3) — a port of
 * `tools/hmd/src/hypermarkdown/imports.py`.
 */

import type { ImportStmt } from "./model.js";
import { pyRepr } from "./pyrepr.js";

// WS is spaces and tabs, and an import-name is a segment with no whitespace in
// it: no `/`, no reserved character, no `:`.
const STMT_RE = /^from[ \t]+(\S+)[ \t]+import[ \t]+([\s\S]+?)[ \t]*$/;
const NAME = String.raw`[^\s/\[\]|#^:]+`;
const NAME_RE = new RegExp(String.raw`^(${NAME})(?:[ \t]+as[ \t]+(${NAME}))?$`);

/** `text` without the spaces and tabs at either end. */
function stripWs(text: string): string {
  return text.replace(/^[ \t]+|[ \t]+$/g, "");
}

/** A malformed import statement (HMD014). */
export class ImportSyntaxError extends Error {}

/**
 * True if `ref` is absolute or relative, as an import ref must be.
 *
 * A bare ref would need resolving by the very algorithm the import feeds, and
 * that circularity has no good answer.
 */
export function isQualified(ref: string): boolean {
  return ref.startsWith("/") || ref.startsWith("./") || ref.startsWith("../");
}

export function parseStatement(raw: unknown): ImportStmt {
  if (typeof raw !== "string") {
    throw new ImportSyntaxError(`import entry must be a string, got ${typeName(raw)}`);
  }

  const trimmed = raw.trim();
  const m = STMT_RE.exec(trimmed);
  if (!m) {
    throw new ImportSyntaxError(
      `expected 'from <ref> import <names>', got ${pyRepr(trimmed)}`,
    );
  }

  const ref = m[1]!;
  if (!isQualified(ref)) {
    throw new ImportSyntaxError(
      `import ref ${pyRepr(ref)} must be absolute ('/x') or relative ('./x', '../x'), never bare`,
    );
  }

  const names = stripWs(m[2]!);
  if (names === "*") {
    return { ref, wildcard: true, bindings: [], raw: trimmed };
  }

  const bindings: Array<readonly [string, string]> = [];
  for (const chunk of names.split(",")) {
    // Spaces and tabs may stand on either side of a comma, nothing else.
    const part = stripWs(chunk);
    if (!part) {
      throw new ImportSyntaxError(`empty name in import list: ${pyRepr(trimmed)}`);
    }
    if (part === "*") {
      throw new ImportSyntaxError("'*' may not be combined with named imports");
    }
    const nm = NAME_RE.exec(part);
    if (!nm) {
      throw new ImportSyntaxError(
        `expected '<name>' or '<name> as <alias>', got ${pyRepr(part)}`,
      );
    }
    bindings.push([nm[1]!, nm[2] ?? nm[1]!] as const);
  }

  return { ref, wildcard: false, bindings, raw: trimmed };
}

function typeName(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  return typeof value;
}
