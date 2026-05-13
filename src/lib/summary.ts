import type { ProjectInfo } from "../projects";
import type { BrainGraph } from "../graph";
import type { SemanticSearchResult } from "../embedding";

export type ParsedDocument = {
  name: string;
  path: string;
  text: string;
};

export type SummaryDrawerState = {
  title: string;
  subtitle: string;
  markdown: string;
};

export function createProjectSummary(
  project: ProjectInfo,
  graph: BrainGraph,
  sourceText: string,
  semanticEvidence: SemanticSearchResult[] = []
): string {
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
    semanticEvidence.length ? "## 4. 语义召回证据" : "",
    semanticEvidence.length ? formatSemanticEvidence(semanticEvidence) : "",
    "## 5. 分文档要点",
    documentSummaries || "暂无可摘要文档。",
    "## 6. 阅读建议",
    "- 先阅读综合摘要和主要主题，建立项目整体上下文。",
    "- 再按“分文档要点”定位具体文档，回到原文件查看细节。",
    "- 如果摘要偏泛，建议启用 Ollama 或云模型，让模型基于解析后的文档正文生成更高质量摘要。"
  ].filter(Boolean).join("\n\n");
}

export function createNodeSummary(
  graph: BrainGraph,
  nodeId: string,
  sourceText: string,
  mode: "node" | "related",
  semanticEvidence: SemanticSearchResult[] = []
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
    semanticEvidence.length ? (mode === "related" ? "## 4. 语义召回证据" : "## 3. 语义召回证据") : "",
    semanticEvidence.length ? formatSemanticEvidence(semanticEvidence) : "",
    mode === "related" ? "## 5. 使用建议" : "## 4. 使用建议",
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

export function formatSemanticEvidence(results: SemanticSearchResult[]): string {
  return results.slice(0, 8).map((result, index) => {
    const excerpt = cleanDocumentText(result.text).slice(0, 320);
    return [
      `### ${index + 1}. ${result.documentName}`,
      `- 相似度：${result.score.toFixed(3)}`,
      `- Chunk：${result.chunkIndex + 1}`,
      `- 摘录：${excerpt}${result.text.length > 320 ? "..." : ""}`
    ].join("\n");
  }).join("\n\n");
}

export function slideOutlineToMarkdown(outline: any): string {
  const slides = Array.isArray(outline?.slides) ? outline.slides : [];
  return [
    `# ${outline?.title || "幻灯片大纲"}`,
    `- 受众：${outline?.audience || ""}`,
    `- 目标：${outline?.goal || ""}`,
    "## 页面大纲",
    slides.map((slide: any, index: number) => [
      `### ${slide.index || index + 1}. ${slide.title || "Untitled"}`,
      slide.purpose ? `- 目的：${slide.purpose}` : "",
      ...(Array.isArray(slide.bullets) ? slide.bullets.map((item: string) => `- ${item}`) : []),
      slide.visual?.type ? `- 建议视觉：${slide.visual.type}，${slide.visual.reason || ""}` : "",
      slide.speakerNotes ? `- 讲稿提示：${slide.speakerNotes}` : ""
    ].filter(Boolean).join("\n")).join("\n\n")
  ].join("\n\n");
}

export function parseProjectDocuments(sourceText: string): ParsedDocument[] {
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

export function cleanDocumentText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^Path:.*$/gm, "")
    .replace(/^Type:.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractHeadings(text: string): string[] {
  const markdownHeadings = [...text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1].trim());
  if (markdownHeadings.length) return unique(markdownHeadings).slice(0, 12);
  return unique(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 4 && line.length <= 40 && !/[。！？.!?]$/.test(line))
  ).slice(0, 12);
}

export function pickImportantSentences(text: string, keywords: string[], limit: number): string[] {
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

export function splitSentences(text: string): string[] {
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

export function scoreSentence(sentence: string, keywords: string[]): number {
  const lower = sentence.toLowerCase();
  const keywordScore = keywords.reduce((score, keyword) => {
    return lower.includes(keyword.toLowerCase()) ? score + 3 : score;
  }, 0);
  const structureScore = /目标|问题|方案|建议|结论|背景|风险|流程|系统|数据|模型|实现/.test(sentence) ? 2 : 0;
  return keywordScore + structureScore + Math.min(sentence.length / 80, 2);
}

export function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
