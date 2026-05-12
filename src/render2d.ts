import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { BrainGraph } from "./graph";

export type Graph2DRenderer = {
  refresh: () => void;
  setHighlightedNode: (nodeId: string | null) => void;
  destroy: () => void;
};

export function render2DGraph(
  graph: BrainGraph,
  container: HTMLElement,
  onNodeSelect: (nodeId: string) => void,
  onNodeContextMenu?: (nodeId: string, position: { x: number; y: number }) => void
): Graph2DRenderer {
  container.replaceChildren();
  container.style.background = "#363636ff";

  // 1. Initialize Graphology Graph
  const g = new Graph();

  // 2. Add Nodes
  graph.nodes.forEach((node) => {
    g.addNode(node.id, {
      label: node.label,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.max(5, Math.min(25, (node.pagerank * 150) + 5)),
      color: node.color ?? "#60a5fa",
    });
  });

  // 3. Add Edges
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  const edgeColor = "rgba(33, 33, 33, 0.08)";
  const edgeHoverColor = "rgba(85, 85, 85, 0.3)";

  graph.edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      const edgeId = `${edge.source}-${edge.target}`;
      if (!g.hasEdge(edgeId)) {
        g.addEdgeWithKey(edgeId, edge.source, edge.target, {
          size: 0.4,
          color: edgeColor,
        });
      }
    }
  });

  // 4. Initial Layout (Circular) to avoid overlapping before FA2
  // or just let FA2 handle it from random

  // 5. Initialize Sigma Renderer
  const renderer = new Sigma(g, container, {
    minCameraRatio: 0.1,
    maxCameraRatio: 10,
    labelFont: "Inter, system-ui, sans-serif",
    labelWeight: "600",
    labelColor: { color: "#e5e7eb" },
    renderEdgeLabels: false,
    defaultEdgeType: "line",
  });

  // 6. Run ForceAtlas2 Layout
  // We run it synchronously for a few iterations or use the dynamic one
  const layoutSettings = forceAtlas2.inferSettings(g);

  // Start the layout
  let layoutInterval: any = null;

  // For small graphs, run it once. For large, run it incrementally.
  if (g.order < 500) {
    forceAtlas2.assign(g, { iterations: 100, settings: layoutSettings });
    renderer.refresh();
  } else {
    // Large graphs: start continuous layout
    forceAtlas2.assign(g, { iterations: 50, settings: layoutSettings });
    // We can also start a worker or just run it periodically
    // But for a better UX, let's just do a heavy initial pass
  }

  // 7. Interaction
  renderer.on("clickNode", ({ node }) => {
    onNodeSelect(node);
  });
  renderer.on("rightClickNode", ({ node, event }: any) => {
    const original = event?.original ?? event;
    original?.preventDefault?.();
    onNodeContextMenu?.(node, {
      x: Number(original?.clientX ?? event?.x ?? 0),
      y: Number(original?.clientY ?? event?.y ?? 0)
    });
  });
  container.addEventListener("contextmenu", (event) => event.preventDefault());

  // 8. Hover effect (optional enhancement)
  let hoveredNode: string | null = null;
  renderer.on("enterNode", ({ node }) => {
    hoveredNode = node;
    renderer.refresh();
  });
  renderer.on("leaveNode", () => {
    hoveredNode = null;
    renderer.refresh();
  });

  // Custom Reducer for visual effects (like highlighting)
  renderer.setSetting("nodeReducer", (node, data) => {
    const res = { ...data };
    if (hoveredNode && node !== hoveredNode && !g.areNeighbors(node, hoveredNode)) {
      res.color = "rgba(100, 116, 139, 0.2)";
      res.label = "";
    }
    return res;
  });

  renderer.setSetting("edgeReducer", (edge, data) => {
    const res = { ...data };
    if (hoveredNode) {
      if (g.hasExtremity(edge, hoveredNode)) {
        res.color = edgeHoverColor;
        res.size = (data.size || 1) * 2;
      } else {
        res.hidden = true;
      }
    }
    return res;
  });

  // 9. Resize Handling
  const resizeObserver = new ResizeObserver(() => {
    renderer.refresh();
  });
  resizeObserver.observe(container);

  return {
    refresh() {
      renderer.refresh();
    },
    setHighlightedNode(nodeId: string | null) {
      hoveredNode = nodeId;
      renderer.refresh();
    },
    destroy() {
      if (layoutInterval) clearInterval(layoutInterval);
      resizeObserver.disconnect();
      renderer.kill();
      container.replaceChildren();
    }
  };
}
