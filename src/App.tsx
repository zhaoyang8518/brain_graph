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
  Lightbulb,
  X
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
  buildProjectGraphInput,
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
type SummaryDrawerState = { title: string; subtitle: string; markdown: string };

type ParsedDocument = {
  name: string;
  path: string;
  text: string;
};

function createProjectSummary(project: ProjectInfo, graph: BrainGraph, sourceText: string): string {
  const documents = parseProjectDocuments(sourceText);
  const keywords = graph.nodes
    .slice(0, 24)
    .map((node) => node.label)
    .filter(Boolean);
  const extensionStats = project.documents.reduce<Record<string, number>>((acc, document) => {
    acc[document.extension] = (acc[document.extension] ?? 0) + 1;
    return acc;
  }, {});
  const documentLine = Object.entries(extensionStats)
    .sort((a, b) => b[1] - a[1])
    .map(([extension, count]) => `${extension.toUpperCase()} ${count}`)
    .join("、") || "暂无文档";
  const allText = documents.map((document) => document.text).join("\n");
  const overview = pickImportantSentences(allText, keywords, 5);
  const documentSummaries = documents.slice(0, 20).map((document, index) => {
    const headings = extractHeadings(document.text).slice(0, 8);
    const points = pickImportantSentences(document.text, keywords, 4);
    return [
      `### ${index + 1}. ${document.name}`,
      headings.length ? `- 主要章节：${headings.join("、")}` : "- 主要章节：未识别到明确标题",
      points.length
        ? points.map((point) => `- ${point}`).join("\n")
        : "- 未提取到足够正文内容。"
    ].join("\n");
  }).join("\n\n");
  const themeLines = keywords.slice(0, 12).map((keyword) => `- ${keyword}`);

  return [
    `# ${project.name} 文档综合摘要`,
    "## 1. 项目概览",
    `- 文档数量：${project.documents.length}`,
    `- 文档类型：${documentLine}`,
    `- 已解析文档：${documents.length}`,
    `- 正文规模：约 ${allText.length.toLocaleString()} 字符`,
    "## 2. 综合摘要",
    overview.length ? overview.map((sentence) => `- ${sentence}`).join("\n") : "- 当前项目文档正文不足，暂时无法形成可靠的综合摘要。",
    "## 3. 主要主题",
    themeLines.length ? themeLines.join("\n") : "- 暂无明确主题。",
    "## 4. 分文档要点",
    documentSummaries || "暂无可摘要文档。",
    "## 5. 阅读建议",
    "- 先阅读综合摘要和主要主题，建立项目整体上下文。",
    "- 再按“分文档要点”定位具体文档，回到原文件查看细节。",
    "- 如果摘要偏泛，建议启用 Ollama 或云模型，让模型基于解析后的文档正文生成更高质量摘要。"
  ].join("\n\n");
}

function createNodeSummary(
  graph: BrainGraph,
  nodeId: string,
  sourceText: string,
  mode: "node" | "related"
): SummaryDrawerState {
  const attrs = graph.graph.getNodeAttributes(nodeId);
  const label = String(attrs.label || nodeId);
  const relatedLabels = mode === "related"
    ? graph.graph.neighbors(nodeId).map((neighbor) => String(graph.graph.getNodeAttribute(neighbor, "label") || neighbor))
    : [];
  const keywords = mode === "related" ? [label, ...relatedLabels] : [label];
  const sentences = pickImportantSentences(sourceText, keywords, mode === "related" ? 12 : 8);
  const relatedLines = relatedLabels.slice(0, 24).map((item) => `- ${item}`);
  const markdown = [
    `# ${label} ${mode === "related" ? "关联性摘要" : "摘要"}`,
    "## 1. 节点信息",
    `- 概念：${label}`,
    `- 命中次数：${attrs.frequency ?? 0}`,
    `- PageRank：${Number(attrs.pagerank ?? 0).toFixed(4)}`,
    `- 社区：${attrs.community ?? 0}`,
    mode === "related" ? "## 2. 关联节点" : "",
    mode === "related" ? (relatedLines.length ? relatedLines.join("\n") : "- 暂无关联节点。") : "",
    mode === "related" ? "## 3. 关联内容摘要" : "## 2. 内容摘要",
    sentences.length
      ? sentences.map((sentence) => `- ${sentence}`).join("\n")
      : "- 当前项目文档中没有提取到足够的相关句子。建议重新构建图谱或扩大文档内容。",
    mode === "related" ? "## 4. 使用建议" : "## 3. 使用建议",
    mode === "related"
      ? "- 可从关联节点切入，查看这些概念在同一主题簇中的共同上下文。"
      : "- 可查看“关联性摘要”，理解该概念和相邻概念之间的上下文关系。"
  ].filter(Boolean).join("\n\n");

  return {
    title: label,
    subtitle: mode === "related" ? "节点关联性摘要" : "节点摘要",
    markdown
  };
}

