# 🧠 Brain Graph

**Transforming unstructured text into interactive, LLM-powered knowledge networks.**

Built with **Tauri + Sigma.js + Graphology**.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-f0f0f0.svg)](https://tauri.app/)

---

## 📖 Overview

**Brain Graph** is a high-performance desktop application designed for deep information analysis. Unlike simple keyword clouds, Brain Graph uses advanced graph theory (PageRank, Community Detection) and modern LLMs to reveal the "hidden structure" of your projects, documents, and research notes.

It's not just a visualization; it's a **cognitive co-processor** for your data.

## ✨ Features

### 🔍 Intelligent Analysis
- **LLM-Powered Extraction**: Seamlessly integrate with **Ollama, DeepSeek, Gemini, MiniMax**, or any OpenAI-compatible API to extract high-level concepts rather than just raw tokens.
- **Graph Theory Algorithms**: 
  - **PageRank**: Identifies the "Dominant Concepts" in your text.
  - **Community Detection**: Groups related terms into "Topic Islands."
  - **Bridge Scores**: Finds the crucial concepts that connect disparate knowledge domains.

### 🎨 Premium Visualization
- **Sigma.js Rendering**: Silky smooth interaction even with thousands of nodes.
- **Linear-Inspired UI**: A clean, dark-themed interface (#08090a) designed for focus and clarity.
- **Interactive Insights**: Automated text summaries explaining your graph's structural gaps and bridge candidates.

### 🛠️ Developer & Power User Friendly
- **Local-First**: Your data stays on your machine.
- **Multilingual**: Native optimization for both **English and Chinese** text processing.
- **Tauri Architecture**: Extremely low memory footprint and high performance.

## 🚀 Quick Start

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/zhaoyang8518/brain_graph.git
    cd brain_graph
    ```

2.  **Install dependencies**:
    ```bash
    pnpm install
    ```

3.  **Run in development mode**:
    ```bash
    pnpm tauri dev
    ```

### Configuration
- **Local Analysis**: Works out of the box using a built-in tokenizer.
- **LLM Analysis**: Go to **Settings > Models** to configure your provider (e.g., set up Ollama for a fully private local workflow).

## 🛠️ Technology Stack
- **Framework**: [Tauri](https://tauri.app/) (Rust Backend)
- **Frontend**: Vite + TypeScript
- **Graph Engine**: [Sigma.js](https://www.sigmajs.org/) & [Graphology](https://graphology.github.io/)
- **Styling**: Vanilla CSS (Modern Dark Theme)

## 📄 License
This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

*“Reveal the invisible links between your thoughts.”*
