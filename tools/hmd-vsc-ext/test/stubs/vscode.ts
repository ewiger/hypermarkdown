/**
 * The smallest `vscode` module that lets a unit test import extension code.
 *
 * Deliberately not a mock framework: anything that needs more of the editor
 * than this belongs in the integration suite, not here.
 */

/**
 * A working emitter, not a no-op.
 *
 * The preview's tab title is driven by an event, so a stub that swallowed
 * `fire` would let the assertion pass for the wrong reason. Declared first
 * because the `window` stub constructs emitters as the module loads.
 */
export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  event = (listener: (value: T) => void): { dispose: () => void } => {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}
}

export class Diagnostic {
  code: string | undefined;
  source: string | undefined;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number,
  ) {}
}

export const DiagnosticSeverity = { Error: 0, Warning: 1 } as const;

export class WorkspaceEdit {
  readonly operations: unknown[] = [];
  createFile(...args: unknown[]): void {
    this.operations.push(["createFile", ...args]);
  }
  insert(...args: unknown[]): void {
    this.operations.push(["insert", ...args]);
  }
}

/**
 * A URI with a scheme, because vault identity is a URI string.
 *
 * The catalog keys vaults by `root.toString()` and decides containment by
 * string prefix, so a stub that returned a bare path would let a test pass
 * against addressing the real editor does not have.
 */
export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static file(path: string): Uri {
    return new Uri("file", path);
  }

  static parse(value: string, _strict?: boolean): Uri {
    const cut = value.indexOf("://");
    if (cut === -1) throw new Error(`not a URI: ${value}`);
    return new Uri(value.slice(0, cut), decodeURIComponent(value.slice(cut + 3)));
  }

  static joinPath(base: { scheme?: string; path: string }, ...parts: string[]): Uri {
    return new Uri(base.scheme ?? "file", [base.path, ...parts].join("/"));
  }

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

/** A workspace folder, as `getWorkspaceFolder` hands one back. */
export interface WorkspaceFolderStub {
  uri: Uri;
  name: string;
  index: number;
}

export class FileSystemWatcherStub {
  readonly created = new EventEmitter<Uri>();
  readonly changed = new EventEmitter<Uri>();
  readonly deleted = new EventEmitter<Uri>();
  onDidCreate = this.created.event;
  onDidChange = this.changed.event;
  onDidDelete = this.deleted.event;
  dispose(): void {
    this.created.dispose();
    this.changed.dispose();
    this.deleted.dispose();
  }
}

/**
 * `workspace.fs` over the real file system.
 *
 * Discovery is a walk over directories, so the one thing a test of it must not
 * stub is the directory tree. `fs` is filled in by `test/stubs/fs.ts` on the
 * suites that need it, and left unset elsewhere so nothing reads a disk by
 * accident.
 */
export const workspace = {
  isTrusted: true,
  getConfiguration: () => ({ get: <T>(_key: string, fallback: T): T => fallback }),
  textDocuments: [] as unknown[],
  workspaceFolders: undefined as WorkspaceFolderStub[] | undefined,
  applyEdit: async () => true,
  openTextDocument: async () => ({}),
  fs: undefined as unknown,
  getWorkspaceFolder: (uri: { toString(): string }): WorkspaceFolderStub | undefined =>
    workspace.workspaceFolders?.find((folder) =>
      uri.toString().startsWith(`${folder.uri.toString()}/`),
    ),
  createFileSystemWatcher: (_pattern: unknown): FileSystemWatcherStub =>
    new FileSystemWatcherStub(),
  onDidChangeTextDocument: (_listener: unknown) => ({ dispose: () => undefined }),
  onDidCloseTextDocument: (_listener: unknown) => ({ dispose: () => undefined }),
};

/** Every `createWebviewPanel` call, so a test can assert where a tab landed. */
export interface CreatedPanel {
  viewType: string;
  title: string;
  showOptions: { viewColumn: number; preserveFocus?: boolean };
  panel: WebviewPanelStub;
}

export const createdPanels: CreatedPanel[] = [];

export class WebviewPanelStub {
  title: string;
  active = true;
  disposed = false;
  iconPath: unknown;
  viewColumn: number | undefined;
  revealed = 0;
  readonly posted: unknown[] = [];

  private readonly viewStateChanged = new EventEmitter<void>();
  private readonly didDispose = new EventEmitter<void>();
  private readonly receivedMessage = new EventEmitter<unknown>();

  readonly webview = {
    html: "",
    options: {} as unknown,
    cspSource: "vscode-webview://stub",
    asWebviewUri: (uri: { toString(): string }) => uri,
    postMessage: async (message: unknown) => {
      this.posted.push(message);
      return true;
    },
    onDidReceiveMessage: this.receivedMessage.event,
  };

  constructor(title: string) {
    this.title = title;
  }

  onDidChangeViewState = this.viewStateChanged.event;
  onDidDispose = this.didDispose.event;

  reveal(_column?: number, _preserveFocus?: boolean): void {
    this.revealed += 1;
  }

  /** Drive focus the way VS Code would when the user clicks another tab. */
  setActive(active: boolean): void {
    this.active = active;
    this.viewStateChanged.fire();
  }

  dispose(): void {
    this.disposed = true;
    this.didDispose.fire();
  }
}

export const window = {
  showWarningMessage: () => undefined,
  showErrorMessage: () => undefined,
  showTextDocument: async () => ({}),
  setStatusBarMessage: () => undefined,
  visibleTextEditors: [] as unknown[],
  activeTextEditor: undefined as { document: { uri: unknown } } | undefined,
  tabGroups: {
    all: [] as { viewColumn: number }[],
    activeTabGroup: { viewColumn: 1 } as { viewColumn: number } | undefined,
  },
  activeEditorChanged: new EventEmitter<void>(),
  visibleRangesChanged: new EventEmitter<unknown>(),
  onDidChangeActiveTextEditor: (listener: () => void) => window.activeEditorChanged.event(listener),
  onDidChangeTextEditorVisibleRanges: (listener: (event: unknown) => void) =>
    window.visibleRangesChanged.event(listener),
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: { viewColumn: number; preserveFocus?: boolean },
    _options?: unknown,
  ): WebviewPanelStub => {
    const panel = new WebviewPanelStub(title);
    // VS Code resolves Active/Beside to a concrete group; the stub resolves
    // them to the active group so `viewColumn` is never a sentinel.
    panel.viewColumn =
      showOptions.viewColumn > 0
        ? showOptions.viewColumn
        : (window.tabGroups.activeTabGroup?.viewColumn ?? 1);
    createdPanels.push({ viewType, title, showOptions, panel });
    return panel;
  },
};

export const languages = {
  createDiagnosticCollection: () => ({
    set: () => undefined,
    clear: () => undefined,
    dispose: () => undefined,
  }),
};

export const commands = { executeCommand: async () => undefined };
export const FileType = { File: 1, Directory: 2 } as const;
export const ViewColumn = { Active: -1, One: 1, Beside: 2 } as const;
export const TextEditorRevealType = { AtTop: 1 } as const;
export class RelativePattern {
  constructor(
    readonly base: unknown,
    readonly pattern: string,
  ) {}
}
