import React, { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Plus,
  Settings,
  ChevronLeft,
  Maximize2,
  Database,
  Zap,
  BarChart3,
  Moon,
  Sun,
  LayoutGrid,
  Box,
  MoreVertical,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  X,
  FileText,
  File
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Core Logic (Legacy)
import {
  loadProjects,
  saveProjects,
  openProjectFolder,
  loadProjectGraph,
  saveProjectGraph,
  refreshProject,
  loadProjectDocument,
  buildProjectGraphInput,
  generateSlideOutline,
  type LoadedProjectDocument,
  type ProjectDocument,
  type ProjectInfo
} from "./projects";
import {
  loadModelSettings,
  saveModelSettings,
  extractConceptsWithModel,
  testModelConnection,
  type ModelSettings,
  type ModelProvider
} from "./model";
import {
  defaultEmbeddingSettingsForProvider,
  embeddingProviderLabel,
  loadEmbeddingSettings,
  saveEmbeddingSettings,
  searchProjectEmbeddings,
  type SemanticSearchResult,
  type EmbeddingProvider,
  type EmbeddingSettings
} from "./embedding";
import {
  hydrateBrainGraph,
  serializeBrainGraph,
  buildBrainGraph,
  type BuildProgressHandler,
  type BrainGraph,
  type GraphNode
} from "./graph";
import { render3DGraph, type Graph3DRenderer } from "./render3d";
import { render2DGraph, type Graph2DRenderer } from "./render2d";
import { applyGraphVisualEncoding, nodeColor, type NodeColorMode } from "./visualEncoding";
import { loadLanguage, saveLanguage, translate, type Language, type MessageKey } from "./i18n";

// Types
import { GraphViewMode, SettingsSection } from "./types";

// Assets
import logoImage from "./assets/logo.png";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ProjectContentMode = "graph" | "summary";
type BuildProgressState = { percent: number; message: string; details?: string[] };
type NodeContextMenuState = { nodeId: string; x: number; y: number } | null;
export type DocumentPreviewState = {
  document: ProjectDocument;
  content: LoadedProjectDocument;
  url?: string;
};
type SlideOutlineForm = { question: string; audience: string; slideCount: number; language: string };

const PROJECT_SUMMARIES_KEY = "anshu-doc:project-summaries";
const LEGACY_PROJECT_SUMMARIES_KEY = "brain-graph:project-summaries";
const THEME_KEY = "anshu-doc:theme";
const LEGACY_THEME_KEY = "brain-graph:theme";

import {
  createProjectSummary,
  createNodeSummary,
  type SummaryDrawerState,
} from "./lib/summary";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { DocumentWorkspace } from "./components/workspace/DocumentWorkspace";
import { GraphDrawer } from "./components/workspace/GraphDrawer";
import { SummaryDrawer } from "./components/workspace/SummaryDrawer";
import { SettingsDialog } from "./components/SettingsDialog";

export default function App() {
  // --- State ---
  const [language, setLanguage] = useState<Language>(loadLanguage());
  const [isDark, setIsDark] = useState(true);
  const [projects, setProjects] = useState<ProjectInfo[]>(loadProjects());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [currentGraph, setCurrentGraph] = useState<BrainGraph | null>(null);
  const [viewMode, setViewMode] = useState<GraphViewMode>("2d");
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<NodeColorMode>("community");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(loadModelSettings());
  const [embeddingSettings, setEmbeddingSettings] = useState<EmbeddingSettings>(loadEmbeddingSettings());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelTestState, setModelTestState] = useState<{ loading: boolean; message: string; ok?: boolean }>({ loading: false, message: "" });
  const [status, setStatus] = useState<string>("");
  const [buildProgress, setBuildProgress] = useState<BuildProgressState | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("general");
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(288);
  const [summaryDrawerWidth, setSummaryDrawerWidth] = useState(() => Math.round(window.innerWidth / 3));
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [isGraphDrawerOpen, setIsGraphDrawerOpen] = useState(false);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
  const [summaryDrawer, setSummaryDrawer] = useState<SummaryDrawerState | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState>(null);
  const [isSlideOutlineComposerOpen, setIsSlideOutlineComposerOpen] = useState(false);
  const [slideOutlineForm, setSlideOutlineForm] = useState<SlideOutlineForm>({
    question: "",
    audience: "管理层",
    slideCount: 8,
    language: "zh"
  });
  const [isGeneratingSlideOutline, setIsGeneratingSlideOutline] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, string>>(() => {
    const raw = localStorage.getItem(PROJECT_SUMMARIES_KEY) ?? localStorage.getItem(LEGACY_PROJECT_SUMMARIES_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  // Refs for 3D renderer
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Graph3DRenderer | null>(null);
  const renderer2dRef = useRef<Graph2DRenderer | null>(null);

  // Helper: Translate
  const t = useCallback((key: MessageKey) => translate(language, key), [language]);

  // --- Effects ---

  // Theme initialization
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY) ?? "dark";
    const dark = saved === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  };

  // Load graph when project changes
  const loadGraph = useCallback(async (project: ProjectInfo) => {
    try {
      setCurrentGraph(null);
      setIsInitialLoading(true);
      const graphJson = await loadProjectGraph(project.path);
      if (!graphJson) {
        setStatus(`${project.name}：${t("noSavedGraph")}`);
        setCurrentGraph(null);
        return;
      }
      const graph = hydrateBrainGraph(JSON.parse(graphJson));
      setCurrentGraph(graph);
      setStatus(`Loaded ${project.name}`);
    } catch (error) {
      console.error(error);
      setStatus(`Failed to load graph: ${error}`);
    } finally {
      setIsInitialLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const selected = projects.find(p => p.id === selectedProjectId);
    if (selected) {
      loadGraph(selected);
    }
    setProjectMenuId(null);
  }, [selectedProjectId, projects, loadGraph]);

  const selectNode = useCallback((nodeId: string) => {
    if (!currentGraph) return;
    const attrs = currentGraph.graph.getNodeAttributes(nodeId);
    const neighbors = currentGraph.graph.neighbors(nodeId).slice(0, 6).map(n => currentGraph.graph.getNodeAttribute(n, "label")).join(", ");
    setStatus(`${attrs.label}: frequency ${attrs.frequency}, pagerank ${attrs.pagerank.toFixed(3)}. Neighbors: ${neighbors || "none"}.`);
  }, [currentGraph]);

  const openNodeContextMenu = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setNodeContextMenu({ nodeId, x: position.x, y: position.y });
  }, []);

  // Graph Rendering
  useEffect(() => {
    if (!containerRef.current) return;

    rendererRef.current?.destroy();
    rendererRef.current = null;
    renderer2dRef.current?.destroy();
    renderer2dRef.current = null;
    if (!isGraphDrawerOpen) return;
    if (!currentGraph) return;

    applyGraphVisualEncoding(currentGraph.graph, currentGraph.nodes, currentGraph.edges, colorMode);

    if (viewMode === "2d") {
      renderer2dRef.current = render2DGraph(currentGraph, containerRef.current, selectNode, openNodeContextMenu);
      return () => {
        renderer2dRef.current?.destroy();
        renderer2dRef.current = null;
      };
    }

    void render3DGraph(currentGraph, containerRef.current, colorMode, (nodeId) => {
      const attrs = currentGraph.graph.getNodeAttributes(nodeId);
      setStatus(`${attrs.label}: frequency ${attrs.frequency}, pagerank ${attrs.pagerank.toFixed(3)}`);
    }, openNodeContextMenu).then(r => {
      rendererRef.current = r;
    });

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [currentGraph, viewMode, colorMode, selectNode, openNodeContextMenu, isGraphDrawerOpen]);

  // --- Actions ---

  const handleAddProject = async () => {
    const newProject = await openProjectFolder();
    if (!newProject) return;
    const nextProjects = [...projects, newProject];
    setProjects(nextProjects);
    saveProjects(nextProjects);
    setSelectedProjectId(newProject.id);
  };

  const updateBuildProgress: BuildProgressHandler = (percent, message, details = []) => {
    setBuildProgress({ percent, message, details });
  };

  const handleBuildGraph = async () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;
    setIsSummaryDrawerOpen(false);

    try {
      setBuildProgress({ percent: 0, message: t("readingDocuments") });
      // This part would ideally be async with progress reporting from Tauri
      // For now, keeping it consistent with legacy imperative logic
      const graph = await buildBrainGraph(project, modelSettings, embeddingSettings, updateBuildProgress, false);

      setCurrentGraph(graph);
      await saveProjectGraph(project.path, JSON.stringify(serializeBrainGraph(graph)));
      setBuildProgress({ percent: 92, message: "Generating document summary...", details: ["Loading prepared Markdown content for project summary."] });
      const input = await buildProjectGraphInput(project.path);
      saveSummaries({ ...summaries, [project.id]: createProjectSummary(project, graph, input.text) });
      setBuildProgress(null);
      setStatus(`Graph built for ${project.name}`);
    } catch (error) {
      setBuildProgress(null);
      setStatus(`Build failed: ${error}`);
    }
  };

  const handleBuildProjectGraph = async (project: ProjectInfo, rebuild = false) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    setIsSummaryDrawerOpen(false);

    try {
      setBuildProgress({ percent: 0, message: rebuild ? "Clearing graph cache..." : t("readingDocuments") });
      const graph = await buildBrainGraph(project, modelSettings, embeddingSettings, updateBuildProgress, rebuild);

      setCurrentGraph(graph);
      await saveProjectGraph(project.path, JSON.stringify(serializeBrainGraph(graph)));
      setBuildProgress({ percent: 92, message: "Generating document summary...", details: ["Loading prepared Markdown content for project summary."] });
      const input = await buildProjectGraphInput(project.path);
      saveSummaries({ ...summaries, [project.id]: createProjectSummary(project, graph, input.text) });
      setBuildProgress(null);
      setStatus(`${rebuild ? "Rebuilt" : "Incrementally built"} graph for ${project.name}`);
    } catch (error) {
      setBuildProgress(null);
      setStatus(`Build failed: ${error}`);
    }
  };

  const handleRefreshProject = async (project: ProjectInfo) => {
    setProjectMenuId(null);
    try {
      const refreshed = await refreshProject(project.path);
      const nextProjects = projects.map((item) => item.id === project.id ? refreshed : item);
      setProjects(nextProjects);
      saveProjects(nextProjects);
      setSelectedProjectId(refreshed.id);
      setStatus(`${refreshed.name} refreshed`);
    } catch (error) {
      setStatus(`Refresh failed: ${error}`);
    }
  };

  const handleOpenDocument = async (project: ProjectInfo, document: ProjectDocument) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    setIsSummaryDrawerOpen(false);
    setIsSlideOutlineComposerOpen(false);
    setIsDocumentLoading(true);
    setDocumentPreview(null);
    try {
      const content = await loadProjectDocument(project.path, document.path);
      setDocumentPreview({
        document,
        content,
        url: content.kind === "pdf" && content.filePath ? convertFileSrc(content.filePath) : undefined
      });
      setStatus(`${document.name}`);
    } catch (error) {
      setDocumentPreview({
        document,
        content: {
          title: document.name,
          path: document.path,
          extension: document.extension,
          kind: "markdown",
          markdown: `## 文档打开失败\n\n${String(error)}`
        }
      });
      setStatus(`Document preview failed: ${error}`);
    } finally {
      setIsDocumentLoading(false);
    }
  };

  const saveSummaries = (nextSummaries: Record<string, string>) => {
    setSummaries(nextSummaries);
    localStorage.setItem(PROJECT_SUMMARIES_KEY, JSON.stringify(nextSummaries));
  };

  const showProjectContent = async (project: ProjectInfo, mode: ProjectContentMode) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    if (mode === "graph") {
      setIsSummaryDrawerOpen(false);
      setSummaryDrawer(null);
      setIsGraphDrawerOpen(true);
      if (!currentGraph || selectedProjectId !== project.id) {
        await loadGraph(project);
      }
      return;
    }

    setIsSummaryDrawerOpen(true);
    setSummaryDrawer({
      title: project.name,
      subtitle: "项目文档综合摘要",
      markdown: summaries[project.id] || "## 暂无摘要\n\n请先在项目菜单中点击“增量构建图谱”或“重新构建图谱”，摘要会在图谱构建完成后自动生成。"
    });
    if (summaries[project.id]) return;

    try {
      setIsInitialLoading(true);
      const graph = project.id === selectedProjectId && currentGraph
        ? currentGraph
        : await loadProjectGraph(project.path).then((graphJson) => graphJson ? hydrateBrainGraph(JSON.parse(graphJson)) : null);
      if (!graph) return;

      const input = await buildProjectGraphInput(project.path);
      const semanticEvidence = await searchProjectEmbeddings(
        project.path,
        graph.nodes.slice(0, 12).map((node) => node.label).join(" "),
        embeddingSettings,
        8
      );
      setCurrentGraph(graph);
      const markdown = createProjectSummary(project, graph, input.text, semanticEvidence);
      saveSummaries({ ...summaries, [project.id]: markdown });
      setSummaryDrawer({ title: project.name, subtitle: "项目文档综合摘要", markdown });
    } catch (error) {
      setStatus(`Summary failed: ${error}`);
    } finally {
      setIsInitialLoading(false);
    }
  };

  const showNodeSummary = async (nodeId: string, mode: "node" | "related") => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || !currentGraph) return;
    setNodeContextMenu(null);
    setIsSummaryDrawerOpen(true);
    setSummaryDrawer({
      title: "生成摘要中",
      subtitle: mode === "related" ? "节点关联性摘要" : "节点摘要",
      markdown: "## 正在读取项目 Markdown\n\n请稍候。"
    });
    try {
      const input = await buildProjectGraphInput(project.path);
      const attrs = currentGraph.graph.getNodeAttributes(nodeId);
      const label = String(attrs.label || nodeId);
      const relatedLabels = mode === "related"
        ? currentGraph.graph.neighbors(nodeId).slice(0, 12).map((neighbor) => String(currentGraph.graph.getNodeAttribute(neighbor, "label") || neighbor))
        : [];
      const semanticEvidence = await searchProjectEmbeddings(
        project.path,
        [label, ...relatedLabels].join(" "),
        embeddingSettings,
        mode === "related" ? 10 : 6
      );
      setSummaryDrawer(createNodeSummary(currentGraph, nodeId, input.text, mode, semanticEvidence));
    } catch (error) {
      setSummaryDrawer({
        title: "摘要生成失败",
        subtitle: mode === "related" ? "节点关联性摘要" : "节点摘要",
        markdown: `## 摘要生成失败\n\n${String(error)}`
      });
    }
  };

  const openSlideOutlineComposer = (project: ProjectInfo) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    setIsSummaryDrawerOpen(true);
    setIsSlideOutlineComposerOpen(true);
    setSummaryDrawer({
      title: "生成幻灯片大纲",
      subtitle: project.name,
      markdown: "## 输入主题\n\n根据该项目的知识图谱和文档内容生成幻灯片大纲。"
    });
  };

  const handleGenerateSlideOutline = async () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;
    setIsGeneratingSlideOutline(true);
    setSummaryDrawer({
      title: "生成幻灯片大纲",
      subtitle: project.name,
      markdown: "## 正在生成\n\n正在抽取相关子图、检索证据，并调用当前模型生成结构化大纲。"
    });
    try {
      const semanticEvidence = await searchProjectEmbeddings(
        project.path,
        slideOutlineForm.question,
        embeddingSettings,
        10
      );
      const markdown = await generateSlideOutline({
        projectPath: project.path,
        question: slideOutlineForm.question,
        audience: slideOutlineForm.audience,
        slideCount: slideOutlineForm.slideCount,
        language: slideOutlineForm.language,
        settings: modelSettings,
        semanticEvidence
      });
      setSummaryDrawer({
        title: "幻灯片大纲",
        subtitle: `${project.name} · ${slideOutlineForm.audience}`,
        markdown
      });
    } catch (error) {
      setSummaryDrawer({
        title: "生成失败",
        subtitle: project.name,
        markdown: `## 幻灯片大纲生成失败\n\n${String(error)}`
      });
    } finally {
      setIsGeneratingSlideOutline(false);
    }
  };

  const handleSaveSettings = () => {
    saveModelSettings(modelSettings);
    saveEmbeddingSettings(embeddingSettings);
    saveLanguage(language);
    setIsSettingsOpen(false);
    setStatus(t("settingsSaved") as string);
  };

  const handleTestModelConnection = async () => {
    setModelTestState({ loading: true, message: "Testing connection and loading models..." });
    try {
      const result = await testModelConnection(modelSettings);
      setAvailableModels(result.models);
      if (result.models.length && !result.models.includes(modelSettings.model)) {
        setModelSettings({ ...modelSettings, model: result.models[0] });
      }
      setModelTestState({ loading: false, ok: result.ok, message: result.message });
    } catch (error) {
      setAvailableModels([]);
      setModelTestState({ loading: false, ok: false, message: `Connection test failed: ${error}` });
    }
  };

  const startSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(clamp(startWidth + moveEvent.clientX - startX, 220, 520));
    };
    const handleUp = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [sidebarWidth]);

  const startBottomResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomPanelHeight;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      setBottomPanelHeight(clamp(startHeight + startY - moveEvent.clientY, 160, 460));
    };
    const handleUp = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [bottomPanelHeight]);

  const startSummaryDrawerResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = summaryDrawerWidth;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      setSummaryDrawerWidth(clamp(startWidth + startX - moveEvent.clientX, 360, Math.max(520, window.innerWidth - sidebarWidth - 80)));
    };
    const handleUp = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [summaryDrawerWidth, sidebarWidth]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const totalDocuments = projects.reduce((sum, project) => sum + project.documents.length, 0);
  const selectedDocumentCount = selectedProject?.documents.length ?? 0;
  return (
    <div data-app="anshu-doc" data-view="workspace" className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      <Sidebar
        sidebarWidth={sidebarWidth}
        startSidebarResize={startSidebarResize}
        t={t as any}
        projects={projects}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        setIsSummaryDrawerOpen={setIsSummaryDrawerOpen}
        setIsGraphDrawerOpen={setIsGraphDrawerOpen}
        setDocumentPreview={setDocumentPreview}
        handleAddProject={handleAddProject}
        projectMenuId={projectMenuId}
        setProjectMenuId={setProjectMenuId}
        handleBuildProjectGraph={handleBuildProjectGraph}
        openSlideOutlineComposer={openSlideOutlineComposer}
        showProjectContent={showProjectContent}
        handleRefreshProject={handleRefreshProject}
        documentPreview={documentPreview}
        handleOpenDocument={handleOpenDocument}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      <main className="relative flex-1 flex flex-col min-w-0">
        <Header
          selectedProject={selectedProject}
          status={status}
          t={t as any}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />

        <DocumentWorkspace
          isDocumentLoading={isDocumentLoading}
          buildProgress={buildProgress}
          documentPreview={documentPreview}
        />

        {selectedProject && (
          <GraphDrawer
            selectedProject={selectedProject}
            isGraphDrawerOpen={isGraphDrawerOpen}
            setIsGraphDrawerOpen={setIsGraphDrawerOpen}
            currentGraph={currentGraph}
            t={t as any}
            viewMode={viewMode}
            setViewMode={setViewMode}
            colorMode={colorMode}
            setColorMode={setColorMode}
            containerRef={containerRef}
            nodeContextMenu={nodeContextMenu}
            setNodeContextMenu={setNodeContextMenu}
            showNodeSummary={showNodeSummary}
            isInitialLoading={isInitialLoading}
            handleBuildGraph={handleBuildGraph}
            startBottomResize={startBottomResize}
            bottomPanelHeight={bottomPanelHeight}
            selectedDocumentCount={selectedDocumentCount}
            activeHighlightId={activeHighlightId}
            setActiveHighlightId={setActiveHighlightId}
            rendererRef={rendererRef}
            renderer2dRef={renderer2dRef}
            selectNode={selectNode}
            isDark={isDark}
            nodeColor={nodeColor}
          />
        )}

        {selectedProject && (
          <SummaryDrawer
            selectedProject={selectedProject}
            isSummaryDrawerOpen={isSummaryDrawerOpen}
            setIsSummaryDrawerOpen={setIsSummaryDrawerOpen}
            summaryDrawerWidth={summaryDrawerWidth}
            startSummaryDrawerResize={startSummaryDrawerResize}
            summaryDrawer={summaryDrawer}
            setSummaryDrawer={setSummaryDrawer}
            isSlideOutlineComposerOpen={isSlideOutlineComposerOpen}
            setIsSlideOutlineComposerOpen={setIsSlideOutlineComposerOpen}
            slideOutlineForm={slideOutlineForm}
            setSlideOutlineForm={setSlideOutlineForm}
            handleGenerateSlideOutline={handleGenerateSlideOutline}
            isGeneratingSlideOutline={isGeneratingSlideOutline}
            summaries={summaries}
          />
        )}
      </main>

      <SettingsDialog
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        t={t as any}
        language={language}
        setLanguage={setLanguage}
        modelSettings={modelSettings}
        setModelSettings={setModelSettings}
        availableModels={availableModels}
        setAvailableModels={setAvailableModels}
        modelTestState={modelTestState}
        setModelTestState={setModelTestState}
        handleTestModelConnection={handleTestModelConnection}
        embeddingSettings={embeddingSettings}
        setEmbeddingSettings={setEmbeddingSettings}
        embeddingProviderLabel={embeddingProviderLabel}
        defaultEmbeddingSettingsForProvider={defaultEmbeddingSettingsForProvider}
        handleSaveSettings={handleSaveSettings}
      />
    </div>
  );
}
