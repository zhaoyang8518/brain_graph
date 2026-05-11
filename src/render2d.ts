import Sigma from "sigma";
import type { BrainGraph } from "./graph";

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

  const renderer = new Sigma(graph.graph, container, {
    renderEdgeLabels: false,
    labelDensity: 0.08,
    labelGridCellSize: 90,
    hideEdgesOnMove: false,
    defaultEdgeType: "line",
    defaultNodeType: "circle",
    minCameraRatio: 0.1,
    maxCameraRatio: 8
  });

  renderer.on("clickNode", ({ node }) => onNodeSelect(node));

  const resizeObserver = new ResizeObserver(() => {
    renderer.refresh();
  });
  resizeObserver.observe(container);

  return {
    refresh() {
      renderer.refresh();
    },
    destroy() {
      resizeObserver.disconnect();
      renderer.kill();
      container.replaceChildren();
    }
  };
}
