import Sigma from "sigma";
import { buildBrainGraph, type BrainGraph, type GraphNode } from "./graph";
import "./styles.css";

const sampleText = `InfraNodus represents text as a network of concepts.
It detects topical clusters, influential concepts, bridge terms, and structural gaps.
Researchers can use those gaps to generate better questions, compare narratives, and expand ideas.
For a local MVP, Brain Graph focuses on co-occurrence networks, graph metrics, and exploratory visualization.`;

let renderer: Sigma | null = null;
let currentGraph: BrainGraph | null = null;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="mark"></span>
        <div>
          <h1>Brain Graph</h1>
          <p>Text network analysis workspace</p>
        </div>
      </div>
      <label class="input-label" for="sourceText">Source text</label>
      <textarea id="sourceText" spellcheck="false"></textarea>
      <div class="controls">
        <label for="windowSize">Window</label>
        <input id="windowSize" type="range" min="2" max="8" value="4" />
        <span id="windowValue">4</span>
      </div>
      <button id="analyzeButton" type="button">Analyze Text</button>
      <section class="stats" aria-label="Graph stats">
        <div><strong id="termCount">0</strong><span>terms</span></div>
        <div><strong id="linkCount">0</strong><span>links</span></div>
        <div><strong id="communityCount">0</strong><span>topics</span></div>
        <div><strong id="densityValue">0</strong><span>density</span></div>
      </section>
    </aside>
    <section class="workspace">
      <header class="toolbar">
        <div>
          <h2>Concept Network</h2>
          <p id="selectionSummary">Select a node to inspect local context.</p>
        </div>
        <div class="toolbar-actions">
          <button id="resetCameraButton" type="button">Reset</button>
        </div>
      </header>
      <div class="graph-panel"><div id="graphContainer"></div></div>
      <section class="bottom-panel">
        <div>
          <h3>Insights</h3>
          <div id="insights" class="insights"></div>
        </div>
        <div>
          <h3>Top Terms</h3>
          <div id="topTerms" class="term-list"></div>
        </div>
      </section>
    </section>
  </main>
`;

const sourceText = document.querySelector<HTMLTextAreaElement>("#sourceText")!;
const windowSize = document.querySelector<HTMLInputElement>("#windowSize")!;
const windowValue = document.querySelector<HTMLSpanElement>("#windowValue")!;
const analyzeButton = document.querySelector<HTMLButtonElement>("#analyzeButton")!;
const resetCameraButton = document.querySelector<HTMLButtonElement>("#resetCameraButton")!;
const graphContainer = document.querySelector<HTMLDivElement>("#graphContainer")!;

sourceText.value = sampleText;
windowSize.addEventListener("input", () => {
  windowValue.textContent = windowSize.value;
});
analyzeButton.addEventListener("click", analyze);
resetCameraButton.addEventListener("click", () => renderer?.getCamera().animatedReset());

function analyze() {
  currentGraph = buildBrainGraph(sourceText.value.trim(), Number(windowSize.value));
  renderer?.kill();
  renderer = new Sigma(currentGraph.graph, graphContainer, {
    renderEdgeLabels: false,
    labelDensity: 0.08,
    labelGridCellSize: 90,
    defaultEdgeType: "line",
    defaultNodeType: "circle",
    minCameraRatio: 0.1,
    maxCameraRatio: 8
  });
  renderer.on("clickNode", ({ node }) => selectNode(node));
  renderer.on("clickStage", () => {
    document.querySelector("#selectionSummary")!.textContent = "Select a node to inspect local context.";
  });
  renderStats(currentGraph);
  renderInsights(currentGraph);
  renderTopTerms(currentGraph.nodes);
}

function selectNode(nodeId: string) {
  if (!currentGraph) return;
  const attrs = currentGraph.graph.getNodeAttributes(nodeId);
  const neighbors = currentGraph.graph.neighbors(nodeId).slice(0, 6).join(", ");
  document.querySelector("#selectionSummary")!.textContent = `${attrs.label}: frequency ${attrs.frequency}, PageRank ${attrs.pagerank.toFixed(
    3
  )}, bridge ${attrs.bridgeScore.toFixed(2)}. Neighbors: ${neighbors || "none"}.`;
}

function renderStats(graph: BrainGraph) {
  document.querySelector("#termCount")!.textContent = String(graph.stats.terms);
  document.querySelector("#linkCount")!.textContent = String(graph.stats.links);
  document.querySelector("#communityCount")!.textContent = String(graph.stats.communities);
  document.querySelector("#densityValue")!.textContent = graph.stats.density.toFixed(3);
}

function renderInsights(graph: BrainGraph) {
  const insights = document.querySelector<HTMLDivElement>("#insights")!;
  insights.replaceChildren(
    ...graph.insights.map((insight) => {
      const item = document.createElement("article");
      item.className = `insight ${insight.kind}`;
      item.innerHTML = `<strong>${insight.title}</strong><p>${insight.detail}</p>`;
      return item;
    })
  );
}

function renderTopTerms(nodes: GraphNode[]) {
  const topTerms = document.querySelector<HTMLDivElement>("#topTerms")!;
  topTerms.replaceChildren(
    ...nodes.slice(0, 12).map((node) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "term-row";
      row.innerHTML = `<span>${node.label}</span><small>${node.frequency} mentions</small>`;
      row.addEventListener("click", () => {
        renderer?.getCamera().animate(
          {
            x: currentGraph?.graph.getNodeAttribute(node.id, "x") ?? 0,
            y: currentGraph?.graph.getNodeAttribute(node.id, "y") ?? 0,
            ratio: 0.35
          },
          { duration: 350 }
        );
        selectNode(node.id);
      });
      return row;
    })
  );
}

analyze();
