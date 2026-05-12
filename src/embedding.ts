import { invoke } from "@tauri-apps/api/core";

export type EmbeddingProvider = "ollama" | "dashscope" | "zhipu" | "baidu" | "minimax" | "custom";

export type EmbeddingSettings = {
  enabled: boolean;
  provider: EmbeddingProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  groupId: string;
  dimensions: number;
};

export type SemanticSearchResult = {
  chunkId: string;
  documentPath: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  score: number;
};

const SETTINGS_KEY = "anshu-doc:embedding-settings";
const LEGACY_SETTINGS_KEY = "brain-graph:embedding-settings";

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = {
  enabled: false,
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "bge-m3",
  apiKey: "",
  groupId: "",
  dimensions: 1024
};

export function loadEmbeddingSettings(): EmbeddingSettings {
  const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (!raw) return DEFAULT_EMBEDDING_SETTINGS;
  try {
    return normalizeEmbeddingSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_EMBEDDING_SETTINGS;
  }
}

export function saveEmbeddingSettings(settings: EmbeddingSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeEmbeddingSettings(settings)));
}

export async function buildProjectEmbeddings(
  projectPath: string,
  chunks: Array<{ id: string; documentPath: string; documentName: string; index: number; text: string }>,
  settings: EmbeddingSettings,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  if (!settings.enabled || settings.provider !== "ollama" || chunks.length === 0) return 0;

  const rows = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    onProgress?.(index + 1, chunks.length);
    const embedding = await embedWithOllama(chunk.text, settings);
    rows.push({
      projectPath,
      chunkId: chunk.id,
      documentPath: chunk.documentPath,
      documentName: chunk.documentName,
      chunkIndex: chunk.index,
      text: chunk.text,
      textHash: await sha256(chunk.text),
      provider: settings.provider,
      model: settings.model,
      dimensions: embedding.length,
      embedding
    });
  }

  return invoke<number>("save_project_chunk_embeddings", { embeddings: rows });
}

export async function searchProjectEmbeddings(
  projectPath: string,
  query: string,
  settings: EmbeddingSettings,
  limit = 8
): Promise<SemanticSearchResult[]> {
  if (!settings.enabled || settings.provider !== "ollama" || !query.trim()) return [];
  const embedding = await embedWithOllama(query, settings);
  return invoke<SemanticSearchResult[]>("search_project_embeddings", {
    request: {
      projectPath,
      provider: settings.provider,
      model: settings.model,
      embedding,
      limit
    }
  });
}

export function defaultEmbeddingSettingsForProvider(provider: EmbeddingProvider): Partial<EmbeddingSettings> {
  if (provider === "ollama") {
    return { baseUrl: "http://127.0.0.1:11434", model: "bge-m3", dimensions: 1024 };
  }
  if (provider === "dashscope") {
    return {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "text-embedding-v4",
      dimensions: 1024
    };
  }
  if (provider === "zhipu") {
    return { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "embedding-3", dimensions: 2048 };
  }
  if (provider === "baidu") {
    return { baseUrl: "https://qianfan.baidubce.com", model: "bge-large-zh", dimensions: 1024 };
  }
  if (provider === "minimax") {
    return { baseUrl: "https://api.minimaxi.com/v1", model: "embo-01", dimensions: 1536 };
  }
  if (provider === "custom") {
    return { baseUrl: "", model: "", dimensions: 1024 };
  }
  return defaultEmbeddingSettingsForProvider("ollama");
}

export function embeddingProviderLabel(provider: EmbeddingProvider): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "dashscope") return "Alibaba DashScope";
  if (provider === "zhipu") return "Zhipu AI";
  if (provider === "baidu") return "Baidu Qianfan";
  if (provider === "minimax") return "MiniMax";
  return "OpenAI-compatible Embedding";
}

function normalizeEmbeddingSettings(value: Partial<EmbeddingSettings>): EmbeddingSettings {
  const next = { ...DEFAULT_EMBEDDING_SETTINGS, ...value };
  if (!["ollama", "dashscope", "zhipu", "baidu", "minimax", "custom"].includes(next.provider)) {
    next.provider = "ollama";
  }
  if (!Number.isFinite(next.dimensions) || next.dimensions <= 0) {
    next.dimensions = DEFAULT_EMBEDDING_SETTINGS.dimensions;
  }
  return next;
}

async function embedWithOllama(text: string, settings: EmbeddingSettings): Promise<number[]> {
  const response = await fetch(`${trimSlash(settings.baseUrl)}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      prompt: text.slice(0, 8000)
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama embedding returned ${response.status}`);
  }
  const data = await response.json();
  const embedding = data.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Ollama embedding response did not include embedding[].");
  }
  return embedding.map((value: unknown) => Number(value)).filter(Number.isFinite);
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
