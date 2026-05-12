# AnshuDoc

[English](./README.md) | **中文**

---

**将碎片化的文档转化为结构化的概念网络，辅助深度阅读与内容创作。**

AnshuDoc 是一款本地优先的文档智能分析工具，通过结合知识图谱与向量搜索，帮助用户理清大量文档间的逻辑结构。它利用图论算法（如 PageRank、社区检测）揭示隐藏的关联，并能自动生成结构化的演示文稿大纲。

### 🎯 设计理念
*   **持久化知识层**：不同于传统的单次 RAG 检索，AnshuDoc 维护一个跨文档的实体关系网络，沉淀长期的知识结构。
*   **图谱增强生成 (GraphRAG)**：利用图谱的拓扑结构辅助大模型理解上下文，提升复杂问题的回答准确性。
*   **本地优先**：数据存储于本地 SQLite，支持通过 Ollama 运行本地模型，保护隐私。

### ✨ 核心功能
*   **多格式 Sidecar 解析**：集成 `MarkItDown` 引擎，可靠地将 PDF、Word、Excel、PowerPoint 转化为干净的 Markdown 格式。
*   **混合检索架构**：
    *   **图谱索引**：自动提取概念实体，通过 PageRank 识别核心节点，通过社区检测识别主题聚类。
    *   **语义搜索**：内置向量检索，兼容本地 (ONNX) 或云端嵌入模型。
*   **SlideAgent 大纲生成**：根据用户需求，自动从知识网络中抽取子图并匹配相关证据，生成层级化的 PPT 大纲。
*   **交互式可视化**：支持 2D/3D 力导向图，直观展示概念间的连接关系。

### 🚀 快速开始
1.  **准备环境**:
    *   安装 Rust, Node.js (pnpm) 和 Python 3.12。
2.  **克隆并安装**:
    ```bash
    git clone https://github.com/Anshusoft-Grove/anshu_doc.git
    cd anshu_doc
    pnpm install
    ```
3.  **构建解析引擎**:
    ```bash
    pnpm sidecar:markitdown
    ```
4.  **启动**:
    ```bash
    pnpm tauri dev
    ```

---

## 🛠️ 技术栈
*   **后端**: Tauri v2 (Rust) + SQLite
*   **前端**: React + Vite + Shadcn/ui + Tailwind CSS v4
*   **图形渲染**: `3d-force-graph` + `graphology`
*   **解析引擎**: Microsoft MarkItDown (Python Sidecar)
*   **支持模型**: Ollama, DeepSeek, Gemini, MiniMax

## 📄 许可证
本项目采用 MIT 许可证。

---

*“揭示你思想之间不可见的链接。”*
