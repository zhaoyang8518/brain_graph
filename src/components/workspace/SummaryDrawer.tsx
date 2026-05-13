import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MarkdownPreview } from "../MarkdownPreview";
import type { ProjectInfo } from "../../projects";
import type { SummaryDrawerState } from "../../lib/summary";

interface SummaryDrawerProps {
  selectedProject: ProjectInfo;
  isSummaryDrawerOpen: boolean;
  setIsSummaryDrawerOpen: (isOpen: boolean) => void;
  summaryDrawerWidth: number;
  startSummaryDrawerResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  summaryDrawer: SummaryDrawerState | null;
  setSummaryDrawer: (summary: SummaryDrawerState | null) => void;
  isSlideOutlineComposerOpen: boolean;
  setIsSlideOutlineComposerOpen: (isOpen: boolean) => void;
  slideOutlineForm: { question: string; audience: string; slideCount: number; language: string };
  setSlideOutlineForm: (form: { question: string; audience: string; slideCount: number; language: string }) => void;
  handleGenerateSlideOutline: () => void;
  isGeneratingSlideOutline: boolean;
  summaries: Record<string, string>;
}

export function SummaryDrawer({
  selectedProject,
  isSummaryDrawerOpen,
  setIsSummaryDrawerOpen,
  summaryDrawerWidth,
  startSummaryDrawerResize,
  summaryDrawer,
  setSummaryDrawer,
  isSlideOutlineComposerOpen,
  setIsSlideOutlineComposerOpen,
  slideOutlineForm,
  setSlideOutlineForm,
  handleGenerateSlideOutline,
  isGeneratingSlideOutline,
  summaries,
}: SummaryDrawerProps) {
  return (
    <div
      data-panel="summary-drawer"
      data-state={isSummaryDrawerOpen ? "open" : "closed"}
      className={cn(
        "absolute bottom-0 right-0 top-16 z-30 flex max-w-[calc(100%-32px)] flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out",
        isSummaryDrawerOpen ? "translate-x-0" : "translate-x-full"
      )}
      style={{ width: summaryDrawerWidth }}
      aria-hidden={!isSummaryDrawerOpen}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize summary drawer"
        className="absolute left-[-4px] top-0 z-40 h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 active:bg-primary/40"
        onPointerDown={startSummaryDrawerResize}
      />
      <div data-section="summary-drawer-header" className="flex h-16 shrink-0 items-center justify-between border-b px-6">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{summaryDrawer?.title || selectedProject.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{summaryDrawer?.subtitle || "项目文档综合摘要"}</p>
        </div>
        <Button data-action="close-summary-drawer" variant="ghost" size="icon" onClick={() => {
          setIsSummaryDrawerOpen(false);
          setSummaryDrawer(null);
          setIsSlideOutlineComposerOpen(false);
        }} aria-label="关闭摘要">
          <X size={18} />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-6">
          {isSlideOutlineComposerOpen && (
            <div data-section="slide-outline-composer" className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">主题 / 问题</label>
                <textarea
                  data-field="slide-outline-question"
                  value={slideOutlineForm.question}
                  onChange={(event) => setSlideOutlineForm({ ...slideOutlineForm, question: event.target.value })}
                  placeholder="例如：围绕这个项目生成一份面向管理层的风险与机会分析汇报"
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">受众</label>
                  <input
                    data-field="slide-outline-audience"
                    value={slideOutlineForm.audience}
                    onChange={(event) => setSlideOutlineForm({ ...slideOutlineForm, audience: event.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">页数</label>
                  <input
                    data-field="slide-outline-count"
                    type="number"
                    min={3}
                    max={20}
                    value={slideOutlineForm.slideCount}
                    onChange={(event) => setSlideOutlineForm({ ...slideOutlineForm, slideCount: Number(event.target.value) || 8 })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">语言</label>
                  <Select value={slideOutlineForm.language} onValueChange={(value) => setSlideOutlineForm({ ...slideOutlineForm, language: value })}>
                    <SelectTrigger data-field="slide-outline-language"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button data-action="generate-slide-outline" onClick={handleGenerateSlideOutline} disabled={isGeneratingSlideOutline || !slideOutlineForm.question.trim()}>
                {isGeneratingSlideOutline ? "生成中..." : "生成大纲"}
              </Button>
            </div>
          )}
          <MarkdownPreview markdown={summaryDrawer?.markdown || summaries[selectedProject.id] || "## 暂无摘要\n\n请先在项目菜单中点击“增量构建图谱”或“重新构建图谱”，摘要会在图谱构建完成后自动生成。"} />
        </div>
      </ScrollArea>
    </div>
  );
}
