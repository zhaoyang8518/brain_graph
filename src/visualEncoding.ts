import type Graph from "graphology";
import type { GraphEdge, GraphNode } from "./graph";

export type NodeColorMode = "community" | "frequency";

const COMMUNITY_COLORS = [
  "#3b82f6",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#8b5cf6",
  "#06b6d4",
  "#f43f5e",
  "#84cc16",
  "#6366f1",
  "#d946ef"
];

const FREQUENCY_STOPS = [
  { threshold: 2, color: "#64748b" },
  { threshold: 5, color: "#2563eb" },
  { threshold: 10, color: "#16a34a" },
  { threshold: 20, color: "#f59e0b" },
  { threshold: Number.POSITIVE_INFINITY, color: "#ef4444" }
];

export function applyGraphVisualEncoding(
  graph: Graph,
  nodes: GraphNode[],
  edges: GraphEdge[],
  colorMode: NodeColorMode
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    graph.mergeNodeAttributes(node.id, {
      size: nodeSizeByFrequency(node.frequency),
      color: nodeColor(node, colorMode),
      label: node.label,
      frequency: node.frequency,
      pagerank: node.pagerank,
      bridgeScore: node.bridgeScore,
      community: node.community
    });
  }

  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join("\u0000");
    if (!graph.hasEdge(key)) continue;
    const sourceNode = nodeById.get(edge.source);
    graph.mergeEdgeAttributes(key, {
      weight: edge.weight,
      size: edgeWidthByWeight(edge.weight),
      color: sourceNode ? edgeColorByCommunity(sourceNode.community) : "rgba(148, 163, 184, 0.35)"
    });
  }
}

export function nodeSizeByFrequency(frequency: number): number {
  return 7 + Math.sqrt(Math.max(1, frequency)) * 5;
}

export function nodeColor(node: GraphNode, mode: NodeColorMode): string {
  if (mode === "frequency") return colorByFrequency(node.frequency);
  return colorByCommunity(node.community);
}

export function colorByCommunity(community: number): string {
  return COMMUNITY_COLORS[Math.abs(community) % COMMUNITY_COLORS.length];
}

export function edgeColorByCommunity(community: number): string {
  const hex = colorByCommunity(community).replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.78)`;
}

export function colorByFrequency(frequency: number): string {
  return FREQUENCY_STOPS.find((stop) => frequency <= stop.threshold)?.color ?? "#ef4444";
}

export function edgeWidthByWeight(weight: number): number {
  return Math.max(1.2, Math.log2(Math.max(1, weight) + 1) * 1.6);
}
