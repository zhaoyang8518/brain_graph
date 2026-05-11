import type Graph from "graphology";
import type { GraphEdge, GraphNode } from "./graph";

export type NodeColorMode = "community" | "frequency" | "kind";

const COMMUNITY_COLORS = [
  "#f97316", // Orange (to distinguish from default blue)
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

const KIND_COLORS: Record<string, string> = {
  Person: "#ef4444", // Red
  Organization: "#3b82f6", // Blue
  Technology: "#8b5cf6", // Purple
  Location: "#06b6d4", // Cyan
  Event: "#f59e0b", // Amber
  Metric: "#22c55e", // Green
  Idea: "#ec4899", // Pink
  Term: "#64748b", // Slate (for local analysis)
  Misc: "#94a3b8" // Light Slate
};

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
    const color = nodeColor(node, colorMode);
    const size = nodeSizeByFrequency(node.frequency);
    
    // Update object itself so it's available in the state array
    node.color = color;
    node.size = size;

    graph.mergeNodeAttributes(node.id, {
      size,
      color,
      label: node.label,
      kind: node.kind,
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
  if (mode === "frequency") return colorByFrequency(node.frequency || 1);
  if (mode === "kind") return colorByKind(node.kind || "Misc");
  
  // If community is missing or only one community exists, fallback to a ID-based color for differentiation
  if (node.community === undefined || node.community === null) {
    return COMMUNITY_COLORS[hashString(node.id) % COMMUNITY_COLORS.length];
  }
  
  return colorByCommunity(node.community);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function colorByKind(kind: string): string {
  return KIND_COLORS[kind] || KIND_COLORS.Misc;
}

export function colorByCommunity(community: number): string {
  const index = Math.abs(Math.floor(community || 0));
  return COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];
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
