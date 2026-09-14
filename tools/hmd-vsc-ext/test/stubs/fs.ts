/**
 * `workspace.fs` over `node:fs`, for the suites that test discovery.
 *
 * Walking up from a card to the nearest `.hmd/` is a statement about a
 * directory tree, so the tree is the one thing a test of it must not fake.
 */

import { readFile, readdir, stat } from "node:fs/promises";

import { FileType } from "./vscode.js";

export const nodeFileSystem = {
  async stat(uri: { fsPath: string }): Promise<{ type: number }> {
    const info = await stat(uri.fsPath);
    return { type: info.isDirectory() ? FileType.Directory : FileType.File };
  },

  async readFile(uri: { fsPath: string }): Promise<Uint8Array> {
    return new Uint8Array(await readFile(uri.fsPath));
  },

  async readDirectory(uri: { fsPath: string }): Promise<[string, number][]> {
    const entries = await readdir(uri.fsPath, { withFileTypes: true });
    return entries.map((entry) => [
      entry.name,
      entry.isDirectory() ? FileType.Directory : FileType.File,
    ]);
  },
};
