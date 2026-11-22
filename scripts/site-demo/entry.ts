/**
 * The cover's live editor: one card of a small vault, typed into, rendered and
 * linted in the page by the TypeScript implementation.
 *
 * The vault is `examples/small`, inlined at build time by
 * `scripts/build-site-demo.mjs`. Nothing is fetched and nothing is sent.
 */

import {
  MemoryHost,
  Renderer,
  Workspace,
  check,
  type Block,
  type Diagnostic,
} from "../../tools/hmd-ts-core/src/index.js";

declare const __HMD_DEMO_VAULT__: Record<string, string>;

/** The card the visitor edits. It is not part of the example vault. */
export const CARD = "notes.hmd";

export const START = `# Notes

A [[token]] is defined once, in the glossary, and embedded here:

![[token#^definition]]

Its lifetime is [[/shared/tokens#Rotation|the rotation window]].
[[idempotency]] is not written yet.
`;

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A card's blocks as HTML. An embed stays an embed, labelled with its source. */
function blocksToHtml(blocks: readonly Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "html":
          return block.html;
        case "embed": {
          const label = escapeText(block.target.raw.replace(/^!\[\[/, "").replace(/\]\]$/, ""));
          if (block.document === null) {
            const why = escapeText(block.failure ?? block.resolution.state);
            return `<div class="hmd-embed hmd-embed--failed"><p class="hmd-embed__from">${label}</p><p>${why}</p></div>`;
          }
          return `<div class="hmd-embed"><p class="hmd-embed__from">${label}</p>${blocksToHtml(block.document.blocks)}</div>`;
        }
        case "diagram":
          return `<div class="hmd-diagram--placeholder"><p class="hmd-diagram__note">${escapeText(block.language)} source. The editor and the site build draw it.</p><pre><code>${escapeText(block.source)}</code></pre></div>`;
        case "cell": {
          const output = block.output === null ? "" : blocksToHtml(block.output.blocks);
          return `<div class="hmd-live__cell"><p class="hmd-diagram__note">${escapeText(block.language)} cell. HQL runs it in the editor or from the command line.</p><pre><code>${escapeText(block.source)}</code></pre>${output}</div>`;
        }
      }
    })
    .join("");
}

function diagnosticLine(d: Diagnostic): string {
  return `${d.path}:${d.line}:${d.column}: ${d.severity}[${d.rule}] ${d.message}`;
}

export interface Result {
  html: string;
  diagnostics: string[];
  errors: number;
  warnings: number;
}

/** Render and lint the edited card against the example vault. */
export async function run(source: string): Promise<Result> {
  const workspace = await Workspace.load(
    MemoryHost.from({ ...__HMD_DEMO_VAULT__, [CARD]: source }),
  );
  const found = check(workspace, [CARD]);
  const document = new Renderer(workspace).render(CARD);
  return {
    html: document === null ? "" : blocksToHtml(document.blocks),
    diagnostics: found.map(diagnosticLine),
    errors: found.filter((d) => d.severity === "error").length,
    warnings: found.filter((d) => d.severity === "warning").length,
  };
}

/** The other cards in the vault, for the list under the editor. */
export function cards(): string[] {
  return Object.keys(__HMD_DEMO_VAULT__).sort();
}
