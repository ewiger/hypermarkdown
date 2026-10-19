/**
 * IR construction and the markdown-it front end (HMD-0020 §2, §3, §7).
 *
 * markdown-it renders the GFM baseline. It is deliberately not asked to parse
 * the six constructs the format owns: the scanner has already found them at
 * exact offsets, so each one is swapped for a sentinel before rendering and
 * swapped back afterwards. Two matchers cannot disagree if only one of them
 * ever runs.
 */

import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";

import { scanCells, type Cell, type CellScan } from "./cell/cells.js";
import { DIAGRAM_LANGUAGES, fenceLanguage } from "./diagram/fence.js";
import { bodySlice, expand, isFailure, type Slice } from "./expand.js";
import {
  IR_VERSION,
  type Block,
  type CellBlock,
  type DiagramBlock,
  type DocumentIR,
  type EmbedBlock,
  type HtmlBlock,
  type ResolutionRef,
  type TargetRef,
} from "./ir.js";
import { calloutPlugin } from "./parse/callout.js";
import { mathPlugin } from "./parse/math.js";
import { MAX_EMBED_DEPTH } from "./lint.js";
import type { Anchor, Link, ParsedDocument, Span } from "./model.js";
import { split } from "./paths.js";
import type { Workspace } from "./workspace.js";

const SENTINEL_PREFIX = "xHMDxREFx";
const SENTINEL_SUFFIX = "xENDx";

export interface RenderOptions {
  /** How deep an embed chain may go. Shared with the linter's HMD008. */
  maxDepth: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { maxDepth: MAX_EMBED_DEPTH };

/**
 * The configured markdown-it instance (HMD-0020 §3).
 *
 * `html: false` escapes raw HTML rather than passing it through. The canonical
 * implementation passes it through; this is a deliberate divergence, because a
 * webview that renders workspace HTML is a script-injection surface reachable
 * from any cloned repository.
 *
 * `code` is disabled because markdown-it treats a four-space indent as a code
 * block and HMD-0001 §1 deliberately does not — under `admonition` and
 * `footnotes` that indent marks a callout body or a footnote continuation.
 */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });
  md.disable("code");
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: true });
  // The two the canonical stack gets from `admonition`, `pymdownx.details`,
  // and `pymdownx.arithmatex`, which have no JavaScript equivalents.
  md.use(calloutPlugin);
  md.use(mathPlugin);
  return md;
}

interface Ref {
  html: string;
}

/** A HyperMarkDown renderer over one workspace. */
export class Renderer {
  private readonly md: MarkdownIt;
  private lineOffset = 1;

  constructor(
    private readonly workspace: Workspace,
    private readonly options: RenderOptions = DEFAULT_RENDER_OPTIONS,
  ) {
    this.md = createMarkdownIt();
    this.installLineNumbers();
  }

  /** Render one card to IR, expanding embeds depth-first. */
  render(path: string): DocumentIR | null {
    const document = this.workspace.documents.get(path);
    if (document === undefined) return null;
    // The entry card is already on the cycle stack: a card that embeds
    // something that embeds the card back is a cycle at the second hop, not
    // the third, and the reader should be told at the first repetition.
    return this.renderSlice(document, bodySlice(document), 0, [`${path} `]);
  }

  private renderSlice(
    document: ParsedDocument,
    slice: Slice,
    depth: number,
    stack: readonly string[],
  ): DocumentIR {
    return {
      irVersion: IR_VERSION,
      path: document.path,
      breadcrumb: split(dirOf(document.path)),
      frontmatter: document.frontmatter,
      headings: document.headings.map((h) => ({
        level: h.level,
        text: h.text,
        slug: h.slug,
        line: h.span.line,
      })),
      anchors: document.anchors.map((a) => a.blockId),
      blocks: assignKeys(this.blocks(document, slice, depth, stack)),
    };
  }

  // -- segmentation ----------------------------------------------------

