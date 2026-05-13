import React from "react";
import { Plus, MoreVertical, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectInfo, ProjectDocument } from "../../projects";
import logoImage from "../../assets/logo.png";

interface SidebarProps {
  sidebarWidth: number;
  startSidebarResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  t: (key: string) => string;
  projects: ProjectInfo[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  setIsSummaryDrawerOpen: (isOpen: boolean) => void;
  setIsGraphDrawerOpen: (isOpen: boolean) => void;
  setDocumentPreview: (preview: any) => void;
  handleAddProject: () => void;
  projectMenuId: string | null;
  setProjectMenuId: (id: string | null) => void;
  handleBuildProjectGraph: (project: ProjectInfo, rebuild: boolean) => Promise<void>;
  openSlideOutlineComposer: (project: ProjectInfo) => void;
  showProjectContent: (project: ProjectInfo, type: "graph" | "summary") => Promise<void>;
  handleRefreshProject: (project: ProjectInfo) => Promise<void>;
  documentPreview: any | null;
  handleOpenDocument: (project: ProjectInfo, doc: ProjectDocument) => Promise<void>;
  setIsSettingsOpen: (isOpen: boolean) => void;
}

export function Sidebar({
  sidebarWidth,
  startSidebarResize,
  t,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  setIsSummaryDrawerOpen,
  setIsGraphDrawerOpen,
  setDocumentPreview,
  handleAddProject,
  projectMenuId,
  setProjectMenuId,
  handleBuildProjectGraph,
  openSlideOutlineComposer,
  showProjectContent,
  handleRefreshProject,
  documentPreview,
  handleOpenDocument,
  setIsSettingsOpen,
}: SidebarProps) {
  return (
    <aside
      data-panel="project-sidebar"
      className="relative shrink-0 border-r bg-muted/30 backdrop-blur-xl flex flex-col"
      style={{ width: sidebarWidth }}
    >
      <div data-section="app-brand" className="h-16 flex items-center px-6 border-b">
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

      <ScrollArea data-section="project-list" className="flex-1 p-4">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-[14px] uppercase tracking-widest font-bold text-muted-foreground">{t("projects")}</h2>
          <Button data-action="add-project" variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddProject}>
            <Plus size={14} />
          </Button>
        </div>

        <div className="space-y-1">
          {projects.map(project => (
            <div key={project.id} data-project-id={project.id} data-project-name={project.name} className="group relative flex flex-col">
              <div
                data-component="project-row"
                data-state={selectedProjectId === project.id ? "selected" : "idle"}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-all",
                  selectedProjectId === project.id
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <button
                  data-action="select-project"
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setIsSummaryDrawerOpen(false);
                    setIsGraphDrawerOpen(false);
                    setDocumentPreview(null);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm font-medium"
                >
                  <div className={cn("h-1.5 w-1.5 rounded-full", selectedProjectId === project.id ? "bg-primary" : "bg-muted-foreground/30")} />
                  <span className="truncate">{project.name}</span>
                </button>
                <button
                  data-action="open-project-menu"
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
                <div data-menu="project-actions" className="absolute right-2 top-9 z-40 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
                  <button data-action="incremental-build-graph" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleBuildProjectGraph(project, false)}>
                    增量构建图谱
                  </button>
                  <button data-action="rebuild-graph" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleBuildProjectGraph(project, true)}>
                    重新构建图谱
                  </button>
                  <button data-action="open-slide-outline-composer" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => openSlideOutlineComposer(project)}>
                    生成幻灯片大纲
                  </button>
                  <button data-action="show-project-graph" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showProjectContent(project, "graph")}>
                    显示图谱
                  </button>
                  <button data-action="show-project-summary" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void showProjectContent(project, "summary")}>
                    显示摘要
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button data-action="refresh-project" className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => void handleRefreshProject(project)}>
                    刷新
                  </button>
                </div>
              )}

              {selectedProjectId === project.id && (
                <div data-section="project-documents" className="mt-1 ml-4 pl-4 border-l space-y-1 animate-in fade-in slide-in-from-left-2 duration-300">
                  {project.documents.map(doc => (
                    <button
                      key={doc.path}
                      data-action="open-document"
                      data-document-name={doc.name}
                      data-document-extension={doc.extension}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground",
                        documentPreview?.document.path === doc.path && "bg-accent/40 text-foreground"
                      )}
                      onClick={() => void handleOpenDocument(project, doc)}
                    >
                      <span className="truncate">{doc.name}</span>
                      <span className="text-[9px] font-bold opacity-50 uppercase">{doc.extension}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/20">
        <Button
          data-action="open-settings"
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
  );
}
