# AnshuDoc

**English** | [中文](./README_zh.md)

---

**Brain Graph: A local-first, knowledge-graph-powered document intelligence platform.**

Brain Graph transforms fragmented documents into a structured, interlinked network of concepts. It doesn't just store information; it **compiles** it. By integrating graph theory (PageRank, Community Detection) with modern LLMs, it reveals the "hidden architecture" of your projects, research, and data.

### 🎯 The Philosophy
*   **Knowledge Compounding**: Unlike traditional RAG that rediscovers knowledge on every query, Brain Graph maintains a persistent, evolving wiki-layer.
*   **Graph-First Architecture**: The graph is the core index, enabling structural insights that flat text search can't provide.
*   **Local-First & Private**: Full control over your data. Optimized for local LLMs like Ollama.

### ✨ Key Features
*   **Smart Ingestion**: Support for PDF, Markdown, and Office formats, automatically preserving document hierarchy for better LLM context.
*   **Structural Intelligence**: 
    *   **Community Detection**: Auto-detects topic clusters.
    *   **Graph Algorithms**: Built-in PageRank and Bridge Score to find influencers and connectors.
*   **LLM Synergy**:
    *   **Project Summaries**: Hierarchical MD summaries derived from the graph topology.
    *   **GraphRAG (Coming Soon)**: Multi-hop reasoning across your documents.
    *   **Mindmap Export**: Convert graph branches into Mermaid/Markdown mindmaps.
*   **Immersive Workspace**: 
    *   **Hybrid View**: Seamless switching between 2D clarity and 3D panoramic exploration.
    *   **Pro UI**: Resizable layouts, theme-aware Shadcn components, and smooth 60fps rendering.

### 🚀 Quick Start
1.  **Prerequisites**:
    *   Ensure Rust, Node.js, and pnpm are installed.
2.  **Clone & Install**:
    ```bash
    git clone https://github.com/zhaoyang8518/brain_graph.git
    cd brain_graph
    pnpm install
    ```
3.  **Run**:
    ```bash
    pnpm tauri dev
    ```

---

## 🛠️ Technology Stack
*   **Core**: Tauri (Rust Backend)
*   **UI**: React + Vite + Shadcn/ui + Tailwind CSS v4
*   **Graph**: `3d-force-graph` & `graphology`
*   **Parsing**: `unpdf`, `calamine`, `quick-xml`

## 📄 License
This project is licensed under the MIT License.

---

*“Reveal the invisible links between your thoughts.”*
