import Sigma from "sigma";
import {
  buildBrainGraph,
  buildBrainGraphFromTerms,
  hydrateBrainGraph,
  serializeBrainGraph,
  type BrainGraph,
  type GraphNode,
  type StoredBrainGraph
} from "./graph";
import {
  DEFAULT_MODEL_SETTINGS,
  extractConceptsWithModel,
  loadModelSettings,
  saveModelSettings,
  type ModelProvider,
  type ModelSettings
} from "./model";
import {
  buildProjectGraphInput,
  loadProjects,
  loadProjectGraph,
  openProjectFolder,
  refreshProject,
  saveProjectGraph,
  saveProjects,
  type ProjectInfo
} from "./projects";
import { loadLanguage, saveLanguage, translate, type Language, type MessageKey } from "./i18n";
import { render3DGraph, type Graph3DRenderer } from "./render3d";
import { applyGraphVisualEncoding, type NodeColorMode } from "./visualEncoding";
import "./styles.css";

let renderer: Sigma | null = null;
let renderer3d: Graph3DRenderer | null = null;
let currentGraph: BrainGraph | null = null;
let modelSettings: ModelSettings = loadModelSettings();
let projects: ProjectInfo[] = loadProjects();
let selectedProjectId: string | null = projects[0]?.id ?? null;
let buildInProgressProjectId: string | null = null;
let language: Language = loadLanguage();
let activeSettingsSection: "general" | "models" = "general";
let nodeColorMode: NodeColorMode = "community";
let graphViewMode: "2d" | "3d" = "2d";
const t = (key: MessageKey) => translate(language, key);

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="mark"></span>
        <div>
          <h1>Brain Graph</h1>
          <p data-i18n="appSubtitle">${t("appSubtitle")}</p>
        </div>
      </div>
      <section class="project-section">
        <div class="section-heading">
          <h3 data-i18n="projects">${t("projects")}</h3>
          <button id="newProjectButton" class="icon-button" type="button" title="New project">+</button>
        </div>
        <div id="projectList" class="project-list"></div>
      </section>
      <section class="stats" aria-label="Graph stats">
        <div><strong id="termCount">0</strong><span>terms</span></div>
        <div><strong id="linkCount">0</strong><span>links</span></div>
        <div><strong id="communityCount">0</strong><span>topics</span></div>
        <div><strong id="densityValue">0</strong><span>density</span></div>
      </section>
      <div class="sidebar-footer">
        <button id="openSettingsButton" class="settings-link" type="button" data-i18n="settings">${t("settings")}</button>
      </div>
    </aside>
    <section class="workspace">
      <header class="toolbar">
        <div>
          <h2 data-i18n="conceptNetwork">${t("conceptNetwork")}</h2>
          <p id="selectionSummary">${t("emptyStatus")}</p>
        </div>
        <div class="graph-controls" aria-label="Graph controls">
          <button id="view2dButton" class="active" type="button">2D</button>
          <button id="view3dButton" type="button">3D</button>
          <span>颜色</span>
          <button id="communityColorButton" class="active" type="button">主题</button>
          <button id="frequencyColorButton" type="button">热度</button>
        </div>
      </header>
      <div class="graph-panel"><div id="graphContainer"></div></div>
      <div id="buildProgress" class="build-progress" hidden>
        <div class="progress-bar"><span id="progressFill"></span></div>
        <p id="progressText">Preparing build...</p>
      </div>
      <section class="bottom-panel">
        <div>
          <h3 data-i18n="insights">${t("insights")}</h3>
          <div id="insights" class="insights"></div>
        </div>
        <div>
          <h3 data-i18n="topTerms">${t("topTerms")}</h3>
          <div id="topTerms" class="term-list"></div>
        </div>
      </section>
    </section>
  </main>
  <section id="settingsView" class="settings-view" hidden>
    <aside class="settings-nav">
      <button id="backToAppButton" class="back-button" type="button" data-i18n="returnToApp">${t("returnToApp")}</button>
      <nav>
        <button id="generalSettingsTab" class="settings-nav-item active" type="button" data-i18n="general">${t("general")}</button>
        <button id="modelSettingsTab" class="settings-nav-item" type="button" data-i18n="models">${t("models")}</button>
      </nav>
    </aside>
    <section class="settings-content">
      <section id="generalSettingsPanel">
        <header class="settings-header">
          <h2 data-i18n="general">${t("general")}</h2>
          <p data-i18n="generalDescription">${t("generalDescription")}</p>
        </header>
        <div class="settings-form">
          <label class="field-label" for="languageSelect" data-i18n="language">${t("language")}</label>
          <select id="languageSelect">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>
      <section id="modelSettingsPanel" hidden>
        <header class="settings-header">
          <h2 data-i18n="models">${t("models")}</h2>
          <p data-i18n="modelsDescription">${t("modelsDescription")}</p>
        </header>
        <div class="settings-form">
        <label class="toggle-row">
          <input id="modelEnabled" type="checkbox" />
          <span data-i18n="useModelExtraction">${t("useModelExtraction")}</span>
        </label>
        <label class="field-label" for="modelProvider" data-i18n="provider">${t("provider")}</label>
        <select id="modelProvider">
          <option value="ollama">Ollama</option>
          <option value="deepseek">DeepSeek</option>
          <option value="gemini">Gemini</option>
          <option value="minimax">MiniMax</option>
          <option value="custom">OpenAI-compatible</option>
        </select>
        <label class="field-label" for="modelName" data-i18n="model">${t("model")}</label>
        <input id="modelName" type="text" />
        <label class="field-label" for="modelBaseUrl" data-i18n="baseUrl">${t("baseUrl")}</label>
        <input id="modelBaseUrl" type="text" />
        <label class="field-label" for="modelApiKey" data-i18n="apiKey">${t("apiKey")}</label>
        <input id="modelApiKey" type="password" autocomplete="off" />
        <div class="settings-actions">
          <button id="saveSettingsButton" type="button" data-i18n="save">${t("save")}</button>
          <button id="resetSettingsButton" type="button" data-i18n="reset">${t("reset")}</button>
        </div>
      </div>
      </section>
    </section>
  </section>