  private blocks(
    document: ParsedDocument,
    slice: Slice,
    depth: number,
    stack: readonly string[],
  ): Block[] {
    const lines = slice.text.split("\n");
    const firstLine = slice.startLine;
    const lastLine = firstLine + lines.length - 1;

    const linksByLine = groupByLine(
      document.links.filter((l) => l.span.line >= firstLine && l.span.line <= lastLine),
    );
    const anchorsByLine = groupByLine(
      document.anchors.filter((a) => a.span.line >= firstLine && a.span.line <= lastLine),
    );

    // Cells are found in the whole card, not the slice: a cell's hash depends
    // on the cells it reads, which an embedded section may not contain.
    const scan = this.cellsOf(document);
    const cellsByLine = new Map<number, Cell>();
    for (const cell of scan.cells) cellsByLine.set(cell.openLine + 1, cell);
    const markerLines = new Set<number>();
    for (const orphan of scan.orphans) {
      markerLines.add(orphan.openLine + 1);
      markerLines.add(orphan.closeLine + 1);
    }

    const blocks: Block[] = [];
    let pending: string[] = [];
    let pendingRefs: Ref[] = [];
    let pendingStart = firstLine;

    const flush = (): void => {
      const text = pending.join("\n");
      const refs = pendingRefs;
      pending = [];
      pendingRefs = [];
      if (text.trim() === "") return;
      blocks.push(...this.htmlBlocks(text, pendingStart, refs));
    };

    for (let i = 0; i < lines.length; i += 1) {
      const absolute = firstLine + i;
      const raw = lines[i]!;
      const links = linksByLine.get(absolute) ?? [];
      const anchors = anchorsByLine.get(absolute) ?? [];

      const cell = cellsByLine.get(absolute);
      if (cell !== undefined) {
        flush();
        blocks.push(this.cellBlock(document, cell, lines, firstLine, linksByLine, anchorsByLine));
        const last = (cell.output?.closeLine ?? cell.closeLine) + 1;
        i = Math.min(last, lastLine) - firstLine;
        pendingStart = absolute + 1;
        continue;
      }

      // An output no cell owns is shown as what it is, Markdown, without the
      // markers — which a renderer that escapes HTML would print as text.
      if (markerLines.has(absolute)) {
        if (pending.length === 0) pendingStart = absolute;
        pending.push("");
        continue;
      }

      const blockEmbed = links.find((l) => l.isEmbed && raw.trim() === l.raw);
      if (blockEmbed !== undefined) {
        flush();
        blocks.push(this.embedBlock(document, blockEmbed, depth, stack));
        pendingStart = absolute + 1;
        continue;
      }

      if (pending.length === 0) pendingStart = absolute;
      pending.push(this.substitute(document, raw, links, anchors, pendingRefs));
    }

    flush();
    return blocks;
  }

  private readonly scans = new Map<string, { text: string; scan: CellScan }>();

  private cellsOf(document: ParsedDocument): CellScan {
    const cached = this.scans.get(document.path);
    if (cached !== undefined && cached.text === document.text) return cached.scan;
    const scan = scanCells(document.text);
    this.scans.set(document.path, { text: document.text, scan });
    return scan;
  }

  /** A cell, with its saved output rendered as the card's own Markdown. */
  private cellBlock(
    document: ParsedDocument,
    cell: Cell,
    lines: readonly string[],
    firstLine: number,
    linksByLine: ReadonlyMap<number, Link[]>,
    anchorsByLine: ReadonlyMap<number, Anchor[]>,
  ): CellBlock {
    let output: CellBlock["output"] = null;
    if (cell.output !== null) {
      const from = cell.output.openLine + 2;
      const to = cell.output.closeLine;
      const refs: Ref[] = [];
      const body: string[] = [];
      for (let line = from; line <= to; line += 1) {
        const raw = lines[line - firstLine];
        if (raw === undefined) break;
        if (line === to && raw.trim() === "<!-- /hql:output -->") break;
        body.push(
          this.substitute(
            document,
            raw,
            linksByLine.get(line) ?? [],
            anchorsByLine.get(line) ?? [],
            refs,
          ),
        );
      }
      const text = body.join("\n");
      output = {
        status: cell.output.status,
        hash: cell.output.hash,
        current: cell.output.hash === cell.hash,
        blocks: text.trim() === "" ? [] : assignKeys(this.htmlBlocks(text, from, refs)),
      };
    }
    return {
      kind: "cell",
      key: "",
      index: cell.index,
      language: cell.kind,
      id: cell.id,
      hidden: cell.hidden,
      source: cell.source,
      hash: cell.hash,
      output,
      span: { start: 0, end: 0, line: cell.openLine + 1, column: 1 },
    };
  }

