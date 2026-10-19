/**
 * `@hypermarkdown/core` — parser, resolver, and renderer for HyperMarkDown.
 *
 * Specified by HMD-0020. The canonical implementation is the Python package
 * under `tools/hmd/src/hypermarkdown/`; where the two disagree, Python is right and this
 * one carries the bug (HMD-0020 §10).
 */

export { parse, parseTarget, RESERVED_CHARS, SUFFIX } from "./parse.js";
export { mask, lineCol, lineStarts, PositionIndex } from "./scan.js";
export { slugify, slugFor, unique } from "./slug.js";
export {
  splitFrontmatter,
  parseYaml,
  parseCardConfig,
  KNOWN_FEATURES,
  RESERVED_KEYS,
} from "./frontmatter.js";
export { parseStatement, isQualified, ImportSyntaxError } from "./imports.js";
export {
  parseConfigToml,
  ConfigError,
  DEFAULT_PROJECT_CONFIG,
  DEFAULT_WIKI,
  MARKER_DIR,
  CONFIG_NAME,
  type ProjectConfig,
} from "./config.js";
export {
  Workspace,
  DEFAULT_CONFIG,
  INDEX_STEM,
  type ImportTable,
  type Outcome,
  type Resolution,
  type WorkspaceConfig,
} from "./workspace.js";
export { check, summarize, MAX_EMBED_DEPTH, SEVERITY } from "./lint.js";
export { expand, bodySlice, isFailure, type Expansion, type Slice } from "./expand.js";
export {
  Renderer,
  createMarkdownIt,
  escapeAttr,
  escapeText,
  DEFAULT_RENDER_OPTIONS,
  type RenderOptions,
} from "./render.js";
export { buildGraph, backlinks, type Graph, type GraphEdge, type GraphNode } from "./graph.js";
export { calloutPlugin } from "./parse/callout.js";
export { mathPlugin, renderMath } from "./parse/math.js";
export {
  CACHE_ENTRIES,
  DIAGRAM_LANGUAGES,
  MAX_SOURCE_BYTES,
  RENDER_TIMEOUT_MS,
  diagramKey,
  fenceLanguage,
  isDiagramFence,
  sha256,
} from "./diagram/fence.js";
export {
  CELL_KINDS,
  LISTING_KIND,
  OUTPUT_CLOSE,
  OUTPUT_OPEN,
  QUERY_KIND,
  cellKind,
  cellReads,
  isCurrent,
  maskForHql,
  normalizedSource,
  outputBlock,
  outputEdit,
  scanCells,
  type Cell,
  type CellOutput,
  type CellResult,
  type CellScan,
  type CellStatus,
  type TextEdit,
} from "./cell/cells.js";
export { MemoryHost, type DirEntry, type WorkspaceHost } from "./host.js";
export * from "./ir.js";
export * from "./model.js";
export {
  basenameRel,
  dirnameRel,
  isUnder,
  joinRel,
  normalizeParts,
  pageParts,
  split,
  stripSuffix,
  withHmdSuffix,
} from "./paths.js";
