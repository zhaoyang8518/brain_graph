import Graph from "graphology";
import { applyGraphVisualEncoding } from "./visualEncoding";
import { type TypedConcept, extractConceptsWithModel, type ModelSettings } from "./model";
import { buildProjectGraphInput, type ProjectInfo } from "./projects";
import { buildProjectEmbeddings, type EmbeddingSettings } from "./embedding";

const MODEL_REQUEST_TIMEOUT_SECONDS = 90;

export type GraphNode = {
  id: string;
  label: string;
  kind: string;
  frequency: number;
  pagerank: number;
  bridgeScore: number;
  community: number;
  color?: string;
  size?: number;
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

export type BuildProgressHandler = (percent: number, message: string, details?: string[]) => void;

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

const MODEL_CHUNK_SIZE = 8000;
const MAX_MODEL_CHUNKS = 24;
const MAX_GRAPH_NODES = 450;
const MAX_GRAPH_EDGES = 1400;

export async function buildBrainGraph(
  project: ProjectInfo,
  settings: ModelSettings,
  embeddingSettings: EmbeddingSettings,
  onProgress: BuildProgressHandler,
  rebuild = false
): Promise<BrainGraph> {
  onProgress(10, "Reading project documents...", [
    rebuild ? "Rebuild mode: clearing cached markdown before conversion." : "Incremental mode: reusing unchanged markdown files.",
    "Converting project documents to Markdown and preparing chunks."
  ]);
  const input = await buildProjectGraphInput(project.path, { rebuild });
  const backendChunks = (input.chunks ?? []).map((chunk) => chunk.text).filter(Boolean);
  const totalChunkChars = backendChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  onProgress(18, "Prepared Markdown chunks.", [
    `Readable documents: ${input.documentsRead}; skipped: ${input.documentsSkipped}.`,
    `Markdown chunks: ${backendChunks.length}; total chunk text: ${totalChunkChars.toLocaleString()} chars.`,
    `Source text available for summary: ${(input.text || "").length.toLocaleString()} chars.`
  ]);

  if (settings.enabled) {
    try {
      const chunks = (backendChunks.length ? backendChunks : chunkMarkdownText(input.text, MODEL_CHUNK_SIZE)).slice(0, MAX_MODEL_CHUNKS);
      const modelConcepts: TypedConcept[] = [];
      let extractedConcepts = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const percent = 25 + Math.round((index / Math.max(1, chunks.length)) * 45);
        const startedAt = Date.now();
        onProgress(percent, `Extracting concepts with ${settings.provider} (${index + 1}/${chunks.length})...`, [
          `Current chunk: ${(index + 1).toLocaleString()} / ${chunks.length.toLocaleString()}.`,
          `Chunk size: ${chunks[index].length.toLocaleString()} chars.`,
          `Concepts extracted so far: ${extractedConcepts.toLocaleString()}.`,
          `Request timeout: ${MODEL_REQUEST_TIMEOUT_SECONDS}s.`
        ]);
        const result = await extractConceptsWithModel(chunks[index], settings);
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        modelConcepts.push(...result.concepts);
        extractedConcepts = modelConcepts.length;
        onProgress(percent + 1, `Extracted concepts with ${settings.provider} (${index + 1}/${chunks.length})`, [
          `Elapsed: ${elapsedSeconds}s.`,
          `Latest chunk concepts: ${result.concepts.length.toLocaleString()}.`,
          `Total model concepts: ${extractedConcepts.toLocaleString()}.`,
          `Provider: ${result.providerUsed}.`
        ]);
      }
      onProgress(78, "Merging local and model concepts...", [
        `Model concepts: ${modelConcepts.length.toLocaleString()}.`,
        "Local terms are retained for frequency and fallback coverage."
      ]);
      const localTerms = tokenize(input.text || "").map((name) => ({ name, kind: "Term" }));
      const mergedTerms = mergeLocalAndModelTerms(localTerms, modelConcepts);
      onProgress(85, "Building network...", [
        `Local terms: ${localTerms.length.toLocaleString()}.`,
        `Merged concept mentions: ${mergedTerms.length.toLocaleString()}.`,
        "Computing frequencies, co-occurrence edges, PageRank, and communities."
      ]);
      const graph = buildBrainGraphFromTerms(mergedTerms);
      await maybeBuildSemanticIndex(project.path, input.chunks ?? [], embeddingSettings, onProgress);
      return graph;
    } catch (error) {
      console.warn("Model extraction failed, falling back to local graph construction.", error);
      onProgress(70, "Model unavailable, using local analysis...", [
        error instanceof Error ? error.message : String(error),
        "Falling back to local tokenization and chunk-level co-occurrence."
      ]);
    }
  }

  onProgress(60, "Analyzing text patterns...", [
    `Using ${backendChunks.length ? backendChunks.length.toLocaleString() : "single text"} chunk source.`,
    "Computing local terms and chunk-level co-occurrence edges."
  ]);
  const graph = backendChunks.length ? buildBrainGraphFromChunkTexts(backendChunks) : buildBrainGraphFromText(input.text);
  await maybeBuildSemanticIndex(project.path, input.chunks ?? [], embeddingSettings, onProgress);
  return graph;
}

