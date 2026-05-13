import { invoke } from "@tauri-apps/api/core";

export type ProjectDocument = {
  path: string;
  name: string;
  extension: string;
  size: number;
};

export type ProjectInfo = {
  id: string;
  name: string;
  path: string;
  documents: ProjectDocument[];
};

export type ProjectMarkdownDocument = {
  path: string;
  name: string;
  extension: string;
  markdown: string;
  charCount: number;
};

export type LoadedProjectDocument = {
  title: string;
  path: string;
  extension: string;
  kind: "pdf" | "markdown";
  markdown?: string | null;
  filePath?: string | null;
};

export type ProjectChunk = {
  id: string;
  documentPath: string;
  documentName: string;
  index: number;
  text: string;
  charCount: number;
};

export type ProjectGraphInput = {
  text: string;
  documentsRead: number;
  documentsSkipped: number;
  documents?: ProjectMarkdownDocument[];
  chunks?: ProjectChunk[];
};

export type BuildGraphInputOptions = {
  rebuild?: boolean;
};

export type SlideOutlineRequest = {
  projectPath: string;
  question: string;
  audience: string;
  slideCount: number;
  language: string;
  settings: any;
  semanticEvidence?: Array<{
    chunkId: string;
    documentPath: string;
    documentName: string;
    chunkIndex: number;
    text: string;
    score: number;
  }>;
};

const PROJECTS_KEY = "anshu-doc:projects";
const LEGACY_PROJECTS_KEY = "brain-graph:projects";
const PROJECT_GRAPH_KEY_PREFIX = "anshu-doc:project-graph:";
const LEGACY_PROJECT_GRAPH_KEY_PREFIX = "brain-graph:project-graph:";

export function loadProjects(): ProjectInfo[] {
  const raw = localStorage.getItem(PROJECTS_KEY) ?? localStorage.getItem(LEGACY_PROJECTS_KEY);
  if (!raw) return [];
  try {
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects.map(normalizeProject).filter(Boolean) as ProjectInfo[] : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectInfo[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export async function openProjectFolder(): Promise<ProjectInfo | null> {
  if (isTauriRuntime()) {
    return invoke<ProjectInfo | null>("open_project_folder");
  }
  throw new Error("Folder projects are available in the Tauri desktop app.");
}

export async function refreshProject(path: string): Promise<ProjectInfo> {
  if (isTauriRuntime()) {
    return invoke<ProjectInfo>("scan_project_documents", { path });
  }
  throw new Error("Project scanning is available in the Tauri desktop app.");
}

export async function loadProjectDocument(projectPath: string, documentPath: string): Promise<LoadedProjectDocument> {
  if (isTauriRuntime()) {
    return invoke<LoadedProjectDocument>("load_project_document", { projectPath, documentPath });
  }
  throw new Error("Document preview is available in the Tauri desktop app.");
}

export async function buildProjectGraphInput(path: string, options: BuildGraphInputOptions = {}): Promise<ProjectGraphInput> {
  if (isTauriRuntime()) {
    return invoke<ProjectGraphInput>("build_project_graph_input", { path, rebuild: options.rebuild ?? false });
  }
  throw new Error("Project graph construction is available in the Tauri desktop app.");
}

export async function saveProjectGraph(projectPath: string, graphJson: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("save_project_graph", { projectPath, graphJson });
  }
  localStorage.setItem(`${PROJECT_GRAPH_KEY_PREFIX}${projectPath}`, graphJson);
}

export async function loadProjectGraph(projectPath: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>("load_project_graph", { projectPath });
  }
  return localStorage.getItem(`${PROJECT_GRAPH_KEY_PREFIX}${projectPath}`)
    ?? localStorage.getItem(`${LEGACY_PROJECT_GRAPH_KEY_PREFIX}${projectPath}`);
}

export async function generateSlideOutline(request: SlideOutlineRequest): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>("generate_slide_outline", { request });
  }
  throw new Error("Slide outline generation is available in the Tauri desktop app.");
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function normalizeProject(value: any): ProjectInfo | null {
  if (!value || typeof value !== "object") return null;
  const path = typeof value.path === "string" ? value.path : "";
  if (!path) return null;
  const name = typeof value.name === "string" && value.name ? value.name : path.split("/").pop() || path;
  const id = typeof value.id === "string" && value.id ? value.id : path;
  const documents = Array.isArray(value.documents)
    ? value.documents
        .filter((document: any) => document && typeof document === "object")
        .map((document: any) => ({
          path: String(document.path || ""),
          name: String(document.name || document.path?.split("/").pop() || "Document"),
          extension: String(document.extension || "").toLowerCase(),
          size: Number(document.size || 0)
        }))
        .filter((document: ProjectDocument) => document.path)
    : [];
  return { id, name, path, documents };
}
