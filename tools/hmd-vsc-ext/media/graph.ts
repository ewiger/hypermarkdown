/**
 * The graph tab: drawing, input, and nothing about which cards are in it.
 *
 * Specified in HMD-0025.
 *
 * Cytoscape is compiled into this bundle rather than fetched: the webview's CSP
 * forbids both remote script and `eval`, so a CDN copy and a runtime loader are
 * equally unavailable. Which cards are in the picture was decided in the host,
 * where the index lives; this file never asks.
 */

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

import type { GraphDirection, GraphPayload, GraphScope, GraphView } from "../src/protocol.js";

/** What the tab can ask the rest of the webview to do. */
export interface GraphApi {
  /** Navigate the preview to a card, as clicking a link in it would. */
  open(path: string): void;
  /** Ask the host for a different cut of the graph. */
  setView(view: GraphView): void;
  /** Ask the editor to stand its own chrome down, or to put it back. */
  setFullScreen(on: boolean): void;
}

const LAYOUT = {
  name: "cose",
  // A layout that animates is a layout that is wrong for the first second, and
  // this one is re-run every time the tab is shown.
  animate: false,
  nodeDimensionsIncludeLabels: true,
  padding: 24,
} as const;

/** The class the shell carries while the graph has the whole panel. */
const FULL_SCREEN = "is-graph-fullscreen";

export class GraphTab {
  private cy: Core | null = null;
  private view: GraphView;
  private readonly canvas: HTMLElement;
  private readonly note: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly api: GraphApi,
    initial: GraphView,
  ) {
    this.view = initial;
    this.canvas = root.querySelector<HTMLElement>(".hmd-graph-canvas")!;
    this.note = root.querySelector<HTMLElement>(".hmd-graph-note")!;
    this.wireToolbar();
    this.markControls();

    // Escape is how every full-screen surface is left, and a reader who has
    // hidden the tab strip has hidden the way back to it.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isFullScreen()) this.setFullScreen(false);
    });
  }

  /** Draw a payload from the host, keeping the viewport if the cards are the same. */
  update(payload: GraphPayload): void {
    this.view = payload.view;
    this.markControls();
    this.note.textContent = describe(payload);

    const cy = this.ensure();
    const next = elementsOf(payload);
    const unchanged = sameElements(cy, next);
    cy.json({ elements: next });
    cy.style(styleSheet());
    // Re-laying out an unchanged graph throws away a viewport the reader
    // arranged, and a keystroke in the editor is enough to send this message.
    if (!unchanged) this.runLayout();
  }

  /**
   * Bring the tab on screen.
   *
   * The layout is recomputed here because `retainContextWhenHidden` is off and
   * a container that was hidden has no size to lay anything out in.
   */
  show(): void {
    this.root.hidden = false;
    const cy = this.cy;
    if (cy === null) return;
    cy.resize();
    this.runLayout();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private ensure(): Core {
    if (this.cy !== null) return this.cy;
    const cy = cytoscape({
      container: this.canvas,
      style: styleSheet(),
      // Panning and zooming are the whole interaction; box selection is not.
      boxSelectionEnabled: false,
      wheelSensitivity: 0.2,
    });
    // A card is opened by clicking it, exactly as a link in the rendered tab
    // is: the preview moves there and its source opens alongside.
    cy.on("tap", "node", (event) => {
      const path = event.target.id();
      if (typeof path === "string" && path !== "") this.api.open(path);
    });
    this.cy = cy;
    return cy;
  }

  private runLayout(): void {
    this.cy?.layout(LAYOUT).run();
  }

  private wireToolbar(): void {
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>("[data-scope]"))) {
      button.addEventListener("click", () => {
        this.api.setView({ ...this.view, scope: button.dataset["scope"] as GraphScope });
      });
    }
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>("[data-direction]"))) {
      button.addEventListener("click", () => {
        this.api.setView({
          ...this.view,
          direction: button.dataset["direction"] as GraphDirection,
        });
      });
    }
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>("[data-action]"))) {
      button.addEventListener("click", () => {
        const cy = this.cy;
        if (cy === null) return;
        switch (button.dataset["action"]) {
          case "zoom-in":
            cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: centreOf(this.canvas) });
            return;
          case "zoom-out":
            cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: centreOf(this.canvas) });
            return;
          case "fit":
            cy.fit(undefined, LAYOUT.padding);
            return;
          case "layout":
            this.runLayout();
            return;
          case "fullscreen":
            this.setFullScreen(!this.isFullScreen());
            return;
          default:
            return;
        }
      });
    }
  }

  private isFullScreen(): boolean {
    return document.body.classList.contains(FULL_SCREEN);
  }

  /**
   * Give the graph the whole panel, or give the chrome back.
   *
   * A graph is read at the size it is drawn, and a large network in a preview
   * column is unreadable. The webview stands its own chrome down here and asks
   * the host to stand the editor's down too, so what is left on screen is the
   * canvas and the toolbar over it.
   */
  private setFullScreen(on: boolean): void {
    document.body.classList.toggle(FULL_SCREEN, on);
    this.api.setFullScreen(on);
    const button = this.root.querySelector<HTMLElement>('[data-action="fullscreen"]');
    if (button !== null) {
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "Exit full screen" : "Full screen";
      button.classList.toggle("is-active", on);
    }
    const cy = this.cy;
    if (cy === null) return;
    // The container changed size under the canvas, which cytoscape learns only
    // when told; refitting keeps the same cards in view at the new size.
    cy.resize();
    cy.fit(undefined, LAYOUT.padding);
  }

  /** Show which scope and direction are live, and grey out what is moot. */
  private markControls(): void {
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>("[data-scope]"))) {
      const active = button.dataset["scope"] === this.view.scope;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    }
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>("[data-direction]"))) {
      const active = button.dataset["direction"] === this.view.direction;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
      // The network scope has no direction to point in. Hiding the control
      // would move the toolbar under the reader's cursor; disabling it says
      // the same thing and stays where it was.
      (button as HTMLButtonElement).disabled = this.view.scope === "network";
    }
  }
}