async function maybeBuildSemanticIndex(
  projectPath: string,
  chunks: NonNullable<Awaited<ReturnType<typeof buildProjectGraphInput>>["chunks"]>,
  settings: EmbeddingSettings,
  onProgress: BuildProgressHandler
) {
  if (!settings.enabled || settings.provider !== "ollama" || chunks.length === 0) return;
  onProgress(88, "Generating semantic embeddings...", [
    `Provider: Ollama.`,
    `Model: ${settings.model}.`,
    `Chunks: ${chunks.length.toLocaleString()}.`
  ]);
  const saved = await buildProjectEmbeddings(projectPath, chunks, settings, (done, total) => {
    const percent = 88 + Math.round((done / Math.max(1, total)) * 9);
    onProgress(percent, `Generating semantic embeddings (${done}/${total})...`, [
      `Provider: Ollama.`,
      `Model: ${settings.model}.`,
      `Embedding cache is stored in AnshuDoc SQLite.`
    ]);
  });
  onProgress(98, "Semantic index updated.", [
    `Saved embeddings: ${saved.toLocaleString()}.`,
    "Summaries can now use semantic retrieval evidence."
  ]);
}

export function buildBrainGraphFromText(text: string, windowSize = 4): BrainGraph {
  const terms = tokenize(text || "").map((name) => ({ name, kind: "Term" }));
  return buildBrainGraphFromTerms(terms, windowSize);
}

export function buildBrainGraphFromChunkTexts(chunks: string[], windowSize = 4): BrainGraph {
  const termChunks = chunks.map((chunk) => tokenize(chunk || "").map((name) => ({ name, kind: "Term" })));
  return buildBrainGraphFromTermChunks(termChunks, windowSize);
}

export function buildBrainGraphFromTerms(concepts: TypedConcept[], windowSize = 4): BrainGraph {
  return buildBrainGraphFromTermChunks([concepts], windowSize);
}

