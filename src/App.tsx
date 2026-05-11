import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Lightbulb
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
  type ProjectInfo
} from "./projects";
import {
  loadModelSettings,
  saveModelSettings,
  extractConceptsWithModel,
  type ModelSettings,
  type ModelProvider
} from "./model";
import {
  hydrateBrainGraph,
  serializeBrainGraph,
  buildBrainGraph,
  type BrainGraph,
  type GraphNode
} from "./graph";
import { render3DGraph, type Graph3DRenderer } from "./render3d";
import { render2DGraph, type Graph2DRenderer } from "./render2d";
import { applyGraphVisualEncoding, type NodeColorMode } from "./visualEncoding";
import { loadLanguage, saveLanguage, translate, type Language, type MessageKey } from "./i18n";

// Types
import { GraphViewMode, SettingsSection } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ContentMode = "graph" | "summary";

function createProjectSummary(project: ProjectInfo, graph: BrainGraph): string {
  const topNodes = graph.nodes.slice(0, 12);
  const communities = new Map<number, typeof graph.nodes>();
  for (const node of graph.nodes) {
    const group = communities.get(node.community) ?? [];
    group.push(node);
    communities.set(node.community, group);
  }
  const communitySections = [...communities.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([community, nodes], index) => {
      const labels = nodes
        .sort((a, b) => b.frequency - a.frequency || b.pagerank - a.pagerank)
        .slice(0, 10)
        .map((node) => `${node.label}(${node.frequency})`)
        .join("、");
      return `### ${index + 1}. 主题簇 ${community + 1}\n\n- 规模：${nodes.length} 个概念\n- 代表概念：${labels || "暂无"}`;
    })
    .join("\n\n");
  const extensionStats = project.documents.reduce<Record<string, number>>((acc, document) => {
    acc[document.extension] = (acc[document.extension] ?? 0) + 1;
    return acc;
  }, {});
  const documentLine = Object.entries(extensionStats)
    .sort((a, b) => b[1] - a[1])
    .map(([extension, count]) => `${extension.toUpperCase()} ${count}`)
    .join("、") || "暂无文档";

  return [
    `# ${project.name} 知识图谱摘要`,
    "## 1. 项目概览",
    `- 文档数量：${project.documents.length}`,
    `- 文档类型：${documentLine}`,
    `- 概念数量：${graph.stats.terms}`,
    `- 关系数量：${graph.stats.links}`,
    `- 主题簇数量：${graph.stats.communities}`,
    `- 网络密度：${graph.stats.density.toFixed(3)}`,
    "## 2. 核心概念",
    topNodes.length
      ? topNodes.map((node, index) => `${index + 1}. **${node.label}**：命中 ${node.frequency} 次，PageRank ${node.pagerank.toFixed(3)}，类型 ${node.kind}。`).join("\n")
      : "暂无核心概念。",
    "## 3. 主题结构",
    communitySections || "暂无明显主题簇。",
    "## 4. 结构洞察",
    graph.insights.length
      ? graph.insights.map((insight) => `- **${insight.title}**：${insight.detail}`).join("\n")
      : "- 暂无洞察。",
    "## 5. 后续分析建议",
    "- 优先查看高频概念与高 PageRank 概念是否一致，用于识别核心主题和噪声词。",
    "- 对桥接概念进行人工复核，它们通常代表跨主题连接、流程节点或潜在关键实体。",
    "- 如果主题簇过少，补充差异化文档；如果主题簇过多，检查同义词归并和模型抽取质量。"
  ].join("\n\n");
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-6 text-sm leading-7 text-foreground">
      {markdown.split(/\n{2,}/).map((block, index) => {
        const text = block.trim();
        if (!text) return null;
        if (text.startsWith("# ")) {
          return <h1 key={index} className="text-2xl font-semibold leading-tight">{renderInlineMarkdown(text.slice(2))}</h1>;
        }
        if (text.startsWith("## ")) {
          return <h2 key={index} className="border-b pb-2 text-lg font-semibold leading-tight">{renderInlineMarkdown(text.slice(3))}</h2>;
        }
        if (text.startsWith("### ")) {
          return <h3 key={index} className="text-base font-semibold leading-tight">{renderInlineMarkdown(text.slice(4))}</h3>;
        }
        const lines = text.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInlineMarkdown(line.slice(2))}</li>)}
            </ul>
          );
        }
        if (lines.every((line) => /^\d+\.\s/.test(line))) {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInlineMarkdown(line.replace(/^\d+\.\s/, ""))}</li>)}
            </ol>
          );
        }
        return <p key={index} className="whitespace-pre-wrap">{renderInlineMarkdown(text)}</p>;
      })}
    </div>
  );
}

