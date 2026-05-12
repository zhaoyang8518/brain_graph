import { invoke } from "@tauri-apps/api/core";

export type ModelProvider = "none" | "ollama" | "deepseek" | "gemini" | "minimax" | "custom";

export type ModelSettings = {
  enabled: boolean;
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type TypedConcept = {
  name: string;
  kind: string;
};

export type ConceptExtractionResult = {
  concepts: TypedConcept[];
  providerUsed: string;
};

export type ModelConnectionResult = {
  ok: boolean;
  source: "provider" | "registry" | string;
  models: string[];
  message: string;
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

export async function testModelConnection(settings: ModelSettings): Promise<ModelConnectionResult> {
  if (isTauriRuntime()) {
    return invoke<ModelConnectionResult>("test_model_connection", { settings });
  }

  const models = fallbackModels(settings.provider);
  return {
    ok: false,
    source: "registry",
    models,
    message: "Model connection test is available in the Tauri desktop app. Showing built-in registry models."
  };
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
  return `Extract meaningful concepts and their categories from the text for a knowledge graph.

Categories to use (pick one for each concept):
- Person: Named people or specific roles.
- Organization: Companies, institutions, groups.
- Technology: Tools, languages, frameworks, tech concepts.
- Location: Places, cities, countries.
- Event: Specific happenings or periods.
- Metric: Measurable values, targets, or performance indicators.
- Idea: Abstract concepts, theories, or opinions.
- Misc: Anything else that is a distinct entity.

Rules:
- Remove function words, filler words, and vague generic terms.
- Keep domain concepts, actors, and important phrases.
- Preserve repeated concepts when they appear repeatedly (frequency matters).
- Merge obvious aliases into one canonical phrase.
- Return JSON only, with this exact shape: {"concepts":[{"name":"concept name","kind":"Category"}]}.
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

function parseConceptJson(content: string): TypedConcept[] {
  const jsonText = cleanModelJsonText(content);
  const data = JSON.parse(jsonText);
  const concepts = Array.isArray(data) ? data : data.concepts;
  if (!Array.isArray(concepts)) throw new Error("Model response did not include concepts[]");
  return concepts
    .map((item: any) => {
      if (typeof item === "string") return { name: item.trim(), kind: "Misc" };
      return {
        name: String(item.name || item.concept || "").trim(),
        kind: String(item.kind || item.category || item.type || "Misc").trim()
      };
    })
    .filter((item) => item.name.length >= 2)
    .slice(0, 3000);
}

function cleanModelJsonText(content: string): string {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Some reasoning models return <think>...</think> before the JSON payload.
  }

  const afterThink = cleaned.split("</think>").pop()?.trim();
  if (afterThink) {
    try {
      JSON.parse(afterThink);
      return afterThink;
    } catch {
      // Continue with generic JSON extraction.
    }
  }

  return extractFirstJsonValue(cleaned) ?? cleaned;
}

function extractFirstJsonValue(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    const first = text[start];
    if (first !== "{" && first !== "[") continue;
    const stack = [first === "{" ? "}" : "]"];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }

      if (char === "\"") inString = true;
      else if (char === "{") stack.push("}");
      else if (char === "[") stack.push("]");
      else if (char === "}" || char === "]") {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function defaultBaseUrl(provider: ModelProvider): string {
  if (provider === "deepseek") return "https://api.deepseek.com";
  if (provider === "minimax") return "https://api.minimax.io/v1";
  return "";
}

function fallbackModels(provider: ModelProvider): string[] {
  if (provider === "ollama") return ["qwen2.5:3b", "qwen2.5:7b", "llama3.2:3b", "gemma2:2b"];
  if (provider === "deepseek") return ["deepseek-chat", "deepseek-reasoner"];
  if (provider === "gemini") return ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
  if (provider === "minimax") {
    return [
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2",
      "MiniMax-M2.5",
      "MiniMax-M2.7",
      "MiniMax-M2.1",
      "MiniMax-M2.5-highspeed"
    ];
  }
  return [];
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
