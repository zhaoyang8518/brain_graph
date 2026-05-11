import Graph from "graphology";
import { applyGraphVisualEncoding } from "./visualEncoding";

export type GraphNode = {
  id: string;
  label: string;
  frequency: number;
  pagerank: number;
  bridgeScore: number;
  community: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

export type GraphInsight = {
  kind: "bridge" | "gap" | "topic";
  title: string;
  detail: string;
};

export type BrainGraph = {
  graph: Graph;
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: GraphInsight[];
  stats: {
    terms: number;
    links: number;
    communities: number;
    density: number;
  };
};

export type StoredBrainGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: GraphInsight[];
  stats: BrainGraph["stats"];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "like",
  "in",
  "is",
  "it",
  "not",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
  "you",
  "your",
  "一个",
  "一种",
  "以及",
  "不是",
  "为了",
  "他们",
  "但是",
  "作为",
  "使用",
  "关于",
  "其中",
  "可以",
  "因为",
  "如果",
  "我们",
  "所以",
  "或者",
  "这个",
  "这些",
  "通过",
  "进行",
  "需要"
]);

export function buildBrainGraph(text: string, windowSize = 4): BrainGraph {
  return buildBrainGraphFromTerms(tokenize(text), windowSize);
}

export function buildBrainGraphFromTerms(terms: string[], windowSize = 4): BrainGraph {
  const tokens = normalizeTerms(terms);
  const frequencies = new Map<string, number>();
  const edgeWeights = new Map<string, number>();

  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const upper = Math.min(tokens.length, index + windowSize);
    for (let next = index + 1; next < upper; next += 1) {
      const other = tokens[next];
      if (current === other) continue;
      const [source, target] = [current, other].sort();
      const key = `${source}\u0000${target}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }
  }

  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const [term, frequency] of frequencies) graph.addNode(term, { label: term, frequency });

  const edges: GraphEdge[] = [];
  for (const [key, weight] of edgeWeights) {
    const [source, target] = key.split("\u0000");
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
    graph.addUndirectedEdgeWithKey(key, source, target, { weight });
    edges.push({ source, target, weight });
  }

  const pagerank = computePageRank(graph);
  const communities = detectCommunities(graph);
  const bridgeScores = computeBridgeScores(graph, communities);
  const nodes: GraphNode[] = graph.nodes().map((id) => ({
    id,
    label: id,
    frequency: graph.getNodeAttribute(id, "frequency"),
    pagerank: pagerank.get(id) ?? 0,
    bridgeScore: bridgeScores.get(id) ?? 0,
    community: communities.get(id) ?? 0
  }));

  nodes.sort((a, b) => b.pagerank - a.pagerank);
  writeLayout(graph, nodes, edges);
  applyGraphVisualEncoding(graph, nodes, edges, "community");

  const communityCount = new Set(nodes.map((node) => node.community)).size;
  return {
    graph,
    nodes,
    edges,
    insights: makeInsights(nodes, edges, communityCount),
    stats: {
      terms: nodes.length,
      links: edges.length,
      communities: communityCount,
      density: nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0
    }
  };
}

export function serializeBrainGraph(brainGraph: BrainGraph): StoredBrainGraph {
  return {
    nodes: brainGraph.nodes,
    edges: brainGraph.edges,
    insights: brainGraph.insights,
    stats: brainGraph.stats
  };
}

export function hydrateBrainGraph(stored: StoredBrainGraph): BrainGraph {
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const node of stored.nodes) {
    graph.addNode(node.id, {
      label: node.label,
      frequency: node.frequency,
      pagerank: node.pagerank,
      bridgeScore: node.bridgeScore,
      community: node.community
    });
  }
  for (const edge of stored.edges) {
    const key = [edge.source, edge.target].sort().join("\u0000");
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target) && !graph.hasEdge(key)) {
      graph.addUndirectedEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight });
    }
  }
  writeLayout(graph, stored.nodes, stored.edges);
  applyGraphVisualEncoding(graph, stored.nodes, stored.edges, "community");
  return {
    graph,
    nodes: stored.nodes,
    edges: stored.edges,
    insights: stored.insights,
    stats: stored.stats
  };
}

function normalizeTerms(terms: string[]): string[] {
  return terms
    .map((term) => term.trim().toLowerCase())
    .map((term) => term.replace(/\s+/g, " "))
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .slice(0, 3000);
}

function tokenize(text: string): string[] {
  const matches = text
    .toLowerCase()
    .replace(/[_/\\|+*=<>{}[\]()`"'.,!?;:，。！？；：（）【】《》]/g, " ")
    .match(/[\p{Script=Han}]{2,}|[a-z][a-z0-9-]{2,}/gu);

  return (matches ?? [])
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .slice(0, 3000);
}

function computePageRank(graph: Graph): Map<string, number> {
  const nodes = graph.nodes();
  const score = new Map(nodes.map((node) => [node, 1 / Math.max(nodes.length, 1)]));
  const damping = 0.85;

  for (let iteration = 0; iteration < 30; iteration += 1) {
    const next = new Map(nodes.map((node) => [node, (1 - damping) / Math.max(nodes.length, 1)]));
    for (const node of nodes) {
      const neighbors = graph.neighbors(node);
      if (neighbors.length === 0) continue;
      const share = (score.get(node) ?? 0) / neighbors.length;
      for (const neighbor of neighbors) next.set(neighbor, (next.get(neighbor) ?? 0) + damping * share);
    }
    for (const node of nodes) score.set(node, next.get(node) ?? 0);
  }

  return score;
}

function detectCommunities(graph: Graph): Map<string, number> {
  const nodes = graph.nodes().sort((a, b) => graph.degree(b) - graph.degree(a));
  const labels = new Map(nodes.map((node, index) => [node, index]));

  for (let iteration = 0; iteration < 12; iteration += 1) {
    let changed = false;
    for (const node of nodes) {
      const scores = new Map<number, number>();
      for (const neighbor of graph.neighbors(node)) {
        const label = labels.get(neighbor) ?? 0;
        const edge = graph.edge(node, neighbor);
        const weight = edge ? Number(graph.getEdgeAttribute(edge, "weight") ?? 1) : 1;
        scores.set(label, (scores.get(label) ?? 0) + weight);
      }
      const best = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      if (best !== undefined && best !== labels.get(node)) {
        labels.set(node, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const denseIds = new Map<number, number>();
  let next = 0;
  const communities = new Map<string, number>();
  for (const node of nodes) {
    const label = labels.get(node) ?? 0;
    if (!denseIds.has(label)) denseIds.set(label, next++);
    communities.set(node, denseIds.get(label) ?? 0);
  }
  return communities;
}

function computeBridgeScores(graph: Graph, communities: Map<string, number>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const node of graph.nodes()) {
    const neighborCommunities = new Set(graph.neighbors(node).map((neighbor) => communities.get(neighbor) ?? 0));
    scores.set(node, Math.max(0, neighborCommunities.size - 1) * Math.log2(graph.degree(node) + 1));
  }
  return scores;
}

function writeLayout(graph: Graph, nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const positions = new Map<string, { x: number; y: number }>();
  const velocities = new Map<string, { x: number; y: number }>();
  const radius = Math.max(6, Math.sqrt(nodes.length) * 4);
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    velocities.set(node.id, { x: 0, y: 0 });
  });

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const temperature = 0.12 * (1 - iteration / 180);
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = positions.get(a.id)!;
        const pb = positions.get(b.id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const distanceSq = Math.max(0.01, dx * dx + dy * dy);
        const force = (a.community === b.community ? 4 : 10) / distanceSq;
        const distance = Math.sqrt(distanceSq);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        velocities.get(a.id)!.x += fx;
        velocities.get(a.id)!.y += fy;
        velocities.get(b.id)!.x -= fx;
        velocities.get(b.id)!.y -= fy;
      }
    }

    for (const edge of edges) {
      const source = nodes[nodeIndex.get(edge.source) ?? -1];
      const target = nodes[nodeIndex.get(edge.target) ?? -1];
      if (!source || !target) continue;
      const ps = positions.get(source.id)!;
      const pt = positions.get(target.id)!;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
      const ideal = source.community === target.community ? 4 : 8;
      const force = (distance - ideal) * 0.015 * Math.log2(edge.weight + 2);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      velocities.get(source.id)!.x += fx;
      velocities.get(source.id)!.y += fy;
      velocities.get(target.id)!.x -= fx;
      velocities.get(target.id)!.y -= fy;
    }

    for (const node of nodes) {
      const pos = positions.get(node.id)!;
      const vel = velocities.get(node.id)!;
      pos.x += vel.x * temperature;
      pos.y += vel.y * temperature;
      vel.x *= 0.72;
      vel.y *= 0.72;
    }
  }

  for (const node of nodes) {
    const pos = positions.get(node.id)!;
    graph.setNodeAttribute(node.id, "x", pos.x);
    graph.setNodeAttribute(node.id, "y", pos.y);
  }

  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join("\u0000");
    graph.mergeEdgeAttributes(key, {
      size: Math.max(0.5, Math.log2(edge.weight + 1)),
      color: "rgba(100, 116, 139, 0.35)"
    });
  }
}

