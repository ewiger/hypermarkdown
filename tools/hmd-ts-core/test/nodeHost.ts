/**
 * A `node:fs` host, for tests only.
 *
 * It lives in the test tree rather than in `src/` because the package itself
 * must import no Node builtins (HMD-0020).
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  }
}
