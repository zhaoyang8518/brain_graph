import { BrainGraph, GraphNode } from "./graph";
import { ModelSettings, ModelProvider } from "./model";
import { ProjectInfo } from "./projects";
import { Language } from "./i18n";
import { NodeColorMode } from "./visualEncoding";

export type { BrainGraph, GraphNode, ModelSettings, ModelProvider, ProjectInfo, Language, NodeColorMode };

export type GraphViewMode = "2d" | "3d";
export type SettingsSection = "general" | "models";
