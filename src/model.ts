import { invoke } from "@tauri-apps/api/core";

export type ModelProvider = "none" | "ollama" | "deepseek" | "gemini" | "minimax" | "custom";

export type ModelSettings = {
  enabled: boolean;
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ConceptExtractionResult = {
  concepts: string[];
  providerUsed: string;
};

const SETTINGS_KEY = "brain-graph:model-settings";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  enabled: false,
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:3b",
  apiKey: ""
};

export function loadModelSettings(): ModelSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_MODEL_SETTINGS;
  try {
    return { ...DEFAULT_MODEL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function saveModelSettings(settings: ModelSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function extractConceptsWithModel(
  text: string,
  settings: ModelSettings
): Promise<ConceptExtractionResult> {
  if (!settings.enabled || settings.provider === "none") {
    return { concepts: [], providerUsed: "local" };
  }

  if (isTauriRuntime()) {
    return invoke<ConceptExtractionResult>("extract_concepts", { text, settings });
  }

  const prompt = makeConceptPrompt(text);
  if (settings.provider === "ollama") return extractWithOllama(prompt, settings);
  if (settings.provider === "gemini") return extractWithGemini(prompt, settings);
  return extractWithOpenAICompatible(prompt, settings);
}

function makeConceptPrompt(text: string): string {
  return `Extract meaningful concepts and noun phrases from the text for a text network graph.

Rules:
- Remove function words, filler words, vague verbs, and generic terms.
- Keep domain concepts, methods, objects, actors, metrics, problems, and important phrases.
- Preserve repeated concepts when they appear repeatedly, because frequency matters for graph construction.
- Merge obvious aliases into one canonical phrase.
- Use the original language of the concept.
- Return JSON only, with this exact shape: {"concepts":["concept one","concept two"]}.
- Include no explanations.

Text:
---
${text.slice(0, 12000)}
---`;
}

async function extractWithOllama(
  prompt: string,
  settings: ModelSettings
): Promise<ConceptExtractionResult> {
  const response = await fetch(`${trimSlash(settings.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const data = await response.json();
  return {
    concepts: parseConceptJson(data.message?.content ?? ""),
    providerUsed: `ollama:${settings.model}`
  };
}

async function extractWithOpenAICompatible(
  prompt: string,
  settings: ModelSettings
): Promise<ConceptExtractionResult> {
  const baseUrl = settings.baseUrl || defaultBaseUrl(settings.provider);
  const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`${settings.provider} returned ${response.status}`);
  const data = await response.json();
  return {
    concepts: parseConceptJson(data.choices?.[0]?.message?.content ?? ""),
    providerUsed: `${settings.provider}:${settings.model}`
  };
}

async function extractWithGemini(
  prompt: string,
  settings: ModelSettings
): Promise<ConceptExtractionResult> {
  const model = settings.model || "gemini-2.5-flash";
  const baseUrl = settings.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const response = await fetch(
    `${trimSlash(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      settings.apiKey
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        },
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json();
  return {
    concepts: parseConceptJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""),
    providerUsed: `gemini:${model}`
  };
}

function parseConceptJson(content: string): string[] {
  const jsonText = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  const data = JSON.parse(jsonText);
  const concepts = Array.isArray(data) ? data : data.concepts;
  if (!Array.isArray(concepts)) throw new Error("Model response did not include concepts[]");
  return concepts
    .map((concept) => String(concept).trim())
    .filter((concept) => concept.length >= 2)
    .slice(0, 3000);
}

function defaultBaseUrl(provider: ModelProvider): string {
  if (provider === "deepseek") return "https://api.deepseek.com";
  if (provider === "minimax") return "https://api.minimax.io/v1";
  return "";
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
