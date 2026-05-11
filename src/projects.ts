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

export type ProjectGraphInput = {
  text: string;
  documentsRead: number;
  documentsSkipped: number;
};

const PROJECTS_KEY = "brain-graph:projects";

export function loadProjects(): ProjectInfo[] {
  const raw = localStorage.getItem(PROJECTS_KEY);
  if (!raw) return [];
  try {
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects : [];
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

export async function buildProjectGraphInput(path: string): Promise<ProjectGraphInput> {
  if (isTauriRuntime()) {
    return invoke<ProjectGraphInput>("build_project_graph_input", { path });
  }
  throw new Error("Project graph construction is available in the Tauri desktop app.");
}

export async function saveProjectGraph(projectPath: string, graphJson: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>("save_project_graph", { projectPath, graphJson });
  }
  localStorage.setItem(`brain-graph:project-graph:${projectPath}`, graphJson);
}

export async function loadProjectGraph(projectPath: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>("load_project_graph", { projectPath });
  }
  return localStorage.getItem(`brain-graph:project-graph:${projectPath}`);
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
