/**
 * A value as Python's `repr` writes it.
 *
 * Diagnostic messages quote the offending value, and the canonical
 * implementation quotes it with `repr`. The conformance corpus compares
 * messages byte for byte, so a value has to read the same here: `'x'`, not
 * `"x"`, and `{'key': 'value'}`, not `[object Object]`.
 */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return Number.isFinite(value) ? String(value) : value > 0 ? "inf" : value < 0 ? "-inf" : "nan";
  }
  if (typeof value === "string") return reprString(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (value instanceof Date) return reprString(value.toISOString());
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([k, v]) => `${reprString(k)}: ${pyRepr(v)}`).join(", ")}}`;
  }
  return String(value);
}

/** Single quotes unless the text holds one and no double quote, as Python does. */
function reprString(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else out += ch;
  }
  return `${quote}${out}${quote}`;
}
