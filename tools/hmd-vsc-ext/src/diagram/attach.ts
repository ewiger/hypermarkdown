/**
 * Drawing every diagram in an IR (HMD-0022, HMD-0030).
 *
 * Done by the extension host rather than in the core because rendering needs a
 * subprocess, which the core cannot run. Free of the `vscode` API, so it is
 * exercised with an engine and a document.
 */

import {
  diagramEngine,
  diagramKey,
  isDiagramCell,
  type DocumentIR,
} from "@hypermarkdown/core";

import type { DiagramEngine } from "./engine.js";

/** What each diagram cell of one preview last showed, by the cell's place. */
export type DiagramDrawings = Map<string, { dataUri: string; drawnFrom: string }>;

/**
 * Draw the diagrams of `ir`, of the cards it embeds, and of its cells' outputs.
 *
 * `drawings` is one preview's memory of what each diagram cell last showed. A
 * cell whose source no longer draws keeps that drawing, marked as not current,
 * with the reason beside it: an author in the middle of an edit goes on seeing
 * the diagram they are changing. A plain `d2` fence has no such memory, and
 * shows its source when it does not draw.
 */
export async function attachDiagrams(
  ir: DocumentIR,
  engine: DiagramEngine,
  drawings?: DiagramDrawings,
  scope = "",
): Promise<DocumentIR> {
  const blocks = await Promise.all(
    ir.blocks.map(async (block) => {
      if (block.kind === "embed" && block.document !== null) {
        const inner = `${scope}${ir.path}>${block.key}>`;
        return { ...block, document: await attachDiagrams(block.document, engine, drawings, inner) };
      }
      // A cell's output can carry a diagram — HQL writes a graph as a `d2`
      // fence — and it is drawn like one written by hand.
      if (block.kind === "cell" && block.output !== null) {
        const inner = await attachDiagrams(
          { ...ir, blocks: block.output.blocks },
          engine,
          drawings,
          `${scope}${ir.path}>${block.key}>`,
        );
        return { ...block, output: { ...block.output, blocks: inner.blocks } };
      }
      if (block.kind !== "diagram") return block;

      const name = diagramEngine(block.language);
      if (name === null) return block;
      const { dataUri, failure } = await engine.render(block.source, name);
      const drawnFrom = diagramKey(block.source);
      if (dataUri !== null) {
        if (isDiagramCell(block.language)) {
          drawings?.set(`${scope}${ir.path}|${block.key}`, { dataUri, drawnFrom });
        }
        return { ...block, dataUri, drawnFrom, current: true, failure: null };
      }

      const last = isDiagramCell(block.language)
        ? drawings?.get(`${scope}${ir.path}|${block.key}`)
        : undefined;
      return last === undefined
        ? { ...block, dataUri: null, drawnFrom: null, current: false, failure }
        : { ...block, dataUri: last.dataUri, drawnFrom: last.drawnFrom, current: false, failure };
    }),
  );
  return { ...ir, blocks };
}