`;

const graphContainer = document.querySelector<HTMLDivElement>("#graphContainer")!;
const modelEnabled = document.querySelector<HTMLInputElement>("#modelEnabled")!;
const modelProvider = document.querySelector<HTMLSelectElement>("#modelProvider")!;
const modelName = document.querySelector<HTMLInputElement>("#modelName")!;
const modelBaseUrl = document.querySelector<HTMLInputElement>("#modelBaseUrl")!;
const modelApiKey = document.querySelector<HTMLInputElement>("#modelApiKey")!;
const saveSettingsButton = document.querySelector<HTMLButtonElement>("#saveSettingsButton")!;
const resetSettingsButton = document.querySelector<HTMLButtonElement>("#resetSettingsButton")!;
const appShell = document.querySelector<HTMLElement>(".shell")!;
const settingsView = document.querySelector<HTMLElement>("#settingsView")!;
const openSettingsButton = document.querySelector<HTMLButtonElement>("#openSettingsButton")!;
const backToAppButton = document.querySelector<HTMLButtonElement>("#backToAppButton")!;
const generalSettingsTab = document.querySelector<HTMLButtonElement>("#generalSettingsTab")!;
const modelSettingsTab = document.querySelector<HTMLButtonElement>("#modelSettingsTab")!;
const generalSettingsPanel = document.querySelector<HTMLElement>("#generalSettingsPanel")!;
const modelSettingsPanel = document.querySelector<HTMLElement>("#modelSettingsPanel")!;
const languageSelect = document.querySelector<HTMLSelectElement>("#languageSelect")!;
const newProjectButton = document.querySelector<HTMLButtonElement>("#newProjectButton")!;
const projectList = document.querySelector<HTMLDivElement>("#projectList")!;
const buildProgress = document.querySelector<HTMLDivElement>("#buildProgress")!;
const progressFill = document.querySelector<HTMLSpanElement>("#progressFill")!;
const progressText = document.querySelector<HTMLParagraphElement>("#progressText")!;
const communityColorButton = document.querySelector<HTMLButtonElement>("#communityColorButton")!;
const frequencyColorButton = document.querySelector<HTMLButtonElement>("#frequencyColorButton")!;
const view2dButton = document.querySelector<HTMLButtonElement>("#view2dButton")!;
const view3dButton = document.querySelector<HTMLButtonElement>("#view3dButton")!;
newProjectButton.addEventListener("click", addProject);
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest(".project-menu") && !target.closest(".project-menu-button")) {
    closeProjectMenus();
  }
});
openSettingsButton.addEventListener("click", () => {
  renderSettingsForm();
  appShell.hidden = true;
  settingsView.hidden = false;
});
generalSettingsTab.addEventListener("click", () => switchSettingsSection("general"));
modelSettingsTab.addEventListener("click", () => switchSettingsSection("models"));
languageSelect.addEventListener("change", () => {
  language = languageSelect.value as Language;
  saveLanguage(language);
  applyTranslations();
  renderProjects();
  switchSettingsSection(activeSettingsSection);
});
backToAppButton.addEventListener("click", () => {
  settingsView.hidden = true;
  appShell.hidden = false;
  requestAnimationFrame(() => renderer?.refresh());
});
saveSettingsButton.addEventListener("click", () => {
  modelSettings = readSettingsForm();
  saveModelSettings(modelSettings);
  setStatus(modelSettings.enabled ? `模型抽取已启用：${modelSettings.provider}` : "已切换到本地分析。");
});
resetSettingsButton.addEventListener("click", () => {
  modelSettings = DEFAULT_MODEL_SETTINGS;
  saveModelSettings(modelSettings);
  renderSettingsForm();
  setStatus("模型设置已重置。");
});
modelProvider.addEventListener("change", () => {
  applyProviderDefaults(modelProvider.value as ModelProvider);
});
communityColorButton.addEventListener("click", () => setNodeColorMode("community"));
frequencyColorButton.addEventListener("click", () => setNodeColorMode("frequency"));
view2dButton.addEventListener("click", () => setGraphViewMode("2d"));
view3dButton.addEventListener("click", () => setGraphViewMode("3d"));

async function analyze() {
  const selectedProject = getSelectedProject();
  if (!selectedProject) {
    setStatus("Create or select a project first.");
    return;
  }
  if (buildInProgressProjectId) {
    setStatus(`A project is already building. Finish that build before starting another.`);
    return;
  }

  const size = 4;
  const settings = readSettingsForm();
  saveModelSettings(settings);
  buildInProgressProjectId = selectedProject.id;
  setBuildProgress(8, `Reading project documents from ${selectedProject.name}...`);
  setStatus(`Reading project documents from ${selectedProject.name}...`);

  try {
    const input = await buildProjectGraphInput(selectedProject.path);
    setBuildProgress(35, `Read ${input.documentsRead} documents. Preparing graph input...`);
    if (settings.enabled) {
      setBuildProgress(55, `Extracting concepts with ${settings.provider}:${settings.model}...`);
      setStatus(`Extracting project concepts with ${settings.provider}:${settings.model}...`);
      const result = await extractConceptsWithModel(input.text, settings);
      setBuildProgress(78, `Building graph from ${result.concepts.length} concept mentions...`);
      currentGraph = buildBrainGraphFromTerms(result.concepts, size);
      setBuildProgress(92, "Saving graph to SQLite...");
      await saveProjectGraph(selectedProject.path, JSON.stringify(serializeBrainGraph(currentGraph)));
      setStatus(
        `Built ${selectedProject.name} with ${result.providerUsed}; ${result.concepts.length} concept mentions from ${input.documentsRead} readable documents.`
      );
    } else {
      setBuildProgress(70, "Building graph with local tokenizer...");
      currentGraph = buildBrainGraph(input.text, size);
      setBuildProgress(92, "Saving graph to SQLite...");
      await saveProjectGraph(selectedProject.path, JSON.stringify(serializeBrainGraph(currentGraph)));
      setStatus(
        `Built ${selectedProject.name} locally from ${input.documentsRead} readable documents; ${input.documentsSkipped} binary documents used as file context.`
      );
    }
    setBuildProgress(100, "Graph build complete.");
  } catch (error) {
    setStatus(`Project graph build failed. ${String(error)}`);
    return;
  } finally {
    buildInProgressProjectId = null;
    renderProjects();
  }

  void renderGraph(currentGraph);
}

async function addProject() {
  try {
    const project = await openProjectFolder();
    if (!project) return;
    projects = [project, ...projects.filter((item) => item.path !== project.path)];
    selectedProjectId = project.id;
    saveProjects(projects);
    renderProjects();
    setStatus(`Added project ${project.name}; ${project.documents.length} documents found.`);
  } catch (error) {
    setStatus(String(error));
  }
}

async function rebuildSelectedProjectList(project: ProjectInfo) {
  const refreshed = await refreshProject(project.path);
  projects = projects.map((item) => (item.id === project.id ? refreshed : item));
  selectedProjectId = refreshed.id;
  saveProjects(projects);
  renderProjects();
  return refreshed;
}

function renderProjects() {
  projectList.replaceChildren(
    ...projects.map((project) => {
      const row = document.createElement("div");
      row.className = `project-row ${project.id === selectedProjectId ? "active" : ""}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-select";
      button.innerHTML = `<span class="folder-icon">▰</span><span>${project.name}</span>`;
      button.addEventListener("click", () => {
        selectedProjectId = project.id;
        renderProjects();
        void loadGraphForProject(project);
      });

      const menuButton = document.createElement("button");
      menuButton.type = "button";
      menuButton.className = "project-menu-button";
      menuButton.textContent = "...";
      menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleProjectMenu(row, project);
      });

      row.append(button, menuButton);
      if (project.id === selectedProjectId) {
        row.append(renderProjectDocuments(project));
      }
      return row;
    })
  );
}

