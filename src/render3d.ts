import type { BrainGraph } from "./graph";
import {
  edgeColorByCommunity,
  edgeWidthByWeight,
  nodeColor,
  nodeSizeByFrequency,
  type NodeColorMode
} from "./visualEncoding";

type ForceGraph3DInstance = any;

export type Graph3DRenderer = {
  instance: ForceGraph3DInstance;
  refresh: () => void;
  destroy: () => void;
};

export async function render3DGraph(
  graph: BrainGraph,
  container: HTMLElement,
  colorMode: NodeColorMode,
  onNodeSelect: (nodeId: string) => void
): Promise<Graph3DRenderer> {
  container.replaceChildren();
  const { default: ForceGraph3D } = await import("3d-force-graph");

  const communityById = new Map(graph.nodes.map((node) => [node.id, node.community]));
  const data = {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      name: node.label,
      frequency: node.frequency,
      community: node.community,
      val: nodeSizeByFrequency(node.frequency),
      color: nodeColor(node, colorMode)
    })),
    links: graph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      value: edge.weight,
      color: edgeColorByCommunity(communityById.get(edge.source) ?? 0)
    }))
  };

  const createForceGraph = ForceGraph3D as unknown as () => ForceGraph3DInstance;
  const renderer: ForceGraph3DInstance = createForceGraph()(container)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .graphData(data)
    .backgroundColor("#09090b") // Match zinc-950
    .showNavInfo(false)
    .nodeLabel((node: any) => `${node.name}<br/>命中：${node.frequency}`)
    .nodeVal((node: any) => node.val)
    .nodeColor((node: any) => node.color)
    .linkColor((link: any) => link.color)
    .linkWidth((link: any) => edgeWidthByWeight(link.value))
    .linkOpacity(0.45)
    .onNodeClick((node: any) => {
      onNodeSelect(String(node.id));
      const distance = 80;
      const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      renderer.cameraPosition(
        {
          x: (node.x || 0) * distRatio,
          y: (node.y || 0) * distRatio,
          z: (node.z || 0) * distRatio
        },
        node,
        700
      );
    });

  const resizeObserver = new ResizeObserver(() => {
    renderer.width(container.clientWidth);
    renderer.height(container.clientHeight);
  });
  resizeObserver.observe(container);

  return {
    instance: renderer,
    refresh() {
      renderer.width(container.clientWidth);
      renderer.height(container.clientHeight);
    },
    destroy() {
      resizeObserver.disconnect();
      renderer._destructor?.();
      container.replaceChildren();
    }
  };
}
