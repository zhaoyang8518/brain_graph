import React from "react";
import { RefreshCw, FileText, File } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownPreview } from "../MarkdownPreview";
import type { DocumentPreviewState } from "../../App";

interface DocumentWorkspaceProps {
  isDocumentLoading: boolean;
  buildProgress: { message: string; percent: number; details?: string[] } | null;
  documentPreview: DocumentPreviewState | null;
}

export function DocumentWorkspace({
  isDocumentLoading,
  buildProgress,
  documentPreview,
}: DocumentWorkspaceProps) {
  return (
    <div data-panel="document-workspace" className="relative flex-1 overflow-hidden bg-background">
      {isDocumentLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <RefreshCw size={22} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {buildProgress && (
        <Card data-panel="build-progress" className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(520px,calc(100%-48px))] shadow-2xl border-primary/20 bg-background/90 backdrop-blur-xl animate-in zoom-in-95">
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

      {documentPreview ? (
        documentPreview.content.kind === "pdf" && documentPreview.url ? (
          <iframe
            data-viewer="pdf"
            title={documentPreview.content.title}
            src={documentPreview.url}
            className="h-full w-full border-0 bg-background"
          />
        ) : (
          <ScrollArea data-viewer="markdown" className="h-full">
            <div className="mx-auto max-w-4xl px-8 py-8">
              <div className="mb-6 flex items-center gap-3 border-b pb-4">
                <FileText size={22} className="text-muted-foreground" />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">{documentPreview.content.title}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{documentPreview.content.path}</p>
                </div>
              </div>
              <MarkdownPreview markdown={documentPreview.content.markdown || ""} />
            </div>
          </ScrollArea>
        )
      ) : (
        <div data-state="empty-document" className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <File size={48} className="mb-5 opacity-20" />
          <h3 className="text-lg font-medium text-foreground">选择一个文档开始阅读</h3>
          <p className="mt-2 max-w-sm text-sm">左侧项目下会列出 PDF、Markdown、Word、Excel 等文档。PDF 直接预览，其他格式优先展示转换后的 Markdown。</p>
        </div>
      )}
    </div>
  );
}
