/**
 * Path arithmetic over root-relative POSIX strings.
 *
 * The core never imports `node:path` (HMD-0020 §1), and the canonical
 * implementation's semantics come from `pathlib`, not from an OS. Both facts
 * point the same way: do the arithmetic here, on strings, deterministically.
 */

export const SUFFIX = ".hmd";
export const INDEX_STEM = "index";

/**
 * The card extensions in priority order (HMD-0029): where two files compete for
 * one name, the earlier extension wins.
 */
export const CARD_SUFFIXES: readonly string[] = [".hmd", ".md", ".markdown"];

/** The card extension `name` ends in, or null. */
export function cardSuffix(name: string): string | null {
  for (const suffix of CARD_SUFFIXES) {
    if (name.endsWith(suffix)) return suffix;
  }
  return null;
}

/** Split a link ref or path into non-empty segments. */
export function split(ref: string): string[] {
  return ref.split("/").filter((part) => part !== "");
}

export function joinParts(parts: readonly string[]): string {
  return parts.join("/");
}

/** The directory holding `rel`, or "" for a top-level entry. */
export function dirnameRel(rel: string): string {
  const cut = rel.lastIndexOf("/");
  return cut === -1 ? "" : rel.slice(0, cut);
}

export function basenameRel(rel: string): string {
  const cut = rel.lastIndexOf("/");
  return cut === -1 ? rel : rel.slice(cut + 1);
}

/** Join a root-relative directory with further segments. */
export function joinRel(dir: string, ...parts: string[]): string {
  const all = dir === "" ? parts : [dir, ...parts];
  return all.filter((p) => p !== "").join("/");
}

/**
 * The file a name becomes as a new card: `name` itself when it already ends in
 * a card extension, `name.hmd` otherwise. A name binds whole, so `v1.2` is
 * `v1.2.hmd` (HMD-0029).
 */
export function withHmdSuffix(name: string): string {
  return cardSuffix(name) === null ? `${name}${SUFFIX}` : name;
}

/** Drop a trailing card extension, if `name` has one. */
export function stripSuffix(name: string): string {
  const suffix = cardSuffix(name);
  return suffix === null ? name : name.slice(0, name.length - suffix.length);
}

export interface Normalized {
  parts: string[];
  /** True when the path climbed above the namespace root. */
  escapes: boolean;
}

/**
 * Collapse `.` and `..` without touching the filesystem.
 *
 * Never resolves symlinks: a symlink must not be able to carry a target out of
 * the root (HMD-0001 §4).
 */
export function normalizeParts(parts: readonly string[]): Normalized {
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      const last = out[out.length - 1];
      if (out.length > 0 && last !== "..") out.pop();
      else out.push("..");
      continue;
    }
    out.push(part);
  }
  return { parts: out, escapes: out[0] === ".." };
}

/** Root-relative parts of a page path, with its card extension removed. */
export function pageParts(rel: string): string[] {
  const parts = split(rel);
  const last = parts.pop();
  if (last !== undefined) parts.push(stripSuffix(last));
  return parts;
}

/** True when `dir` is an ancestor directory of `rel` (strictly above it). */
export function isUnder(dir: string, rel: string): boolean {
  if (dir === "") return true;
  return rel.startsWith(`${dir}/`);
}