function buildBrainGraphFromTermChunks(conceptChunks: TypedConcept[][], windowSize = 4): BrainGraph {
  const tokenChunks = conceptChunks
    .map((chunk) => normalizeTerms(chunk))
    .filter((chunk) => chunk.length > 0);
  const tokens = tokenChunks.flat();
  const frequencies = new Map<string, number>();
  const edgeWeights = new Map<string, number>();
  const conceptKinds = new Map<string, string>();

  for (const token of tokens) {
    frequencies.set(token.name, (frequencies.get(token.name) ?? 0) + 1);
    conceptKinds.set(token.name, token.kind);
  }

  for (const tokenChunk of tokenChunks) {
    const names = tokenChunk.map((t) => t.name);
    for (let index = 0; index < names.length; index += 1) {
      const current = names[index];
      const upper = Math.min(names.length, index + windowSize);
      for (let next = index + 1; next < upper; next += 1) {
        const other = names[next];
        if (current === other) continue;
        const [source, target] = [current, other].sort();
        const key = `${source}\u0000${target}`;
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
      }
    }
  }

  const selectedTerms = selectGraphTerms(frequencies, edgeWeights, MAX_GRAPH_NODES);
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const term of selectedTerms) {
    const frequency = frequencies.get(term) ?? 0;
    graph.addNode(term, { label: term, frequency, kind: conceptKinds.get(term) ?? "Misc" });
  }

  const edges: GraphEdge[] = [];
  const sortedEdges = [...edgeWeights.entries()]
    .map(([key, weight]) => ({ key, weight }))
    .sort((a, b) => b.weight - a.weight);
  for (const { key, weight } of sortedEdges) {
    const [source, target] = key.split("\u0000");
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
    graph.addUndirectedEdgeWithKey(key, source, target, { weight });
    edges.push({ source, target, weight });
    if (edges.length >= MAX_GRAPH_EDGES) break;
  }

  const pagerank = computePageRank(graph);
  const communities = detectCommunities(graph);
  const bridgeScores = computeBridgeScores(graph, communities);
  const nodes: GraphNode[] = graph.nodes().map((id) => ({
    id,
    label: id,
    kind: graph.getNodeAttribute(id, "kind"),
    frequency: graph.getNodeAttribute(id, "frequency"),
    pagerank: pagerank.get(id) ?? 0,
    bridgeScore: bridgeScores.get(id) ?? 0,
    community: communities.get(id) ?? 0
  }));

  nodes.sort((a, b) => b.pagerank - a.pagerank);
  writeLayout(graph, nodes, edges);
  // Default to community view after build
  applyGraphVisualEncoding(graph, nodes, edges, "community");

  const communityCount = new Set(nodes.map((node) => node.community)).size;
  console.log(`Graph build complete: ${nodes.length} nodes, ${edges.length} edges, ${communityCount} communities.`);
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

function selectGraphTerms(
  frequencies: Map<string, number>,
  edgeWeights: Map<string, number>,
  limit: number
): Set<string> {
  const scores = new Map<string, number>();
  for (const [term, frequency] of frequencies) {
    scores.set(term, frequency * 4);
  }
  for (const [key, weight] of edgeWeights) {
    const [source, target] = key.split("\u0000");
    scores.set(source, (scores.get(source) ?? 0) + weight);
    scores.set(target, (scores.get(target) ?? 0) + weight);
  }

  return new Set(
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || (frequencies.get(b[0]) ?? 0) - (frequencies.get(a[0]) ?? 0))
      .slice(0, limit)
      .map(([term]) => term)
  );
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
      kind: node.kind || "Term",
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

function normalizeTerms(terms: TypedConcept[]): TypedConcept[] {
  return terms
    .map((term) => ({
      name: term.name.trim().toLowerCase().replace(/\s+/g, " "),
      kind: term.kind
    }))
    .filter((term) => term.name.length >= 2 && !STOP_WORDS.has(term.name))
    .slice(0, 5000);
}

function mergeLocalAndModelTerms(localTerms: TypedConcept[], modelConcepts: TypedConcept[]): TypedConcept[] {
  const normalizedModel = normalizeTerms(modelConcepts);
  if (normalizedModel.length === 0) return localTerms;

  const modelKindByName = new Map<string, string>();
  for (const concept of normalizedModel) {
    modelKindByName.set(concept.name, concept.kind || "Misc");
  }

  const merged = localTerms.map((term) => {
    const normalized = term.name.trim().toLowerCase().replace(/\s+/g, " ");
    return {
      name: term.name,
      kind: modelKindByName.get(normalized) ?? term.kind
    };
  });

  const localNames = new Set(merged.map((term) => term.name.trim().toLowerCase().replace(/\s+/g, " ")));
  for (const concept of normalizedModel) {
    if (localNames.has(concept.name)) {
      merged.push(concept);
      continue;
    }
    merged.push(concept, concept);
  }

  return merged.slice(0, 5000);
}

function chunkMarkdownText(text: string, maxChars: number): string[] {
  const sections = text
    .split(/(?=^#{1,4}\s+|^\s*# Document:\s+)/gm)
    .map((section) => section.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const section of sections.length ? sections : [text]) {
    if (section.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < section.length; index += maxChars) {
        chunks.push(section.slice(index, index + maxChars));
      }
      continue;
    }

    if (current && current.length + section.length + 2 > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${section}` : section;
  }

  if (current) chunks.push(current);
  return chunks;
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