  /**
   * Render one segment as *one HtmlBlock per top-level markdown block*.
   *
   * Granularity is the point. One block per segment would mean an edit to a
   * heading changes the key of every paragraph beneath it, and the renderer
   * would rebuild a document it could have patched (VSX-019).
   */
  private htmlBlocks(text: string, startLine: number, refs: readonly Ref[]): Block[] {
    this.lineOffset = startLine;
    const env: Record<string, unknown> = {};
    const tokens = this.md.parse(text, env);

    const out: Block[] = [];
    let group: typeof tokens = [];
    let depth = 0;

    const emit = (): void => {
      if (group.length === 0) return;
      const current = group;
      group = [];

      const line = current.find((t) => t.map)?.map?.[0];
      const at = line === undefined ? startLine : startLine + line;

      // A diagram fence is its own block: it resolves against the filesystem
      // and can be absent or stale, none of which survives an HTML string.
      const only = current.length === 1 ? current[0] : undefined;
      if (only !== undefined && only.type === "fence") {
        const language = fenceLanguage(only.info);
        if (DIAGRAM_LANGUAGES.has(language)) {
          out.push(diagramBlock(only.content, language, at));
          return;
        }
      }

      const html = restore(this.md.renderer.render(current, this.md.options, env), refs);
      if (html.trim() === "") return;
      out.push({ kind: "html", key: "", html, span: { start: 0, end: 0, line: at, column: 1 } });
    };

    for (const token of tokens) {
      group.push(token);
      depth += token.nesting;
      if (depth === 0) emit();
    }
    emit();

    return out;
  }


  /**
   * Replace each construct on one line with a sentinel, right to left so
   * earlier columns keep their offsets.
   */
  private substitute(
    document: ParsedDocument,
    line: string,
    links: readonly Link[],
    anchors: readonly Anchor[],
    refs: Ref[],
  ): string {
    const edits: Array<{ start: number; end: number; replacement: string }> = [];

    for (const link of links) {
      const start = link.span.column - 1;
      const index = refs.length;
      refs.push({ html: this.inlineHtml(document, link) });
      edits.push({ start, end: start + link.raw.length, replacement: sentinel(index) });
    }

    for (const anchor of anchors) {
      const start = anchor.span.column - 1;
      edits.push({ start, end: start + (anchor.span.end - anchor.span.start), replacement: "" });
    }

    edits.sort((a, b) => b.start - a.start);
    let out = line;
    for (const edit of edits) {
      out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
    }
    return out;
  }

  /**
   * The pinned inline shape of HMD-0020 §7. Class names and `data-hmd-*`
   * attributes are a stable interface: renaming one breaks the webview.
   */
  private inlineHtml(document: ParsedDocument, link: Link): string {
    const result = this.workspace.resolve(document.path, link.pageRef);
    const label =
      link.display ??
      (link.fragment === null ? link.pageRef : `${link.pageRef}#${link.fragment}`);

    const classes = ["hmd-link"];
    if (link.isEmbed) classes.push("hmd-embed-inline");
    if (result.outcome === "unresolved") classes.push("hmd-redlink");
    if (result.outcome === "ambiguous") classes.push("hmd-ambiguous");
    if (result.outcome === "escapes") classes.push("hmd-escapes");

    const attrs: Array<[string, string]> = [
      ["class", classes.join(" ")],
      ["data-line", String(link.span.line)],
      ["data-hmd-target", link.pageRef],
    ];
    if (result.path !== null) attrs.push(["data-hmd-path", result.path]);
    if (link.fragment !== null) attrs.push(["data-hmd-fragment", link.fragment]);
    if (link.fragmentKind !== null) attrs.push(["data-hmd-fragment-kind", link.fragmentKind]);
    if (result.candidates.length > 0) {
      attrs.push(["data-hmd-candidates", result.candidates.join(",")]);
    }

    const rendered = attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ");
    return `<a ${rendered}>${escapeText(label)}</a>`;
  }

  // -- embeds ----------------------------------------------------------

  private embedBlock(
    document: ParsedDocument,
    link: Link,
    depth: number,
    stack: readonly string[],
  ): EmbedBlock {
    const result = this.workspace.resolve(document.path, link.pageRef);
    const base: Omit<EmbedBlock, "document" | "failure"> = {
      kind: "embed",
      key: "",
      target: targetRef(link),
      resolution: {
        state: result.outcome,
        path: result.path,
        candidates: result.candidates,
      } satisfies ResolutionRef,
      depth,
      span: link.span,
    };

    if (result.outcome !== "resolved" || result.path === null) {
      return { ...base, document: null, failure: failureFor(result.outcome, link.raw) };
    }

    const frame = `${result.path} ${link.fragment ?? ""}`;
    if (stack.includes(frame)) {
      return { ...base, document: null, failure: `embed cycle (HMD007): ${link.raw}` };
    }
    if (depth + 1 >= this.options.maxDepth) {
      return {
        ...base,
        document: null,
        failure: `embed depth exceeds the limit of ${this.options.maxDepth} (HMD008)`,
      };
    }

    const targetDoc = this.workspace.documents.get(result.path);
    if (targetDoc === undefined) {
      return { ...base, document: null, failure: `${result.path} is not loaded` };
    }

    const expansion = expand(targetDoc, link.fragment, link.fragmentKind);
    if (isFailure(expansion)) {
      return { ...base, document: null, failure: `${result.path} has ${expansion.reason}` };
    }

    const child = this.renderSlice(targetDoc, expansion, depth + 1, [...stack, frame]);
    return { ...base, document: child, failure: null };
  }

