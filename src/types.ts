import { BrainGraph, GraphNode } from "./graph";
import { ModelSettings, ModelProvider } from "./model";
import { EmbeddingSettings, EmbeddingProvider } from "./embedding";
import { ProjectInfo } from "./projects";
import { Language } from "./i18n";
import { NodeColorMode } from "./visualEncoding";

export type { BrainGraph, GraphNode, ModelSettings, ModelProvider, EmbeddingSettings, EmbeddingProvider, ProjectInfo, Language, NodeColorMode };

export type GraphViewMode = "2d" | "3d";
export type SettingsSection = "general" | "models" | "advanced";
