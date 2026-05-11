# 🧠 Brain Graph (脑图谱)

[English](#english) | [中文](#中文)

---

<a name="english"></a>
## English

**Transforming fragmented documents into a structured, interlinked network of concepts.**

Brain Graph is a local-first, knowledge-graph-powered document intelligence platform. It’s not just a visualization tool; it’s a **cognitive co-processor** for your data. By combining graph theory (PageRank, Community Detection) with modern LLMs, it reveals the "hidden structure" of your projects, documents, and research notes.

### ✨ Key Features
*   **Intelligent Ingestion**: Structured PDF parsing via `unpdf`, preserving headings and tables for high-fidelity LLM analysis.
*   **Graph-Driven Insights**: Automatic entity/relationship extraction and community detection to group related topics.
*   **LLM-Powered Intelligence**:
    *   **Smart Summaries**: Hierarchical project overviews generated from graph structures.
    *   **GraphRAG**: Query your knowledge base using graph paths for complex logical reasoning.
    *   **Mindmap Generation**: Export graph topologies directly to Markdown/Mermaid mindmaps.
*   **3D Workspace**: Silky smooth 3D force-directed graph rendering for panoramic knowledge exploration.
*   **Local-First**: Your data stays on your machine. Compatible with Ollama, DeepSeek, Gemini, and more.

### 🚀 Quick Start
1.  **Clone & Install**:
    ```bash
    git clone https://github.com/zhaoyang8518/brain_graph.git
    cd brain_graph
    pnpm install
    ```
2.  **Run**:
    ```bash
    pnpm tauri dev
    ```

---

<a name="中文"></a>
## 中文

**将零散的文档转化为结构化的概念互联网络。**

Brain Graph 是一款本地优先、基于知识图谱驱动的文档智能平台。它不只是一个可视化工具，而是你的 **“认知协同处理器”**。通过将图谱论（PageRank、社区检测）与现代大语言模型（LLM）深度融合，它能揭示你项目、文档和研究笔记中隐藏的知识结构。

### ✨ 核心功能
*   **智能解析**：利用 `unpdf` 深度解析 PDF，保留标题与列表，为 LLM 提供高保真输入。
*   **图谱驱动洞察**：自动抽取实体与关系，通过社区检测算法识别知识簇（主题岛屿）。
*   **大模型增强**：
    *   **智能摘要**：基于图谱层级自动生成深度项目综述。
    *   **图谱问答 (GraphRAG)**：利用图谱路径关系回答复杂逻辑问题，超越传统的向量检索。
    *   **思维导图导出**：一键将图谱拓扑转换为 Markdown/Mermaid 格式的思维导图。
*   **3D 工作空间**：极速 3D 力导向图渲染，支持全景式的知识探索。
*   **本地优先**：数据不出本地。完美适配 Ollama、DeepSeek、Gemini 等主流模型。

### 🚀 快速开始
1.  **克隆并安装**:
    ```bash
    git clone https://github.com/zhaoyang8518/brain_graph.git
    cd brain_graph
    pnpm install
    ```
2.  **启动**:
    ```bash
    pnpm tauri dev
    ```

---

## 🛠️ Technology Stack / 技术栈
*   **Backend**: Tauri (Rust)
*   **Frontend**: React + Vite + TypeScript
*   **UI**: Shadcn/ui + Tailwind CSS v4
*   **Graph Engine**: `3d-force-graph` & `graphology`
*   **PDF Parser**: `unpdf` (Native Rust)

## 📄 License
MIT License.

*“Reveal the invisible links between your thoughts. / 揭示你思想之间不可见的链接。”*