  // -- data-line -------------------------------------------------------

  /**
   * Stamp every block-level element with its 1-indexed source line.
   *
   * This is the sole mechanism behind scroll sync and click-through
   * (HMD-0020 §7); without it the preview and the editor share no coordinates.
   */
  private installLineNumbers(): void {
    const renderer = this.md.renderer;
    const original = renderer.renderToken.bind(renderer);
    renderer.renderToken = (tokens, idx, options) => {
      const token = tokens[idx];
      if (token && token.map && token.nesting !== -1 && token.block) {
        token.attrSet("data-line", String(this.lineOffset + token.map[0]!));
      }
      return original(tokens, idx, options);
    };
  }
}

// -- helpers -------------------------------------------------------------

/** A diagram fence, carried unrendered; the consumer runs `d2`. */
function diagramBlock(source: string, language: string, line: number): DiagramBlock {
  return {
    kind: "diagram",
    key: "",
    language,
    source,
    dataUri: null,
    failure: null,
    span: { start: 0, end: 0, line, column: 1 },
  };
}

function sentinel(index: number): string {
  return `${SENTINEL_PREFIX}${index}${SENTINEL_SUFFIX}`;
}

const SENTINEL_RE = new RegExp(`${SENTINEL_PREFIX}(\\d+)${SENTINEL_SUFFIX}`, "g");

/** Swap every sentinel back for the anchor the scanner's link produced. */
function restore(html: string, refs: readonly Ref[]): string {
  return html.replace(SENTINEL_RE, (_match, index: string) => refs[Number(index)]?.html ?? "");
}

function groupByLine<T extends { span: Span }>(items: readonly T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const list = map.get(item.span.line);
    if (list === undefined) map.set(item.span.line, [item]);
    else list.push(item);
  }
  for (const list of map.values()) list.sort((a, b) => a.span.column - b.span.column);
  return map;
}

function dirOf(rel: string): string {
  const cut = rel.lastIndexOf("/");
  return cut === -1 ? "" : rel.slice(0, cut);
}

function targetRef(link: Link): TargetRef {
  const form = link.pageRef.startsWith("/")
    ? "absolute"
    : link.pageRef.startsWith("./") || link.pageRef.startsWith("../")
      ? "relative"
      : "bare";
  return {
    raw: link.raw,
    form,
    page: link.pageRef,
    fragment:
      link.fragment === null
        ? null
        : { kind: link.fragmentKind ?? "heading", value: link.fragment, slug: null },
    display: link.display,
  };
}

function failureFor(outcome: string, raw: string): string {
  switch (outcome) {
    case "ambiguous":
      return `${raw} matches more than one page (HMD002)`;
    case "escapes":
      return `${raw} resolves outside the namespace root (HMD003)`;
    default:
      return `${raw} does not resolve to a page (HMD001)`;
  }
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * Assign each block a key from its content and, among identical blocks, its
 * occurrence order.
 *
 * Not from the line number: an edit at the top of a card would then change
 * every key below it, and the renderer would rebuild a document it could have
 * patched (HMD-0020 §7, VSX-019).
 */
function assignKeys(blocks: Block[]): Block[] {
  const seen = new Map<string, number>();
  return blocks.map((block) => {
    const content =
      block.kind === "html"
        ? block.html
        : block.kind === "embed"
          ? `embed:${block.target.raw}`
          : block.kind === "diagram"
            ? `diagram:${block.source}`
            : // By name, not content: running a cell changes its output, and
              // the element — with the reader's choice to show the code — should
              // survive that.
              `cell:${block.id ?? `#${block.index}`}`;
    const digest = fnv1a(content);
    const nth = seen.get(digest) ?? 0;
    seen.set(digest, nth + 1);
    return { ...block, key: `${digest}-${nth}` };
  });
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
