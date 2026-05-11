import type { BrainGraph } from "./graph";
import * as THREE from "three";
import {
  edgeColorByCommunity,
  edgeWidthByWeight,
  nodeColor,
  nodeSizeByFrequency,
  type NodeColorMode
} from "./visualEncoding";

type ForceGraph3DInstance = any;
type SpriteTextConstructor = new (text?: string) => any;

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
  const nodeCount = Math.max(1, graph.nodes.length);
  const isLargeGraph = nodeCount > 120 || graph.edges.length > 450;
  const spread = nodeCount <= 12 ? 2.2 : nodeCount <= 40 ? 1.55 : 1;
  const data = {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      name: node.label,
      frequency: node.frequency,
      community: node.community,
      val: nodeSizeByFrequency(node.frequency) * (nodeCount <= 12 ? 1.35 : 1),
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
    .backgroundColor("#363636ff") // Match zinc-950
    .showNavInfo(false)
    .nodeLabel((node: any) => `${node.name}<br/>命中：${node.frequency}`)
    .nodeVal((node: any) => node.val)
    .nodeColor((node: any) => node.color)
    .linkColor((link: any) => link.color)
    .linkWidth((link: any) => edgeWidthByWeight(link.value))
    .linkOpacity(isLargeGraph ? 0.24 : 0.45)
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

  if (!isLargeGraph) {
    const { default: SpriteText } = await import("three-spritetext") as { default: SpriteTextConstructor };
    renderer
      .nodeThreeObject((node: any) => {
        const group = new THREE.Group();
        const radius = Math.max(5.5, Math.min(18, node.val * 0.55));
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 24, 24),
          new THREE.MeshLambertMaterial({
            color: node.color,
            transparent: true,
            opacity: 0.92
          })
        );
        group.add(sphere);

        const label = new SpriteText(node.name);
        label.material.depthWrite = false;
        label.color = "#f8fafc";
        label.textHeight = nodeCount <= 12 ? 5.8 : 4.2;
        label.center.y = -1.2;
        label.position.y = radius + label.textHeight * 0.85;
        group.add(label);

        return group;
      })
      .nodeThreeObjectExtend(false);
  }

  renderer.d3Force("charge")?.strength(-120 * spread);
  renderer.d3Force("link")?.distance((link: any) => {
    const weight = Number(link.value ?? 1);
    if (isLargeGraph) return 35 / Math.sqrt(Math.max(1, weight));
    return (nodeCount <= 12 ? 100 : 62) / Math.sqrt(Math.max(1, weight));
  });
  renderer.d3Force("center")?.strength(0.04);
  renderer.cooldownTicks(isLargeGraph ? 80 : 160);
  renderer.warmupTicks(isLargeGraph ? 20 : 40);
  renderer.cameraPosition({ x: 0, y: 0, z: nodeCount <= 12 ? 360 : isLargeGraph ? 760 : 520 });

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