export default function App() {
  // --- State ---
  const [language, setLanguage] = useState<Language>(loadLanguage());
  const [isDark, setIsDark] = useState(true);
  const [projects, setProjects] = useState<ProjectInfo[]>(loadProjects());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [currentGraph, setCurrentGraph] = useState<BrainGraph | null>(null);
  const [viewMode, setViewMode] = useState<GraphViewMode>("2d");
  const [colorMode, setColorMode] = useState<NodeColorMode>("community");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(loadModelSettings());
  const [status, setStatus] = useState<string>("");
  const [buildProgress, setBuildProgress] = useState<{ percent: number, message: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("general");
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(288);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>("graph");
  const [summaries, setSummaries] = useState<Record<string, string>>(() => {
    const raw = localStorage.getItem("brain-graph:project-summaries");
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
    const saved = localStorage.getItem("brain-graph:theme") || "dark";
    const dark = saved === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("brain-graph:theme", next ? "dark" : "light");
  };

  // Load graph when project changes
  const loadGraph = useCallback(async (project: ProjectInfo) => {
    try {
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

  // Graph Rendering
  useEffect(() => {
    if (!containerRef.current) return;

    rendererRef.current?.destroy();
    rendererRef.current = null;
    renderer2dRef.current?.destroy();
    renderer2dRef.current = null;
    if (!currentGraph || contentMode !== "graph") return;

    applyGraphVisualEncoding(currentGraph.graph, currentGraph.nodes, currentGraph.edges, colorMode);

    if (viewMode === "2d") {
      renderer2dRef.current = render2DGraph(currentGraph, containerRef.current, selectNode);
      return () => {
        renderer2dRef.current?.destroy();
        renderer2dRef.current = null;
      };
    }

    void render3DGraph(currentGraph, containerRef.current, colorMode, (nodeId) => {
      const attrs = currentGraph.graph.getNodeAttributes(nodeId);
      setStatus(`${attrs.label}: frequency ${attrs.frequency}, pagerank ${attrs.pagerank.toFixed(3)}`);
    }).then(r => {
      rendererRef.current = r;
    });

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [currentGraph, viewMode, colorMode, selectNode, contentMode]);

  // --- Actions ---

  const handleAddProject = async () => {
    const newProject = await openProjectFolder();
    if (!newProject) return;
    const nextProjects = [...projects, newProject];
    setProjects(nextProjects);
    saveProjects(nextProjects);
    setSelectedProjectId(newProject.id);
  };

  const handleBuildGraph = async () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;

    try {
      setBuildProgress({ percent: 0, message: t("readingDocuments") });
      // This part would ideally be async with progress reporting from Tauri
      // For now, keeping it consistent with legacy imperative logic
      const graph = await buildBrainGraph(project, modelSettings, (percent, msg) => {
        setBuildProgress({ percent, message: msg });
      });

      setCurrentGraph(graph);
      await saveProjectGraph(project.path, JSON.stringify(serializeBrainGraph(graph)));
      saveSummaries({ ...summaries, [project.id]: createProjectSummary(project, graph) });
      setBuildProgress(null);
      setStatus(`Graph built for ${project.name}`);
    } catch (error) {
      setBuildProgress(null);
      setStatus(`Build failed: ${error}`);
    }
  };

  const handleBuildProjectGraph = async (project: ProjectInfo) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    setContentMode("graph");

    try {
      setBuildProgress({ percent: 0, message: t("readingDocuments") });
      const graph = await buildBrainGraph(project, modelSettings, (percent, msg) => {
        setBuildProgress({ percent, message: msg });
      });

      setCurrentGraph(graph);
      await saveProjectGraph(project.path, JSON.stringify(serializeBrainGraph(graph)));
      saveSummaries({ ...summaries, [project.id]: createProjectSummary(project, graph) });
      setBuildProgress(null);
      setStatus(`Graph built for ${project.name}`);
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

  const saveSummaries = (nextSummaries: Record<string, string>) => {
    setSummaries(nextSummaries);
    localStorage.setItem("brain-graph:project-summaries", JSON.stringify(nextSummaries));
  };

  const showProjectContent = async (project: ProjectInfo, mode: ContentMode) => {
    setSelectedProjectId(project.id);
    setContentMode(mode);
    setProjectMenuId(null);
    if (mode !== "summary" || summaries[project.id]) return;

    const graph = project.id === selectedProjectId && currentGraph
      ? currentGraph
      : await loadProjectGraph(project.path).then((graphJson) => graphJson ? hydrateBrainGraph(JSON.parse(graphJson)) : null);
    if (!graph) return;

    setCurrentGraph(graph);
    saveSummaries({ ...summaries, [project.id]: createProjectSummary(project, graph) });
  };

  const handleSaveSettings = () => {
    saveModelSettings(modelSettings);
    saveLanguage(language);
    setIsSettingsOpen(false);
    setStatus(t("settingsSaved") as string);
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

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside
        className="relative shrink-0 border-r bg-muted/30 backdrop-blur-xl flex flex-col"
        style={{ width: sidebarWidth }}
      >
        <div className="h-16 flex items-center px-6 border-b">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
              <Box size={20} />
            </div>
            <span>Brain Graph</span>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">{t("projects")}</h2>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddProject}>
              <Plus size={14} />
            </Button>
          </div>

          <div className="space-y-1">
            {projects.map(project => (
              <div key={project.id} className="group relative flex flex-col">
                <div
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-all",
                    selectedProjectId === project.id
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <button
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setContentMode("graph");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm font-medium"
                  >
                    <div className={cn("h-1.5 w-1.5 rounded-full", selectedProjectId === project.id ? "bg-primary" : "bg-muted-foreground/30")} />
                    <span className="truncate">{project.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${project.name} menu`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-background/70 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      setProjectMenuId(projectMenuId === project.id ? null : project.id);
                    }}
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>

                {projectMenuId === project.id && (
                  <div className="absolute right-2 top-9 z-40 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleBuildProjectGraph(project)}>
                      构建图谱
                    </button>
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleRefreshProject(project)}>
                      刷新
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showProjectContent(project, "graph")}>
                      显示图谱
                    </button>
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showProjectContent(project, "summary")}>
                      显示摘要
                    </button>
                  </div>
                )}

                {selectedProjectId === project.id && (
                  <div className="mt-1 ml-4 pl-4 border-l space-y-1 animate-in fade-in slide-in-from-left-2 duration-300">
                    {project.documents.slice(0, 10).map(doc => (
                      <div key={doc.name} className="flex items-center justify-between text-[11px] text-muted-foreground py-1 px-2 rounded hover:bg-accent/30 transition-colors">
                        <span className="truncate">{doc.name}</span>
                        <span className="text-[9px] font-bold opacity-50 uppercase">{doc.extension}</span>
                      </div>
                    ))}
                    {project.documents.length > 10 && (
                      <div className="text-[10px] text-muted-foreground italic px-2 py-1">
                        + {project.documents.length - 10} more...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/20">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={18} />
            <span className="text-sm font-medium">{t("settings")}</span>
          </Button>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="absolute right-[-3px] top-0 z-30 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 active:bg-primary/40"
          onPointerDown={startSidebarResize}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold">{selectedProject?.name || "No Project Selected"}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{status || t("ready")}</p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>

            <Separator orientation="vertical" className="h-8" />
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-[11px] transition-all",
                  viewMode === "2d" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewMode("2d")}
              >
                <LayoutGrid size={14} className="mr-1.5" />
                2D
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-[11px] transition-all",
                  viewMode === "3d" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewMode("3d")}
              >
                <Box size={14} className="mr-1.5" />
                3D
              </Button>
            </div>

            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-[11px] transition-all",
                  colorMode === "community" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setColorMode("community")}
              >
                {t("colorCommunity")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-[11px] transition-all",
                  colorMode === "kind" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setColorMode("kind")}
              >
                {t("colorKind")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-[11px] transition-all",
                  colorMode === "frequency" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setColorMode("frequency")}
              >
                {t("heat")}
              </Button>
            </div>
          </div>
        </header>

        {/* Graph Workspace */}
        <div className="flex-1 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950">
          <div ref={containerRef} className={cn("absolute inset-0", contentMode === "summary" && "hidden")} />

          {contentMode === "summary" && selectedProject && (
            <div className="absolute inset-0 overflow-auto bg-background p-8">
              <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedProject.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">项目摘要</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setContentMode("graph")}>
                    显示图谱
                  </Button>
                </div>
                <MarkdownPreview markdown={summaries[selectedProject.id] || "## 暂无摘要\n\n请先在项目菜单中点击“构建图谱”，摘要会在图谱构建完成后自动生成。"} />
              </div>
            </div>
          )}

          {contentMode === "graph" && !currentGraph && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
              <Database size={48} className="mb-4 opacity-20" />
              <h3 className="text-lg font-medium">{t("noSavedGraph")}</h3>
              <p className="text-sm max-w-xs">{t("emptyStatus")}</p>
              <Button variant="outline" className="mt-6" onClick={handleBuildGraph}>
                {t("buildGraph")}
              </Button>
            </div>
          )}

          {buildProgress && (
            <Card className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80 shadow-2xl border-primary/20 bg-background/90 backdrop-blur-xl animate-in zoom-in-95">
              <CardContent className="p-4 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest">{buildProgress.message}</span>
                  <span className="text-[10px] font-bold">{Math.round(buildProgress.percent)}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${buildProgress.percent}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize bottom panel"
          className="h-1.5 shrink-0 cursor-row-resize border-t bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50"
          onPointerDown={startBottomResize}
        />

        {/* Bottom Section */}
        <section
          className="shrink-0 grid grid-cols-2 divide-x bg-muted/10"
          style={{ height: bottomPanelHeight }}
        >
          <div className="flex flex-col p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb size={14} className="text-amber-500" />
              <h3 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">{t("insights")}</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-3 pr-4">
                {currentGraph?.insights.map((insight, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-4 rounded-xl border-l-4 transition-all hover:translate-x-1",
                      insight.kind === "bridge" ? "border-emerald-500 bg-emerald-500/5" :
                        insight.kind === "gap" ? "border-amber-500 bg-amber-500/5" :
                          "border-blue-500 bg-blue-500/5"
                    )}
                  >
                    <strong className="block text-xs font-bold mb-1">{insight.title}</strong>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex flex-col p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-blue-500" />
              <h3 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">{t("topTerms")}</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-2 pr-4">
                {currentGraph?.nodes.slice(0, 20).map((node, i) => (
                  <button
                    key={node.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border bg-background hover:bg-accent hover:border-accent transition-all text-left group"
                    onClick={() => {
                      const nodeObj = rendererRef.current?.instance.graphData().nodes.find((n: any) => n.id === node.id);
                      if (nodeObj) {
                        const distance = 80;
                        const distRatio = 1 + distance / Math.hypot(nodeObj.x || 1, nodeObj.y || 1, nodeObj.z || 1);
                        rendererRef.current?.instance.cameraPosition(
                          {
                            x: (nodeObj.x || 0) * distRatio,
                            y: (nodeObj.y || 0) * distRatio,
                            z: (nodeObj.z || 0) * distRatio
                          },
                          nodeObj,
                          700
                        );
                      }
                      selectNode(node.id);
                    }}
                  >
                    <span className="text-[11px] font-medium truncate mr-2">{node.label}</span>
                    <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{node.frequency}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </section>
      </main>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t("settings")}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="general">{t("general")}</TabsTrigger>
              <TabsTrigger value="model">{t("models")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("language")}</label>
                <Select value={language} onValueChange={(val: Language) => setLanguage(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文 (Chinese)</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="model" className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{t("enableModel")}</div>
                  <div className="text-xs text-muted-foreground">Use LLM to improve entity extraction</div>
                </div>
                <input
                  type="checkbox"
                  checked={modelSettings.enabled}
                  onChange={(e) => setModelSettings({ ...modelSettings, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("provider")}</label>
                    <Select value={modelSettings.provider} onValueChange={(val: ModelProvider) => setModelSettings({ ...modelSettings, provider: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="minimax">MiniMax</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("modelName")}</label>
                    <input
                      type="text"
                      value={modelSettings.model}
                      onChange={(e) => setModelSettings({ ...modelSettings, model: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <input
                    type="text"
                    value={modelSettings.baseUrl}
                    onChange={(e) => setModelSettings({ ...modelSettings, baseUrl: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <input
                    type="password"
                    value={modelSettings.apiKey}
                    onChange={(e) => setModelSettings({ ...modelSettings, apiKey: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setIsSettingsOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveSettings}>{t("save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
