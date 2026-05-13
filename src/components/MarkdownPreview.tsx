import React from "react";

export function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
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