function makeInsights(nodes: GraphNode[], edges: GraphEdge[], communityCount: number): GraphInsight[] {
  const bridges = [...nodes].sort((a, b) => b.bridgeScore - a.bridgeScore).slice(0, 3);
  const hubs = nodes.slice(0, 5).map((node) => node.label).join(", ");
  const weakLinks = [...edges].sort((a, b) => a.weight - b.weight).slice(0, 3);

  return [
    {
      kind: "topic",
      title: "Dominant concepts",
      detail: hubs ? `Highest-ranked terms: ${hubs}.` : "Add more text to identify central concepts."
    },
    {
      kind: "bridge",
      title: "Bridge candidates",
      detail: bridges.some((node) => node.bridgeScore > 0)
        ? bridges.map((node) => `${node.label} connects ${node.bridgeScore.toFixed(1)} cross-topic paths`).join("; ")
        : "No strong bridge terms yet. The text may describe one compact theme."
    },
    {
      kind: "gap",
      title: "Structural gaps",
      detail:
        communityCount > 1
          ? `Detected ${communityCount} topic islands. Probe weak links such as ${weakLinks
              .map((edge) => `${edge.source} <> ${edge.target}`)
              .join(", ")}.`
          : "Only one topic island detected. Add contrasting material to reveal gaps."
    }
  ];
}