/** What the note under the canvas says, including what the cap left out. */
export function describe(payload: GraphPayload): string {
  if (payload.focus === null) return "No card to draw.";
  if (payload.nodes.length === 0) return "This card has no resolved links.";

  const cards = payload.nodes.length === 1 ? "1 card" : `${payload.nodes.length} cards`;
  const shape =
    payload.view.scope === "network"
      ? "the whole vault"
      : payload.view.direction === "upstream"
        ? "what this card links to"
        : "what links to this card";

  if (payload.omitted > 0) {
    return `${cards} — ${shape}, nearest this one. ${payload.omitted} further cards are not drawn.`;
  }
  return `${cards} — ${shape}.`;
}

export function elementsOf(payload: GraphPayload): ElementDefinition[] {
  const elements: ElementDefinition[] = payload.nodes.map((node) => ({
    group: "nodes",
    data: {
      id: node.path,
      label: node.label,
      focus: node.path === payload.focus ? "yes" : "no",
    },
  }));

  for (const edge of payload.edges) {
    elements.push({
      group: "edges",
      data: {
        id: `${edge.source} ${edge.kind} ${edge.target}`,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
      },
    });
  }
  return elements;
}

/** True when the graph already holds exactly these nodes and edges. */
function sameElements(cy: Core, elements: readonly ElementDefinition[]): boolean {
  if (cy.elements().length !== elements.length) return false;
  return elements.every((element) => cy.getElementById(String(element.data.id)).nonempty());
}

/**
 * The stylesheet, in the theme's own colours.
 *
 * Cytoscape draws to a canvas, so it cannot inherit a CSS variable the way the
 * rest of the webview does; the values are read out of the document each time
 * the graph is drawn, which is also how a theme change reaches it.
 */
function styleSheet(): cytoscape.StylesheetJson {
  const theme = getComputedStyle(document.body);
  const read = (name: string, fallback: string): string => {
    const value = theme.getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };

  const foreground = read("--vscode-foreground", "#cccccc");
  const border = read("--vscode-panel-border", "#454545");
  const link = read("--vscode-textLink-foreground", "#3794ff");
  const accent = read("--vscode-focusBorder", "#007fd4");
  const surface = read("--vscode-editorWidget-background", "#252526");

  return [
    {
      selector: "node",
      style: {
        "background-color": surface,
        "border-width": 1,
        "border-color": border,
        label: "data(label)",
        color: foreground,
        "font-family": read("--vscode-font-family", "sans-serif"),
        "font-size": 11,
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "ellipsis",
        "text-max-width": "120px",
        shape: "round-rectangle",
        width: "label",
        height: 24,
        padding: "8px",
      },
    },
    {
      selector: 'node[focus = "yes"]',
      style: {
        "border-width": 2,
        "border-color": accent,
        color: accent,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": border,
        "target-arrow-color": border,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
      },
    },
    {
      // A card quoted inside another is a stronger tie than a card mentioned in
      // it, and the two are worth telling apart at a glance.
      selector: 'edge[kind = "embed"]',
      style: {
        width: 2,
        "line-color": link,
        "target-arrow-color": link,
      },
    },
  ];
}

function centreOf(element: HTMLElement): { x: number; y: number } {
  return { x: element.clientWidth / 2, y: element.clientHeight / 2 };
}
