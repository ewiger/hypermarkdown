/**
 * IR -> DOM (HMD-0021 §5, §5.1).
 *
 * Pure DOM, no VS Code API, so the whole renderer runs under jsdom in a unit
 * test. The webview entry point wires this to `postMessage`; nothing here knows
 * that an editor exists.
 */

import type {
  Block,
  DiagramBlock,
  DocumentIR,
  EmbedBlock,
} from "@hypermarkdown/core";

export interface RenderSettings {
  embeds: "expanded" | "collapsed";
}

/**
 * Patch `container` to match `blocks`.
 *
 * Reuse is keyed on `Block.key`, so an untouched block keeps its element — and
 * with it the scroll position, the collapse state of any embed inside it, and
 * focus (VSX-019). Rebuilding would be simpler and would throw all three away
 * on every keystroke.
 */
export function patchBlocks(
  container: HTMLElement,
  blocks: readonly Block[],
  settings: RenderSettings,
): void {
  const existing = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const key = (child as HTMLElement).dataset["key"];
    if (key !== undefined) existing.set(key, child as HTMLElement);
  }

  const wanted: HTMLElement[] = [];
  for (const block of blocks) {
    const previous = existing.get(block.key);
    if (previous !== undefined && previous.dataset["kind"] === block.kind) {
      wanted.push(updateBlock(previous, block, settings));
      existing.delete(block.key);
    } else {
      wanted.push(createBlock(block, settings));
    }
  }

  for (const orphan of existing.values()) orphan.remove();

  // Reorder in place; nodes already in the right slot are left untouched.
  let cursor: ChildNode | null = container.firstChild;
  for (const element of wanted) {
    if (cursor === element) {
      cursor = element.nextSibling;
      continue;
    }
    container.insertBefore(element, cursor);
  }
  while (cursor !== null) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}

function createBlock(block: Block, settings: RenderSettings): HTMLElement {
  const element = document.createElement(block.kind === "html" ? "div" : "section");
  element.dataset["key"] = block.key;
  element.dataset["kind"] = block.kind;
  return updateBlock(element, block, settings, true);
}

/**
 * A rendered diagram, or its source with the reason there isn't one (HMD-0022).
 *
 * The SVG arrives as a `data:` URI on an `<img>`, which executes no script — so
 * diagram source from a cloned repository cannot run code in the webview.
 */
function renderDiagram(element: HTMLElement, block: DiagramBlock): void {
  const rendered = block.dataUri !== null;
  element.className = rendered ? "hmd-diagram" : "hmd-diagram is-unrendered";
  element.dataset["line"] = String(block.span.line);
  element.textContent = "";

  if (rendered) {
    const image = document.createElement("img");
    image.className = "hmd-diagram-image";
    image.src = block.dataUri!;
    image.alt = `${block.language} diagram`;
    element.append(image);
    return;
  }

  // A diagram that is merely not drawn is not a defect in the card, so the
  // source is shown as source and the reason sits beside it.
  const notice = document.createElement("div");
  notice.className = "hmd-diagram-notice";
  notice.textContent = block.failure ?? `${block.language} diagram not rendered`;
  element.append(notice);

  const pre = document.createElement("pre");
  pre.className = "hmd-diagram-source";
  const code = document.createElement("code");
  code.textContent = block.source;
  pre.append(code);
  element.append(pre);
}

function updateBlock(
  element: HTMLElement,
  block: Block,
  settings: RenderSettings,
  fresh = false,
): HTMLElement {
  element.dataset["key"] = block.key;
  element.dataset["kind"] = block.kind;

  if (block.kind === "html") {
    element.className = "hmd-block";
    element.dataset["line"] = String(block.span.line);
    // The only innerHTML in the renderer, and only for content the core
    // produced with `html: false` (HMD-0021 §5).
    if (element.innerHTML !== block.html) element.innerHTML = block.html;
    return element;
  }

  if (block.kind === "diagram") {
    renderDiagram(element, block);
    return element;
  }

  renderEmbed(element, block, settings, fresh);
  return element;
}

