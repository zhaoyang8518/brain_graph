import React from "react";
import { LayoutGrid, Box, X, RefreshCw, Database, Lightbulb, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ProjectInfo } from "../../projects";
import type { BrainGraph, GraphNode } from "../../graph";

export type NodeColorMode = "community" | "kind" | "frequency";

interface GraphDrawerProps {
  selectedProject: ProjectInfo;
  isGraphDrawerOpen: boolean;
  setIsGraphDrawerOpen: (isOpen: boolean) => void;
  currentGraph: BrainGraph | null;
  t: (key: string) => string;
  viewMode: "2d" | "3d";
  setViewMode: (mode: "2d" | "3d") => void;
  colorMode: NodeColorMode;
  setColorMode: (mode: NodeColorMode) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  nodeContextMenu: { nodeId: string; x: number; y: number } | null;
  setNodeContextMenu: (menu: { nodeId: string; x: number; y: number } | null) => void;
  showNodeSummary: (nodeId: string, type: "node" | "related") => Promise<void>;
  isInitialLoading: boolean;
  handleBuildGraph: () => void;
  startBottomResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  bottomPanelHeight: number;
  selectedDocumentCount: number;
  activeHighlightId: string | null;
  setActiveHighlightId: (id: string | null) => void;
  rendererRef: React.MutableRefObject<any>;
  renderer2dRef: React.MutableRefObject<any>;
  selectNode: (id: string) => void;
  isDark: boolean;
  nodeColor: (node: GraphNode, mode: NodeColorMode) => string;
}