function parseProjectDocuments(sourceText: string): ParsedDocument[] {
  return sourceText
    .split(/\n{2,}# Document: /)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const lines = section.split("\n");
      const name = lines.shift()?.replace(/^# Document:\s*/, "").trim() || "Untitled";
      const pathLine = lines[0]?.startsWith("Path:") ? lines.shift() : "";
      const path = pathLine?.replace(/^Path:\s*/, "").trim() || "";
      return {
        name,
        path,
        text: cleanDocumentText(lines.join("\n"))
      };
    })
    .filter((document) => document.text.length > 0);
}

function cleanDocumentText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^Path:.*$/gm, "")
    .replace(/^Type:.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHeadings(text: string): string[] {
  const markdownHeadings = [...text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1].trim());
  if (markdownHeadings.length) return unique(markdownHeadings).slice(0, 12);
  return unique(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 4 && line.length <= 40 && !/[。！？.!?]$/.test(line))
  ).slice(0, 12);
}

function pickImportantSentences(text: string, keywords: string[], limit: number): string[] {
  const sentences = splitSentences(text)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18 && sentence.length <= 220);
  return unique(sentences)
    .map((sentence) => ({
      sentence,
      score: scoreSentence(sentence, keywords)
    }))
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)
    .slice(0, limit)
    .map((item) => item.sentence);
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ");
  const sentences: string[] = [];
  let current = "";
  for (const char of normalized) {
    current += char;
    if ("。！？.!?".includes(char)) {
      const sentence = current.trim();
      if (sentence) sentences.push(sentence);
      current = "";
    }
  }
  const tail = current.trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function scoreSentence(sentence: string, keywords: string[]): number {
  const lower = sentence.toLowerCase();
  const keywordScore = keywords.reduce((score, keyword) => {
    return lower.includes(keyword.toLowerCase()) ? score + 3 : score;
  }, 0);
  const structureScore = /目标|问题|方案|建议|结论|背景|风险|流程|系统|数据|模型|实现/.test(sentence) ? 2 : 0;
  return keywordScore + structureScore + Math.min(sentence.length / 80, 2);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<NodeColorMode>("community");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(loadModelSettings());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelTestState, setModelTestState] = useState<{ loading: boolean; message: string; ok?: boolean }>({ loading: false, message: "" });
  const [status, setStatus] = useState<string>("");
  const [buildProgress, setBuildProgress] = useState<BuildProgressState | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("general");
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(288);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
  const [summaryDrawer, setSummaryDrawer] = useState<SummaryDrawerState | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState>(null);
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
  }, [currentGraph, viewMode, colorMode, selectNode, openNodeContextMenu]);

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
      const graph = await buildBrainGraph(project, modelSettings, updateBuildProgress, false);

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
      const graph = await buildBrainGraph(project, modelSettings, updateBuildProgress, rebuild);

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

  const saveSummaries = (nextSummaries: Record<string, string>) => {
    setSummaries(nextSummaries);
    localStorage.setItem("brain-graph:project-summaries", JSON.stringify(nextSummaries));
  };

  const showProjectContent = async (project: ProjectInfo, mode: ProjectContentMode) => {
    setSelectedProjectId(project.id);
    setProjectMenuId(null);
    if (mode === "graph") {
      setIsSummaryDrawerOpen(false);
      setSummaryDrawer(null);
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
      setCurrentGraph(graph);
      const markdown = createProjectSummary(project, graph, input.text);
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
      setSummaryDrawer(createNodeSummary(currentGraph, nodeId, input.text, mode));
    } catch (error) {
      setSummaryDrawer({
        title: "摘要生成失败",
        subtitle: mode === "related" ? "节点关联性摘要" : "节点摘要",
        markdown: `## 摘要生成失败\n\n${String(error)}`
      });
    }
  };

  const handleSaveSettings = () => {
    saveModelSettings(modelSettings);
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

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const totalDocuments = projects.reduce((sum, project) => sum + project.documents.length, 0);
  const selectedDocumentCount = selectedProject?.documents.length ?? 0;
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside
        className="relative shrink-0 border-r bg-muted/30 backdrop-blur-xl flex flex-col"
        style={{ width: sidebarWidth }}
      >
        <div className="h-16 flex items-center px-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-background border border-border rounded-xl flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-bold tracking-tight text-sm truncate">AnshuDoc</div>
              <div className="truncate text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">Anshusoft Grove</div>
            </div>
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
                      setIsSummaryDrawerOpen(false);
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
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleBuildProjectGraph(project, false)}>
                      增量构建图谱
                    </button>
                    <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleBuildProjectGraph(project, true)}>
                      重新构建图谱
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
      <main className="relative flex-1 flex flex-col min-w-0">
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
        <div className="flex-1 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950" onClick={() => setNodeContextMenu(null)}>
          <div ref={containerRef} className="absolute inset-0" />

          {nodeContextMenu && (
            <div
              className="fixed z-50 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
              style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
                onClick={() => void showNodeSummary(nodeContextMenu.nodeId, "node")}
              >
                显示摘要
              </button>
              <button
                className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
                onClick={() => void showNodeSummary(nodeContextMenu.nodeId, "related")}
              >
                关联性摘要
              </button>
            </div>
          )}

          {!currentGraph && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
              {isInitialLoading ? (
                <>
                  <RefreshCw size={24} className="mb-4 opacity-20 animate-spin" />
                  <h3 className="text-sm font-medium">{t("loadingData")}</h3>
                </>
              ) : (
                <>
                  <Database size={48} className="mb-4 opacity-20" />
                  <h3 className="text-lg font-medium">{t("noSavedGraph")}</h3>
                  <p className="text-sm max-w-xs">{t("emptyStatus")}</p>
                  <Button variant="outline" className="mt-6" onClick={handleBuildGraph}>
                    {t("buildGraph")}
                  </Button>
                </>
              )}
            </div>
          )}

          {buildProgress && (
            <Card className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(520px,calc(100%-48px))] shadow-2xl border-primary/20 bg-background/90 backdrop-blur-xl animate-in zoom-in-95">
              <CardContent className="p-4 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="min-w-0 pr-4 text-[10px] font-bold uppercase tracking-widest">{buildProgress.message}</span>
                  <span className="text-[10px] font-bold">{Math.round(buildProgress.percent)}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${buildProgress.percent}%` }}
                  />
                </div>
                {buildProgress.details && buildProgress.details.length > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-[11px] leading-5 text-muted-foreground">
                    {buildProgress.details.slice(0, 4).map((detail, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                        <span className="min-w-0 break-words">{detail}</span>
                      </div>
                    ))}
                  </div>
                )}
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
          className="shrink-0 grid grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] divide-x bg-muted/10"
          style={{ height: bottomPanelHeight }}
        >
          <div className="flex flex-col p-3 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Database size={14} className="text-emerald-500" />
              <h3 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">统计</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-background/70 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">节点</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{currentGraph?.nodes.length ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">关系</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{currentGraph?.edges.length ?? 0}</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border bg-background/70 p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">当前项目</div>
              <div className="mt-1 truncate text-sm font-medium">{selectedProject?.name || "未选择"}</div>
              <div className="mt-2 text-xs text-muted-foreground">{selectedDocumentCount} docs</div>
            </div>
          </div>

          <div className="flex flex-col p-3 overflow-hidden">
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

          <div className="flex flex-col p-3 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-blue-500" />
              <h3 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">{t("topTerms")}</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-3 gap-2 p-1 pr-4">
                {currentGraph?.nodes.slice(0, 20).map((node, i) => (
                  <button
                    key={node.id}
                    className={cn(
                      "relative flex items-center justify-between px-2 py-2.5 rounded-xl transition-all text-left group border-0 shadow-md hover:brightness-110 active:scale-[0.98] overflow-hidden",
                      activeHighlightId === node.id && "pl-5 shadow-lg"
                    )}
                    style={{
                      backgroundColor: nodeColor(node, colorMode),
                      color: "#ffffff",
                    }}
                    onClick={() => {
                      // 3D focus
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

                      // 2D highlight toggle
                      const isCurrentlyHighlighted = activeHighlightId === node.id;
                      const nextId = isCurrentlyHighlighted ? null : node.id;
                      setActiveHighlightId(nextId);
                      if (renderer2dRef.current) {
                        renderer2dRef.current.setHighlightedNode(nextId);
                      }

                      selectNode(node.id);
                    }}
                  >
                    {activeHighlightId === node.id && (
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl transition-all",
                        isDark ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "bg-black"
                      )} />
                    )}
                    <span className="text-[11px] font-bold truncate mr-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                      {node.label}
                    </span>
                    <span className="text-[9px] font-black bg-black/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full text-white/90">
                      {node.frequency}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </section>

        {selectedProject && (
          <div
            className={cn(
              "absolute bottom-0 right-0 top-16 z-30 flex w-[min(720px,calc(100%-32px))] max-w-full flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out",
              isSummaryDrawerOpen ? "translate-x-0" : "translate-x-full"
            )}
            aria-hidden={!isSummaryDrawerOpen}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b px-6">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{summaryDrawer?.title || selectedProject.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{summaryDrawer?.subtitle || "项目文档综合摘要"}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => {
                setIsSummaryDrawerOpen(false);
                setSummaryDrawer(null);
              }} aria-label="关闭摘要">
                <X size={18} />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6">
                <MarkdownPreview markdown={summaryDrawer?.markdown || summaries[selectedProject.id] || "## 暂无摘要\n\n请先在项目菜单中点击“增量构建图谱”或“重新构建图谱”，摘要会在图谱构建完成后自动生成。"} />
              </div>
            </ScrollArea>
          </div>
        )}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("provider")}</label>
                  <Select value={modelSettings.provider} onValueChange={(val: ModelProvider) => {
                    setModelSettings({ ...modelSettings, provider: val, model: "" });
                    setAvailableModels([]);
                    setModelTestState({ loading: false, message: "" });
                  }}>
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
                  <label className="text-sm font-medium">Base URL</label>
                  <input
                    type="text"
                    value={modelSettings.baseUrl}
                    onChange={(e) => {
                      setModelSettings({ ...modelSettings, baseUrl: e.target.value, model: "" });
                      setAvailableModels([]);
                      setModelTestState({ loading: false, message: "" });
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <input
                    type="password"
                    value={modelSettings.apiKey}
                    onChange={(e) => {
                      setModelSettings({ ...modelSettings, apiKey: e.target.value, model: "" });
                      setAvailableModels([]);
                      setModelTestState({ loading: false, message: "" });
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestModelConnection}
                    disabled={modelTestState.loading}
                  >
                    {modelTestState.loading ? "Testing..." : "测试连接"}
                  </Button>
                  {modelTestState.message && (
                    <span className={cn(
                      "text-xs",
                      modelTestState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    )}>
                      {modelTestState.message}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("modelName")}</label>
                  <Select value={modelSettings.model} onValueChange={(value) => setModelSettings({ ...modelSettings, model: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom Model Name</label>
                  <input
                    type="text"
                    value={modelSettings.model}
                    onChange={(e) => setModelSettings({ ...modelSettings, model: e.target.value })}
                    placeholder="Enter a model name manually"
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