function renderProjectDocuments(project: ProjectInfo) {
  const list = document.createElement("div");
  list.className = "project-document-list";
  list.replaceChildren(
    ...project.documents.slice(0, 80).map((doc) => {
      const row = document.createElement("div");
      row.className = "project-document-row";
      row.innerHTML = `<span>${doc.name}</span><small>${doc.extension.toUpperCase()}</small>`;
      return row;
    })
  );
  return list;
}

async function renderGraph(graph: BrainGraph) {
  applyGraphVisualEncoding(graph.graph, graph.nodes, graph.edges, nodeColorMode);
  renderer?.kill();
  renderer = null;
  renderer3d?.destroy();
  renderer3d = null;

  if (graphViewMode === "3d") {
    renderer3d = await render3DGraph(graph, graphContainer, nodeColorMode, selectNode);
    renderStats(graph);
    renderInsights(graph);
    renderTopTerms(graph.nodes);
    return;
  }

  renderer = new Sigma(graph.graph, graphContainer, {
    renderEdgeLabels: false,
    labelDensity: 0.08,
    labelGridCellSize: 90,
    hideEdgesOnMove: false,
    defaultEdgeType: "line",
    defaultNodeType: "circle",
    minCameraRatio: 0.1,
    maxCameraRatio: 8
  });
  renderer.on("clickNode", ({ node }) => selectNode(node));
  renderer.on("clickStage", () => {
    document.querySelector("#selectionSummary")!.textContent = t("selectNode");
  });
  renderStats(graph);
  renderInsights(graph);
  renderTopTerms(graph.nodes);
}