export function GraphDrawer({
  selectedProject,
  isGraphDrawerOpen,
  setIsGraphDrawerOpen,
  currentGraph,
  t,
  viewMode,
  setViewMode,
  colorMode,
  setColorMode,
  containerRef,
  nodeContextMenu,
  setNodeContextMenu,
  showNodeSummary,
  isInitialLoading,
  handleBuildGraph,
  startBottomResize,
  bottomPanelHeight,
  selectedDocumentCount,
  activeHighlightId,
  setActiveHighlightId,
  rendererRef,
  renderer2dRef,
  selectNode,
  isDark,
  nodeColor,
}: GraphDrawerProps) {
  return (
    <div
      data-panel="graph-drawer"
      data-state={isGraphDrawerOpen ? "open" : "closed"}
      className={cn(
        "absolute bottom-0 right-0 top-16 z-20 flex w-[min(1180px,calc(100%-32px))] flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out",
        isGraphDrawerOpen ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!isGraphDrawerOpen}
    >
      <div data-section="graph-drawer-header" className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{selectedProject.name} 图谱</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{currentGraph ? `${currentGraph.nodes.length} nodes · ${currentGraph.edges.length} edges` : t("noSavedGraph")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 shadow-inner">
            <Button
              data-action="set-graph-view"
              data-graph-mode="2d"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-3 text-[11px]", viewMode === "2d" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setViewMode("2d")}
            >
              <LayoutGrid size={14} className="mr-1.5" />
              2D
            </Button>
            <Button
              data-action="set-graph-view"
              data-graph-mode="3d"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-3 text-[11px]", viewMode === "3d" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setViewMode("3d")}
            >
              <Box size={14} className="mr-1.5" />
              3D
            </Button>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1 shadow-inner">
            {(["community", "kind", "frequency"] as NodeColorMode[]).map((mode) => (
              <Button
                key={mode}
                data-action="set-color-mode"
                data-color-mode={mode}
                variant="ghost"
                size="sm"
                className={cn("h-7 px-3 text-[11px]", colorMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={() => setColorMode(mode)}
              >
                {mode === "community" ? t("colorCommunity") : mode === "kind" ? t("colorKind") : t("heat")}
              </Button>
            ))}
          </div>
          <Button data-action="close-graph-drawer" variant="ghost" size="icon" onClick={() => setIsGraphDrawerOpen(false)} aria-label="关闭图谱">
            <X size={18} />
          </Button>
        </div>
      </div>

      <div data-panel="graph-workspace" data-graph-mode={viewMode} className="relative flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-950" onClick={() => setNodeContextMenu(null)}>
        <div ref={containerRef} data-canvas-host="graph" className="absolute inset-0" />

        {nodeContextMenu && (
          <div
            data-menu="node-actions"
            className="fixed z-50 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
            style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button data-action="show-node-summary" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showNodeSummary(nodeContextMenu.nodeId, "node")}>
              显示摘要
            </button>
            <button data-action="show-related-summary" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showNodeSummary(nodeContextMenu.nodeId, "related")}>
              关联性摘要
            </button>
          </div>
        )}

        {!currentGraph && (
          <div data-state="empty-graph" className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            {isInitialLoading ? (
              <>
                <RefreshCw size={24} className="mb-4 animate-spin opacity-20" />
                <h3 className="text-sm font-medium">{t("loadingData")}</h3>
              </>
            ) : (
              <>
                <Database size={48} className="mb-4 opacity-20" />
                <h3 className="text-lg font-medium">{t("noSavedGraph")}</h3>
                <p className="max-w-xs text-sm">{t("emptyStatus")}</p>
                <Button data-action="build-selected-project-graph" variant="outline" className="mt-6" onClick={handleBuildGraph}>
                  {t("buildGraph")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        className="h-1.5 shrink-0 cursor-row-resize border-t bg-border/50 transition-colors hover:bg-primary/40 active:bg-primary/50"
        onPointerDown={startBottomResize}
      />

      <section
        data-panel="bottom-insights"
        className="grid shrink-0 grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] divide-x bg-muted/10"
        style={{ height: bottomPanelHeight }}
      >
        <div data-section="graph-stats" className="flex flex-col overflow-hidden p-3">
          <div className="mb-4 flex items-center gap-2">
            <Database size={14} className="text-emerald-500" />
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-muted-foreground">统计</h3>
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
            <div className="mt-1 truncate text-sm font-medium">{selectedProject.name}</div>
            <div className="mt-2 text-xs text-muted-foreground">{selectedDocumentCount} docs</div>
          </div>
        </div>

        <div data-section="graph-insights" className="flex flex-col overflow-hidden p-3">
          <div className="mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-500" />
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-muted-foreground">{t("insights")}</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-4">
              {currentGraph?.insights.map((insight, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border-l-4 p-4 transition-all hover:translate-x-1",
                    insight.kind === "bridge" ? "border-emerald-500 bg-emerald-500/5" :
                      insight.kind === "gap" ? "border-amber-500 bg-amber-500/5" :
                        "border-blue-500 bg-blue-500/5"
                  )}
                >
                  <strong className="mb-1 block text-xs font-bold">{insight.title}</strong>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{insight.detail}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div data-section="top-terms" className="flex flex-col overflow-hidden p-3">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-500" />
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-muted-foreground">{t("topTerms")}</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-3 gap-2 p-1 pr-4">
              {currentGraph?.nodes.slice(0, 20).map((node) => (
                <button
                  data-action="select-top-term"
                  data-node-id={node.id}
                  key={node.id}
                  className={cn(
                    "group relative flex items-center justify-between overflow-hidden rounded-xl border-0 px-2 py-2.5 text-left shadow-md transition-all hover:brightness-110 active:scale-[0.98]",
                    activeHighlightId === node.id && "pl-5 shadow-lg"
                  )}
                  style={{ backgroundColor: nodeColor(node, colorMode), color: "#ffffff" }}
                  onClick={() => {
                    const nodeObj = rendererRef.current?.instance.graphData().nodes.find((n: any) => n.id === node.id);
                    if (nodeObj) {
                      const distance = 80;
                      const distRatio = 1 + distance / Math.hypot(nodeObj.x || 1, nodeObj.y || 1, nodeObj.z || 1);
                      rendererRef.current?.instance.cameraPosition({
                        x: (nodeObj.x || 0) * distRatio,
                        y: (nodeObj.y || 0) * distRatio,
                        z: (nodeObj.z || 0) * distRatio
                      }, nodeObj, 700);
                    }
                    const nextId = activeHighlightId === node.id ? null : node.id;
                    setActiveHighlightId(nextId);
                    renderer2dRef.current?.setHighlightedNode(nextId);
                    selectNode(node.id);
                  }}
                >
                  {activeHighlightId === node.id && (
                    <div className={cn("absolute bottom-0 left-0 top-0 w-1.5 rounded-l-xl", isDark ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "bg-black")} />
                  )}
                  <span className="mr-2 truncate text-[11px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">{node.label}</span>
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] font-black text-white/90 backdrop-blur-sm">{node.frequency}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </section>
    </div>
  );
}
