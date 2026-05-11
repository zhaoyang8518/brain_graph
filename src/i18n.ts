export type Language = "zh" | "en";

const LANGUAGE_KEY = "brain-graph:language";

const messages = {
  zh: {
    appSubtitle: "项目知识图谱工作区",
    projects: "项目",
    settings: "设置",
    conceptNetwork: "概念网络",
    emptyStatus: "创建或选择一个项目来构建知识图谱。",
    insights: "洞察",
    topTerms: "核心概念",
    returnToApp: "返回应用",
    general: "通用",
    models: "模型",
    language: "语言",
    generalDescription: "配置应用偏好。",
    modelsDescription: "配置概念抽取模型。未启用或不可用时，Brain Graph 使用本地分析。",
    useModelExtraction: "使用模型抽取",
    provider: "供应商",
    model: "模型",
    baseUrl: "Base URL",
    apiKey: "API Key",
    save: "保存",
    reset: "重置",
    buildGraph: "构建图谱",
    refreshDocuments: "刷新文档",
    noSavedGraph: "该项目还没有已构建图谱。",
    selectNode: "选择节点以查看局部上下文。"
  },
  en: {
    appSubtitle: "Project knowledge graph workspace",
    projects: "Projects",
    settings: "Settings",
    conceptNetwork: "Concept Network",
    emptyStatus: "Create or select a project to build its knowledge graph.",
    insights: "Insights",
    topTerms: "Top Terms",
    returnToApp: "Return to App",
    general: "General",
    models: "Models",
    language: "Language",
    generalDescription: "Configure application preferences.",
    modelsDescription: "Configure concept extraction providers. When disabled or unavailable, Brain Graph uses local analysis.",
    useModelExtraction: "Use model extraction",
    provider: "Provider",
    model: "Model",
    baseUrl: "Base URL",
    apiKey: "API Key",
    save: "Save",
    reset: "Reset",
    buildGraph: "Build Graph",
    refreshDocuments: "Refresh Documents",
    noSavedGraph: "No graph built for this project yet.",
    selectNode: "Select a node to inspect local context."
  }
} as const;

export type MessageKey = keyof typeof messages.zh;

export function loadLanguage(): Language {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === "en" ? "en" : "zh";
}

export function saveLanguage(language: Language) {
  localStorage.setItem(LANGUAGE_KEY, language);
}

export function translate(language: Language, key: MessageKey): string {
  return messages[language][key];
}