function setNodeColorMode(mode: NodeColorMode) {
  nodeColorMode = mode;
  communityColorButton.classList.toggle("active", mode === "community");
  frequencyColorButton.classList.toggle("active", mode === "frequency");
  if (!currentGraph) return;
  applyGraphVisualEncoding(currentGraph.graph, currentGraph.nodes, currentGraph.edges, nodeColorMode);
  void renderGraph(currentGraph);
}

function setGraphViewMode(mode: "2d" | "3d") {
  graphViewMode = mode;
  view2dButton.classList.toggle("active", mode === "2d");
  view3dButton.classList.toggle("active", mode === "3d");
  if (currentGraph) void renderGraph(currentGraph);
}

function setBuildProgress(percent: number, message: string) {
  buildProgress.hidden = false;
  progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressText.textContent = message;
}

function toggleProjectMenu(row: HTMLElement, project: ProjectInfo) {
  const existing = row.querySelector(".project-menu");
  closeProjectMenus();
  if (existing) return;

  const menu = document.createElement("div");
  menu.className = "project-menu";
  const buildButton = document.createElement("button");
  buildButton.type = "button";
  buildButton.textContent = t("buildGraph");
  buildButton.disabled = Boolean(buildInProgressProjectId);
  buildButton.addEventListener("click", async () => {
    selectedProjectId = project.id;
    closeProjectMenus();
    await analyze();
  });

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = t("refreshDocuments");
  refreshButton.addEventListener("click", async () => {
    closeProjectMenus();
    const refreshed = await rebuildSelectedProjectList(project);
    setStatus(`Refreshed ${refreshed.name}; ${refreshed.documents.length} documents found.`);
  });

  menu.append(buildButton, refreshButton);
  row.append(menu);
}

