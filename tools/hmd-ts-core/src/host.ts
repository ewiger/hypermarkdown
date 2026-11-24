/**
 * The filesystem port (HMD-0020).
 *
 * The core reaches the world through this interface and nothing else, so it
 * runs unchanged over `vscode.workspace.fs`, over `node:fs`, over an in-memory
 * map in tests, and in a browser.
 */

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  /**
   * A symbolic link whose target lies outside the namespace root. Neither the
   * entry nor anything reached through it is part of the namespace, and a
   * reference whose path meets it escapes the namespace (HMD003). Optional:
   * only a host that can follow links can tell, and one that cannot leaves it
   * out.
   */
  leavesRoot?: boolean;
}

export interface WorkspaceHost {
  /** Read a file as text, given a path relative to the namespace root. */
  readFile(rel: string): Promise<string>;
  /**
   * Read a file as bytes. Optional, and preferred whenever it is there: a card
   * that is not UTF-8 is not a card (HMD019), and only the bytes can say so —
   * a host that decodes for itself has already replaced what it could not
   * read. The core decodes them fatally and drops a leading byte-order mark.
   */
  readBytes?(rel: string): Promise<Uint8Array>;
  /** List a directory, given a path relative to the namespace root ("" is the root). */
  listDirectory(rel: string): Promise<DirEntry[]>;
}

/**
 * An in-memory host, for tests and for previewing an unsaved buffer. A file is
 * text, or bytes when what is on disk matters — a byte-order mark, or a file
 * that is not UTF-8.
 */
export class MemoryHost implements WorkspaceHost {
  constructor(private readonly files: Map<string, string | Uint8Array>) {}

  static from(files: Record<string, string | Uint8Array>): MemoryHost {
    return new MemoryHost(new Map(Object.entries(files)));
  }

  async readFile(rel: string): Promise<string> {
    const content = this.get(rel);
    return typeof content === "string" ? content : new TextDecoder().decode(content);
  }

  async readBytes(rel: string): Promise<Uint8Array> {
    const content = this.get(rel);
    return typeof content === "string" ? new TextEncoder().encode(content) : content;
  }

  private get(rel: string): string | Uint8Array {
    const content = this.files.get(rel);
    if (content === undefined) throw new Error(`no such file: ${rel}`);
    return content;
  }

  async listDirectory(rel: string): Promise<DirEntry[]> {
    const prefix = rel === "" ? "" : `${rel}/`;
    const names = new Map<string, boolean>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder === "") continue;
      const cut = remainder.indexOf("/");
      if (cut === -1) names.set(remainder, false);
      else names.set(remainder.slice(0, cut), true);
    }
    return [...names.entries()]
      .map(([name, isDirectory]) => ({ name, isDirectory }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
}
