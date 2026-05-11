import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { BrainGraph } from "./graph";
import { edgeWidthByWeight } from "./visualEncoding";

export type Graph2DRenderer = {
  refresh: () => void;
  destroy: () => void;
};

export function render2DGraph(
  graph: BrainGraph,
  container: HTMLElement,
  onNodeSelect: (nodeId: string) => void
): Graph2DRenderer {
  container.replaceChildren();
  container.style.background = "#09090b";

  const maxPagerank = Math.max(...graph.nodes.map((node) => node.pagerank), 0);
  const importantLabels = new Set(
    [...graph.nodes]
      .sort((a, b) => b.pagerank - a.pagerank || b.frequency - a.frequency)
      .slice(0, 60)
      .map((node) => node.id)
  );
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const elements: ElementDefinition[] = [
    ...graph.nodes.map((node) => ({
      group: "nodes" as const,
      data: {
        id: node.id,
        label: node.label,
        color: node.color ?? "#60a5fa",
        size: Math.max(18, Math.min(58, node.size ?? 24)),
        frequency: node.frequency,
        pagerank: node.pagerank,
        labelVisible: importantLabels.has(node.id) ? node.label : ""
      }
    })),
    ...graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).map((edge) => ({
      group: "edges" as const,
      data: {
        id: `${edge.source}\u0000${edge.target}`,
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        width: edgeWidthByWeight(edge.weight),
        opacity: Math.max(0.18, Math.min(0.72, 0.16 + edge.weight * 0.08))
      }
    }))
  ];

  const cy: Core = cytoscape({
    container,
    elements,
    minZoom: 0.08,
    maxZoom: 4,
    wheelSensitivity: 0.18,
    textureOnViewport: false,
    hideEdgesOnViewport: false,
    hideLabelsOnViewport: graph.nodes.length > 260,
    autoungrabify: graph.nodes.length > 300,
    pixelRatio: 1,
    style: [
      {
        selector: "core",
        style: {
          "selection-box-color": "#60a5fa",
          "selection-box-border-color": "#bfdbfe",
          "selection-box-border-width": 1,
          "selection-box-opacity": 0.16,
          "active-bg-color": "#60a5fa",
          "active-bg-opacity": 0.12,
          "active-bg-size": 40,
          "outside-texture-bg-color": "#09090b",
          "outside-texture-bg-opacity": 1
        }
      },
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          width: "data(size)",
          height: "data(size)",
          "border-width": 1.5,
          "border-color": "rgba(248,250,252,0.85)",
          label: "data(labelVisible)",
          color: "#e5e7eb",
          "font-size": 10,
          "font-weight": 600,
          "text-outline-color": "#09090b",
          "text-outline-width": 2,
          "text-valign": "center",
          "text-halign": "center",
          "overlay-opacity": 0,
          "transition-property": "background-color, border-width, width, height",
          "transition-duration": 120
        }
      },
      {
        selector: "node[pagerank > " + Math.max(maxPagerank * 0.65, 0.0001) + "]",
        style: {
          "font-size": 12
        }
      },
      {
        selector: "edge",
        style: {
          width: "data(width)",
          "line-color": "rgba(148,163,184,0.42)",
          "target-arrow-color": "rgba(148,163,184,0.42)",
          opacity: 0.42,
          "curve-style": "straight",
          "overlay-opacity": 0
        }
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 4,
          "border-color": "#f8fafc"
        }
      },
      {
        selector: "node:selected, node:selected ~ node",
        style: {
          "z-index": 10
        }
      },
      {
        selector: ".faded",
        style: {
          opacity: 0.18
        }
      },
      {
        selector: ".neighbor",
        style: {
          opacity: 1
        }
      }
    ],
    layout: {
      name: "grid",
      animate: false,
      fit: true,
      padding: 48
    } as any
  });

  requestAnimationFrame(() => {
    cy.resize();
    cy.fit(undefined, 48);
    if (graph.nodes.length <= 220) {
      cy.layout({
        name: "cose",
        animate: false,
        fit: true,
        padding: 48,
        idealEdgeLength: 90,
        nodeRepulsion: 9000,
        edgeElasticity: 90,
        gravity: 0.16,
        numIter: 600,
        randomize: false
      } as any).run();
    }
  });

  cy.on("tap", "node", (event) => {
    const node = event.target;
    onNodeSelect(node.id());
    cy.elements().addClass("faded");
    node.removeClass("faded").addClass("neighbor");
    node.neighborhood().removeClass("faded").addClass("neighbor");
  });
  cy.on("tap", (event) => {
    if (event.target === cy) {
      cy.elements().removeClass("faded neighbor");
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    cy.resize();
    cy.fit(undefined, 48);
  });
  resizeObserver.observe(container);

  return {
    refresh() {
      cy.resize();
      cy.fit(undefined, 48);
    },
    destroy() {
      resizeObserver.disconnect();
      cy.destroy();
      container.replaceChildren();
    }
  };
}
