/**
 * A `node:fs` host, for tests only.
 *
 * It lives in the test tree rather than in `src/` because the package itself
 * must import no Node builtins (HMD-0020).
 */

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";

import type { DirEntry, WorkspaceHost } from "../src/host.js";

export class NodeHost implements WorkspaceHost {
  constructor(private readonly root: string) {}

  async readFile(rel: string): Promise<string> {
    return readFile(join(this.root, rel), "utf8");
  }

  async readBytes(rel: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.root, rel)));
  }

  async listDirectory(rel: string): Promise<DirEntry[]> {
    const entries = await readdir(join(this.root, rel), { withFileTypes: true });
    const listed = await Promise.all(
      entries.map(async (e): Promise<DirEntry | null> => {
        if (!e.isSymbolicLink()) return { name: e.name, isDirectory: e.isDirectory() };
        // A link out of the root is reported, never followed. A link to a
        // directory inside it is not walked, as the canonical implementation
        // does not walk one, which also keeps a link to an ancestor from
        // looping; a link to a file inside it is read like the file.
        const target = await realpath(join(this.root, rel, e.name)).catch(() => null);
        const root = await realpath(this.root);
        const inside = target !== null && (target === root || target.startsWith(root + sep));
        if (!inside) return { name: e.name, isDirectory: false, leavesRoot: true };
        return (await stat(target)).isDirectory() ? null : { name: e.name, isDirectory: false };
      }),
    );
    return listed.filter((entry): entry is DirEntry => entry !== null);
  }
}