function closeProjectMenus() {
  document.querySelectorAll(".project-menu").forEach((menu) => menu.remove());
}

function getSelectedProject(): ProjectInfo | null {
  return projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
}

async function loadGraphForProject(project: ProjectInfo) {
  try {
    const graphJson = await loadProjectGraph(project.path);
    if (!graphJson) {
      setStatus(`${project.name}：${t("noSavedGraph")}`);
      return;
    }
    currentGraph = hydrateBrainGraph(JSON.parse(graphJson) as StoredBrainGraph);
    void renderGraph(currentGraph);
    setStatus(`Loaded saved graph for ${project.name}.`);
  } catch (error) {
    setStatus(`Failed to load saved graph. ${String(error)}`);
  }
}

function renderSettingsForm() {
  languageSelect.value = language;
  modelEnabled.checked = modelSettings.enabled;
  modelProvider.value = modelSettings.provider;
  modelName.value = modelSettings.model;
  modelBaseUrl.value = modelSettings.baseUrl;
  modelApiKey.value = modelSettings.apiKey;
}

function switchSettingsSection(section: "general" | "models") {
  activeSettingsSection = section;
  generalSettingsPanel.hidden = section !== "general";
  modelSettingsPanel.hidden = section !== "models";
  generalSettingsTab.classList.toggle("active", section === "general");
  modelSettingsTab.classList.toggle("active", section === "models");
}

function applyTranslations() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as MessageKey | undefined;
    if (key) element.textContent = t(key);
  });
  if (!currentGraph) setStatus(t("emptyStatus"));
}

function readSettingsForm(): ModelSettings {
  return {
    enabled: modelEnabled.checked,
    provider: modelProvider.value as ModelProvider,
    model: modelName.value.trim(),
    baseUrl: modelBaseUrl.value.trim(),
    apiKey: modelApiKey.value.trim()
  };
}

function applyProviderDefaults(provider: ModelProvider) {
  if (provider === "ollama") {
    modelName.value = modelName.value || "qwen2.5:3b";
    modelBaseUrl.value = "http://127.0.0.1:11434";
    modelApiKey.value = "";
    return;
  }
  if (provider === "deepseek") {
    modelName.value = modelName.value || "deepseek-chat";
    modelBaseUrl.value = "https://api.deepseek.com";
    return;
  }
  if (provider === "gemini") {
    modelName.value = modelName.value || "gemini-2.5-flash";
    modelBaseUrl.value = "https://generativelanguage.googleapis.com/v1beta";
    return;
  }
  if (provider === "minimax") {
    modelName.value = modelName.value || "MiniMax-M1";
    modelBaseUrl.value = "https://api.minimax.io/v1";
  }
}

function setStatus(message: string) {
  document.querySelector("#selectionSummary")!.textContent = message;
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

renderSettingsForm();
renderProjects();
if (projects[0]) {
  void loadGraphForProject(projects[0]);
}