function renderEmbed(
  element: HTMLElement,
  block: EmbedBlock,
  settings: RenderSettings,
  fresh: boolean,
): void {
  // Read the collapse state before touching className, which would erase it —
  // and with it the reader's decision to fold this card away (VSX-019).
  const collapsed = fresh
    ? settings.embeds === "collapsed"
    : element.classList.contains("is-collapsed");

  element.className = "hmd-embed";
  element.dataset["line"] = String(block.span.line);
  element.dataset["depth"] = String(block.depth);

  let header = element.querySelector<HTMLElement>(":scope > .hmd-embed-header");
  let body = element.querySelector<HTMLElement>(":scope > .hmd-embed-body");

  if (header === null || body === null) {
    element.textContent = "";
    header = document.createElement("header");
    header.className = "hmd-embed-header";
    body = document.createElement("div");
    body.className = "hmd-embed-body";
    element.append(header, body);
  }

  const label = block.resolution.path ?? block.target.page;
  const fragment = block.target.fragment;
  const suffix = fragment === null ? "" : `#${fragment.kind === "block" ? "^" : ""}${fragment.value}`;

  header.textContent = "";

  const toggle = document.createElement("button");
  toggle.className = "hmd-embed-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.textContent = collapsed ? "▸" : "▾";
  element.classList.toggle("is-collapsed", collapsed);

  const source = document.createElement("a");
  source.className = "hmd-embed-source";
  source.textContent = `${label}${suffix}`;
  // The header navigates to the EMBEDDED card, not the embedding one (VSX-022).
  if (block.resolution.path !== null) {
    source.dataset["hmdPath"] = block.resolution.path;
    if (fragment !== null) source.dataset["hmdFragment"] = fragment.value;
  }

  const badge = document.createElement("span");
  badge.className = "hmd-embed-badge";
  badge.textContent = "embed";

  header.append(toggle, source, badge);

  body.textContent = "";
  if (block.document !== null) {
    const inner = document.createElement("div");
    inner.className = "hmd-embed-inner";
    patchBlocks(inner, block.document.blocks, settings);
    body.append(inner);
    return;
  }

  // An embed that renders as nothing is the worst available outcome: the
  // document reads as complete and is not (HMD-0021 §5).
  const failure = document.createElement("div");
  failure.className = "hmd-embed-failure";
  failure.textContent = block.failure ?? "This embed does not resolve.";
  body.append(failure);
}

export function renderBreadcrumb(container: HTMLElement, ir: DocumentIR): void {
  container.textContent = "";
  const segments = [...ir.breadcrumb, basename(ir.path)];
  segments.forEach((segment, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "hmd-crumb-sep";
      separator.textContent = "/";
      container.append(separator);
    }
    const crumb = document.createElement("span");
    crumb.className = "hmd-crumb";
    crumb.textContent = segment;
    container.append(crumb);
  });
}

// -- scroll sync ---------------------------------------------------------

export interface Anchor {
  line: number;
  top: number;
}

/** Every `data-line` in document order, with its offset from the container. */
export function collectAnchors(container: HTMLElement): Anchor[] {
  const anchors: Anchor[] = [];
  for (const element of Array.from(container.querySelectorAll<HTMLElement>("[data-line]"))) {
    const line = Number(element.dataset["line"]);
    if (!Number.isFinite(line)) continue;
    anchors.push({ line, top: element.offsetTop });
  }
  anchors.sort((a, b) => a.line - b.line || a.top - b.top);
  return anchors;
}

/** Interpolate a scroll offset for a source line. */
export function offsetForLine(anchors: readonly Anchor[], line: number): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  if (line <= first.line) return first.top;
  const last = anchors[anchors.length - 1]!;
  if (line >= last.line) return last.top;

  for (let i = 1; i < anchors.length; i += 1) {
    const previous = anchors[i - 1]!;
    const next = anchors[i]!;
    if (line > next.line) continue;
    const span = next.line - previous.line;
    const progress = span === 0 ? 0 : (line - previous.line) / span;
    return previous.top + progress * (next.top - previous.top);
  }
  return last.top;
}

/** Interpolate a source line for a scroll offset. */
export function lineForOffset(anchors: readonly Anchor[], offset: number): number {
  if (anchors.length === 0) return 1;
  const first = anchors[0]!;
  if (offset <= first.top) return first.line;
  const last = anchors[anchors.length - 1]!;
  if (offset >= last.top) return last.line;

  for (let i = 1; i < anchors.length; i += 1) {
    const previous = anchors[i - 1]!;
    const next = anchors[i]!;
    if (offset > next.top) continue;
    const span = next.top - previous.top;
    const progress = span === 0 ? 0 : (offset - previous.top) / span;
    return Math.round(previous.line + progress * (next.line - previous.line));
  }
  return last.line;
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}
