# AnshuDoc

**English** | [中文](./README_zh.md)

---

**Transform fragmented documents into structured concept networks to power deep reading and content creation.**

AnshuDoc is a local-first document intelligence tool that combines Knowledge Graphs and Vector Search to help users navigate and understand large document sets. It utilizes graph algorithms (e.g., PageRank, Community Detection) to reveal hidden connections and automatically generates structured presentation outlines.

### 🎯 Design Philosophy
*   **Persistent Knowledge Layer**: Unlike traditional single-query RAG, AnshuDoc maintains a cross-document network of entities and relationships to build a long-term knowledge structure.
*   **Graph-Augmented Generation (GraphRAG)**: Leverages graph topology to provide the LLM with better context, improving the accuracy of complex reasoning tasks.
*   **Privacy & Local-First**: Data is stored in a local SQLite database. Native support for local LLMs via Ollama ensures your data stays private.

### ✨ Key Features
*   **Multi-format Sidecar Parsing**: Integrated with the `MarkItDown` engine to reliably convert PDF, Word, Excel, and PowerPoint files into clean Markdown.
*   **Hybrid Retrieval Architecture**:
    *   **Graph Indexing**: Automated entity extraction, PageRank-based importance scoring, and community-based topic clustering.
    *   **Semantic Search**: Built-in vector retrieval compatible with local (ONNX) and cloud embedding models.
*   **SlideAgent Generation**: Automatically extracts sub-graphs and evidence from the knowledge network to generate hierarchical PPT outlines based on user requirements.
*   **Interactive Visualization**: 2D and 3D force-directed graphs for intuitive exploration of concept connections.

### 🚀 Quick Start
1.  **Prerequisites**:
    *   Install Rust, Node.js (pnpm), and Python 3.12.
2.  **Clone & Install**:
    ```bash
    git clone https://github.com/Anshusoft-Grove/anshu_doc.git
    cd anshu_doc
    pnpm install
    ```
3.  **Build Parsing Engine (Sidecar)**:
    ```bash
    pnpm sidecar:markitdown
    ```
4.  **Run**:
    ```bash
    pnpm tauri dev
    ```

---

## 🛠️ Technology Stack
*   **Backend**: Tauri v2 (Rust) + SQLite
*   **Frontend**: React + Vite + Shadcn/ui + Tailwind CSS v4
*   **Visualization**: `3d-force-graph` + `graphology`
*   **Parsing**: Microsoft MarkItDown (Python Sidecar)
*   **AI Models**: Ollama, DeepSeek, Gemini, MiniMax

## 📄 License
This project is licensed under the MIT License.

---

*“Reveal the invisible links between your thoughts.”*
