import Graph from "graphology";

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

const COMMUNITY_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#65a30d",
  "#a16207"
];

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

  for (const node of nodes) {
    graph.mergeNodeAttributes(node.id, {
      size: 4 + Math.sqrt(node.frequency) * 2 + node.pagerank * 60,
      color: COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length],
      label: node.label,
      frequency: node.frequency,
      pagerank: node.pagerank,
      bridgeScore: node.bridgeScore,
      community: node.community
    });
  }

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
      community: node.community,
      size: 4 + Math.sqrt(node.frequency) * 2 + node.pagerank * 60,
      color: COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length]
    });
  }
  for (const edge of stored.edges) {
    const key = [edge.source, edge.target].sort().join("\u0000");
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target) && !graph.hasEdge(key)) {
      graph.addUndirectedEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight });
    }
  }
  writeLayout(graph, stored.nodes, stored.edges);
  for (const edge of stored.edges) {
    const key = [edge.source, edge.target].sort().join("\u0000");
    if (graph.hasEdge(key)) {
      graph.mergeEdgeAttributes(key, {
        weight: edge.weight,
        size: Math.max(0.5, Math.log2(edge.weight + 1)),
        color: "rgba(100, 116, 139, 0.35)"
      });
    }
  }
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
  const visited = new Set<string>();
  const communities = new Map<string, number>();
  let community = 0;

  for (const start of graph.nodes().sort((a, b) => graph.degree(b) - graph.degree(a))) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const node = queue.shift() as string;
      communities.set(node, community);
      for (const neighbor of graph.neighbors(node).sort((a, b) => graph.degree(b) - graph.degree(a))) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    community += 1;
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
  const communityBuckets = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const bucket = communityBuckets.get(node.community) ?? [];
    bucket.push(node);
    communityBuckets.set(node.community, bucket);
  }

  const communities = [...communityBuckets.entries()];
  communities.forEach(([, bucket], communityIndex) => {
    const centerAngle = (Math.PI * 2 * communityIndex) / Math.max(communities.length, 1);
    const centerRadius = communities.length > 1 ? 8 : 0;
    const centerX = Math.cos(centerAngle) * centerRadius;
    const centerY = Math.sin(centerAngle) * centerRadius;

    bucket.forEach((node, nodeIndex) => {
      const angle = (Math.PI * 2 * nodeIndex) / Math.max(bucket.length, 1);
      const radius = 1.5 + Math.sqrt(bucket.length);
      graph.setNodeAttribute(node.id, "x", centerX + Math.cos(angle) * radius);
      graph.setNodeAttribute(node.id, "y", centerY + Math.sin(angle) * radius);
    });
  });

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
