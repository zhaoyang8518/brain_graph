# Brain Graph Development Notes

Brain Graph is a Tauri desktop MVP for text network analysis inspired by InfraNodus. The first version focuses on local, offline graph exploration rather than server-backed knowledge graph storage.

## Current MVP Features

- Tauri 2 desktop shell.
- Vite + TypeScript frontend.
- Local text input workspace.
- Configurable co-occurrence window size.
- Concept tokenization for English and basic Chinese phrases.
- Undirected weighted graph construction.
- PageRank-style centrality scoring.
- Lightweight topic island detection.
- Bridge candidate scoring based on cross-topic neighbor diversity.
- Structural gap summary based on topic islands and weak links.
- Sigma.js interactive graph rendering.
- Node inspection through graph clicks.
- Top terms panel with camera navigation.
- Basic graph stats: terms, links, topics, density.

## Grove Ingestor Reuse

Useful ideas from `/Users/zhaoyang/Dev/projects/grove/grove_deploy/grove_qm_os/ingestor`:

- Chunked document ingestion from `knowledge_ingestor.py`.
- LLM triplet JSON schema from `graph_ingestor.py`.
- Entity label and relation cleanup rules.
- Source evidence tracking through `source_uri` and `r_evidence`.
- Post-processing from `knowledge_refiner.py`: entity alignment and label consolidation.
- CSV export shape from `knowledge_exporter.py`.

Parts that should not move into the desktop MVP initially:

- FalkorDB runtime dependency.
- Qdrant runtime dependency.
- Redis cache dependency.
- Domain-specific automotive quality prompts.
- QMD MCP ingestion dependency.

## Development Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm tauri:dev
pnpm tauri:build
```

## Next Milestone

1. Add local workspace save/load through Tauri file dialogs.
2. Store nodes, edges, metrics, source snippets, and settings as JSON.
3. Add edge click inspection showing the text windows that created the relation.
4. Replace connected-component topic detection with Louvain community detection.
