# 🧠 Brain Graph (脑图谱)

**将非结构化文档转化为可交互、大模型驱动的知识网络。**

Brain Graph 是一款专为深度信息分析设计的桌面应用。它不只是一个简单的可视化工具，而是你的 **“认知协同处理器”**。通过结合图谱论（PageRank, 社区检测）与现代大语言模型（LLM），它能揭示你项目、文档和研究笔记中隐藏的结构。

---

## 🌟 核心理念
*   **文档即图谱**：不再是散乱的文件，而是互联的概念网络。
*   **复利式学习**：知识在图谱中不断沉淀与修正，而非每次重新检索。
*   **结构化洞察**：利用拓扑算法识别关键节点与知识盲区。

## ✨ 核心功能

### 🔍 智能解析与抽取
*   **结构化提取**：利用 `unpdf` 深度解析 PDF，保留标题与列表，提升 LLM 理解精度。
*   **多模型支持**：无缝对接 **Ollama (本地), DeepSeek, Gemini, MiniMax** 等主流模型。
*   **本地优先**：数据存储在本地，隐私受控。

### 📊 深度图谱分析
*   **3D 全景视图**：极致流畅的 3D 力导向图，支持数千节点交互。
*   **社区检测**：自动识别知识簇（Topic Islands），并以不同颜色编码。
*   **拓扑算法**：内置 PageRank（识别核心概念）与 Bridge Score（寻找跨领域连接点）。

### 💡 LLM 增强体验 (新)
*   **智能摘要**：基于图谱层级自动生成项目综述与核心洞察。
*   **图谱问答 (GraphRAG)**：利用实体间的路径关系回答复杂逻辑问题。
*   **思维导图生成**：一键将图谱拓扑转换为思维导图（Markdown/Mermaid 格式）。

## 🚀 快速开始

### 安装环境
1.  确保已安装 [Rust](https://www.rust-lang.org/)。
2.  确保已安装 [Node.js](https://nodejs.org/)。
3.  推荐安装 [pnpm](https://pnpm.io/)。

### 运行
```bash
# 克隆仓库
git clone https://github.com/zhaoyang8518/brain_graph.git
cd brain_graph

# 安装依赖
pnpm install

# 启动开发环境
pnpm tauri dev
```

## 🛠️ 技术栈
*   **框架**: [Tauri](https://tauri.app/) (Rust 后端)
*   **前端**: React + Vite + TypeScript
*   **UI 组件**: Shadcn/ui + Tailwind CSS v4
*   **图形引擎**: `3d-force-graph` & `graphology`
*   **PDF 解析**: `unpdf` (Rust 原生)

## 📄 许可证
本项目采用 **MIT 许可证**。详见 [LICENSE](LICENSE) 文件。

---

*“揭示你思想之间不可见的链接。”*
