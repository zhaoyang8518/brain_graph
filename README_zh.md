# AnshuDoc

[English](./README.md) | **中文**

---

**将零散的文档转化为结构化的概念互联网络。**

Brain Graph 是一款本地优先、基于知识图谱驱动的文档智能平台。它不只是一个可视化工具，而是你的 **“认知协同处理器”**。通过将图谱论（PageRank、社区检测）与现代大语言模型（LLM）深度融合，它能揭示你项目、研究和数据中隐藏的知识结构。

### 🎯 核心哲学
*   **知识复利**：区别于传统 RAG 每次查询时的重复检索，Brain Graph 维护一个持久的、不断进化的知识层。
*   **图谱中心架构**：图谱是核心索引，提供纯文本检索无法实现的结构化洞察。
*   **本地优先与隐私**：完全掌控你的数据。原生优化支持 Ollama 等本地大模型。

### ✨ 核心功能
*   **多格式智能解析**：支持 PDF、Markdown、Office 等文档，自动识别层级与结构，为大模型提供高质量上下文。
*   **结构化智能分析**：
    *   **社区检测**：自动识别知识簇（主题岛屿）。
    *   **图谱算法**：内置 PageRank（识别核心点）与 Bridge Score（识别跨领域桥梁）。
*   **大模型深度协同**：
    *   **项目摘要**：基于图谱拓扑结构自动生成的 Markdown 深度综述。
    *   **图谱问答 (GraphRAG)**：支持跨文档的复杂路径推理（即将上线）。
    *   **思维导图导出**：一键将图谱分支转化为 Mermaid/Markdown 格式。
*   **沉浸式工作区**：
    *   **双模式视图**：2D 导航的清晰与 3D 探索的全景全方位支持。
    *   **专业级 UI**：可缩放布局、响应式 Shadcn 组件以及丝滑的 60fps 渲染。

### 🚀 快速开始
1.  **准备环境**:
    *   确保已安装 Rust, Node.js 和 pnpm。
2.  **克隆并安装**:
    ```bash
    git clone https://github.com/zhaoyang8518/brain_graph.git
    cd brain_graph
    pnpm install
    ```
3.  **启动**:
    ```bash
    pnpm tauri dev
    ```

---

## 🛠️ 技术栈
*   **核心核心**: Tauri (Rust 后端)
*   **UI 界面**: React + Vite + Shadcn/ui + Tailwind CSS v4
*   **图形渲染**: `3d-force-graph` & `graphology`
*   **文档解析**: `unpdf`, `calamine`, `quick-xml`

## 📄 许可证
本项目采用 MIT 许可证。

---

*“揭示你思想之间不可见的链接。”*
