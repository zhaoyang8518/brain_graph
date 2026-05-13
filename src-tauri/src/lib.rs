use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager;
use text_splitter::MarkdownSplitter;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelSettings {
    provider: String,
    base_url: String,
    model: String,
    api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TypedConcept {
    name: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConceptExtractionResult {
    concepts: Vec<TypedConcept>,
    provider_used: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelConnectionResult {
    ok: bool,
    source: String,
    models: Vec<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectDocument {
    path: String,
    name: String,
    extension: String,
    size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    id: String,
    name: String,
    path: String,
    documents: Vec<ProjectDocument>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectGraphInput {
    text: String,
    documents_read: usize,
    documents_skipped: usize,
    documents: Vec<ProjectMarkdownDocument>,
    chunks: Vec<ProjectChunk>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMarkdownDocument {
    path: String,
    name: String,
    extension: String,
    markdown: String,
    char_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedProjectDocument {
    title: String,
    path: String,
    extension: String,
    kind: String,
    markdown: Option<String>,
    file_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectChunk {
    id: String,
    document_path: String,
    document_name: String,
    index: usize,
    text: String,
    char_count: usize,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBuildConfig {
    version: u32,
    documents: Vec<ProjectBuildDocument>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBuildDocument {
    source_path: String,
    source_hash: String,
    markdown_path: String,
    name: String,
    extension: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlideOutlineRequest {
    project_path: String,
    question: String,
    audience: String,
    slide_count: usize,
    language: String,
    settings: ModelSettings,
    semantic_evidence: Option<Vec<SlideEvidenceInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlideEvidenceInput {
    document_name: String,
    chunk_index: usize,
    text: String,
    score: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StoredGraphNode {
    id: String,
    label: String,
    kind: String,
    frequency: u32,
    pagerank: f64,
    bridge_score: f64,
    community: i32,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct StoredGraphEdge {
    source: String,
    target: String,
    weight: u32,
}

#[derive(Debug, Deserialize)]
struct StoredGraph {
    nodes: Vec<StoredGraphNode>,
    edges: Vec<StoredGraphEdge>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChunkEmbeddingInput {
    project_path: String,
    chunk_id: String,
    document_path: String,
    document_name: String,
    chunk_index: usize,
    text: String,
    text_hash: String,
    provider: String,
    model: String,
    dimensions: usize,
    embedding: Vec<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchRequest {
    project_path: String,
    provider: String,
    model: String,
    embedding: Vec<f64>,
    limit: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchResult {
    chunk_id: String,
    document_path: String,
    document_name: String,
    chunk_index: usize,
    text: String,
    score: f64,
}

#[tauri::command]
async fn extract_concepts(
    text: String,
    settings: ModelSettings,
) -> Result<ConceptExtractionResult, String> {
    let prompt = make_concept_prompt(&text);
    match settings.provider.as_str() {
        "ollama" => extract_with_ollama(&prompt, &settings).await,
        "gemini" => extract_with_gemini(&prompt, &settings).await,
        _ => extract_with_openai_compatible(&prompt, &settings).await,
    }
}

#[tauri::command]
async fn test_model_connection(settings: ModelSettings) -> Result<ModelConnectionResult, String> {
    match fetch_provider_models(&settings).await {
        Ok(models) if !models.is_empty() => Ok(ModelConnectionResult {
            ok: true,
            source: "provider".to_string(),
            message: format!("Connected. Found {} model(s) from provider.", models.len()),
            models,
        }),
        Ok(_) => {
            let models = fallback_models(&settings.provider);
            Ok(ModelConnectionResult {
                ok: true,
                source: "registry".to_string(),
                message: "Connected, but provider returned no model list. Showing built-in registry models.".to_string(),
                models,
            })
        }
        Err(error) => {
            let models = fallback_models(&settings.provider);
            Ok(ModelConnectionResult {
                ok: false,
                source: "registry".to_string(),
                message: format!(
                    "Provider model lookup failed: {}. Showing built-in registry models.",
                    error
                ),
                models,
            })
        }
    }
}

#[tauri::command]
async fn generate_slide_outline(
    app: tauri::AppHandle,
    request: SlideOutlineRequest,
) -> Result<String, String> {
    let graph_json =
        load_project_graph_from_db(&app, request.project_path.clone())?.ok_or_else(|| {
            "No saved graph found for this project. Build the graph first.".to_string()
        })?;
    let graph: StoredGraph = serde_json::from_str(&graph_json)
        .map_err(|err| format!("Failed to parse saved graph: {}", err))?;
    let input = build_project_graph_input(request.project_path.clone(), Some(false)).await?;
    let context = make_slide_outline_context(&graph, &input, &request);
    let prompt = make_slide_outline_prompt(&context, &request);
    match complete_text_with_model(&prompt, &request.settings).await {
        Ok(markdown) if !markdown.trim().is_empty() => Ok(clean_model_markdown_text(&markdown)),
        Ok(_) => Ok(make_fallback_slide_outline_markdown(
            &context,
            &request,
            "Model returned empty content.",
        )),
        Err(error) => Ok(make_fallback_slide_outline_markdown(
            &context, &request, &error,
        )),
    }
}

#[tauri::command]
async fn open_project_folder() -> Result<Option<ProjectInfo>, String> {
    let folder = rfd::AsyncFileDialog::new().pick_folder().await;
    let Some(folder) = folder else {
        return Ok(None);
    };
    let path = folder.path().to_path_buf();
    scan_project_path(path).map(Some)
}

#[tauri::command]
async fn scan_project_documents(path: String) -> Result<ProjectInfo, String> {
    scan_project_path(PathBuf::from(path))
}

#[tauri::command]
async fn load_project_document(
    project_path: String,
    document_path: String,
) -> Result<LoadedProjectDocument, String> {
    let project_path = PathBuf::from(project_path);
    let document_path = PathBuf::from(document_path);
    let canonical_project = project_path.canonicalize().map_err(|err| err.to_string())?;
    let canonical_document = document_path
        .canonicalize()
        .map_err(|err| err.to_string())?;
    if !canonical_document.starts_with(&canonical_project) {
        return Err("Document is outside the selected project.".to_string());
    }

    let name = canonical_document
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Document")
        .to_string();
    let extension = canonical_document
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !is_document_extension(&extension) {
        return Err(format!("Unsupported document type: {}", extension));
    }

    if extension == "pdf" {
        return Ok(LoadedProjectDocument {
            title: name,
            path: canonical_document.to_string_lossy().to_string(),
            extension,
            kind: "pdf".to_string(),
            markdown: None,
            file_path: Some(canonical_document.to_string_lossy().to_string()),
        });
    }

    let size = fs::metadata(&canonical_document)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let document = ProjectDocument {
        path: canonical_document.to_string_lossy().to_string(),
        name,
        extension,
        size,
    };
    let source_hash = hash_file(&canonical_document)?;
    let markdown_dir = project_markdown_dir(&canonical_project);
    let config = load_project_build_config(&canonical_project)?;
    let pending_documents: Vec<ProjectBuildDocument> = Vec::new();
    let Some((markdown, markdown_path)) = ensure_document_markdown(
        &document,
        &source_hash,
        false,
        &project_cache_dir(&canonical_project),
        &markdown_dir,
        &config,
        &pending_documents,
    )?
    else {
        return Err(format!(
            "Cannot preview {}. Please convert it to a supported Markdown-readable format.",
            document.name
        ));
    };

    let mut next_documents = config.documents;
    if !next_documents
        .iter()
        .any(|entry| entry.source_path == document.path && entry.source_hash == source_hash)
    {
        next_documents.retain(|entry| entry.source_path != document.path);
        next_documents.push(ProjectBuildDocument {
            source_path: document.path.clone(),
            source_hash,
            markdown_path: markdown_path.to_string_lossy().to_string(),
            name: document.name.clone(),
            extension: document.extension.clone(),
            size: document.size,
        });
        save_project_build_config(
            &canonical_project,
            &ProjectBuildConfig {
                version: 1,
                documents: next_documents,
            },
        )?;
    }

    Ok(LoadedProjectDocument {
        title: document.name,
        path: document.path,
        extension: document.extension,
        kind: "markdown".to_string(),
        markdown: Some(markdown),
        file_path: Some(markdown_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
async fn build_project_graph_input(
    path: String,
    rebuild: Option<bool>,
) -> Result<ProjectGraphInput, String> {
    let project_path = PathBuf::from(path);
    migrate_project_build_cache(&project_path)?;
    let project = scan_project_path(project_path.clone())?;
    let rebuild = rebuild.unwrap_or(false);
    let mut build_config = if rebuild {
        reset_project_build_cache(&project_path)?;
        ProjectBuildConfig {
            version: 1,
            documents: Vec::new(),
        }
    } else {
        load_project_build_config(&project_path)?
    };
    let cache_dir = project_cache_dir(&project_path);
    let markdown_dir = project_markdown_dir(&project_path);
    fs::create_dir_all(&markdown_dir).map_err(|err| err.to_string())?;
    let mut documents_read = 0;
    let mut documents_skipped = 0;
    let mut parts = Vec::new();
    let mut markdown_documents = Vec::new();
    let mut chunks = Vec::new();
    let mut next_config_documents = Vec::new();

    for document in project.documents {
        let source_hash = match hash_file(Path::new(&document.path)) {
            Ok(hash) => hash,
            Err(_) => {
                documents_skipped += 1;
                continue;
            }
        };
        match ensure_document_markdown(
            &document,
            &source_hash,
            rebuild,
            &cache_dir,
            &markdown_dir,
            &build_config,
            &next_config_documents,
        ) {
            Ok(Some((markdown, markdown_path))) if !markdown.trim().is_empty() => {
                documents_read += 1;
                let document_path = document.path.clone();
                let document_name = document.name.clone();
                let document_extension = document.extension.clone();
                let document_markdown = limit_text(markdown, 200_000);
                let document_text = format!(
                    "# Document: {}\nPath: {}\n\n{}",
                    document_name, document_path, document_markdown
                );
                chunks.extend(split_markdown_document(
                    &document_path,
                    &document_name,
                    &document_text,
                ));
                parts.push(format!("\n\n{}", document_text));
                let char_count = document_markdown.chars().count();
                markdown_documents.push(ProjectMarkdownDocument {
                    path: document_path,
                    name: document_name,
                    extension: document_extension,
                    markdown: document_markdown,
                    char_count,
                });
                next_config_documents.push(ProjectBuildDocument {
                    source_path: document.path,
                    source_hash,
                    markdown_path: markdown_path.to_string_lossy().to_string(),
                    name: document.name,
                    extension: document.extension,
                    size: document.size,
                });
            }
            _ => {
                documents_skipped += 1;
                parts.push(format!(
                    "\n\n# Document: {}\nPath: {}\nType: {}\n",
                    document.name, document.path, document.extension
                ));
            }
        }
    }
    build_config.version = 1;
    build_config.documents = next_config_documents;
    save_project_build_config(&project_path, &build_config)?;

    Ok(ProjectGraphInput {
        text: parts.join("\n"),
        documents_read,
        documents_skipped,
        documents: markdown_documents,
        chunks,
    })
}

#[tauri::command]
async fn save_project_graph(
    app: tauri::AppHandle,
    project_path: String,
    graph_json: String,
) -> Result<(), String> {
    save_project_graph_to_db(&app, project_path, graph_json)
}

fn save_project_graph_to_db(
    app: &tauri::AppHandle,
    project_path: String,
    graph_json: String,
) -> Result<(), String> {
    let conn = open_app_db(app)?;
    conn.execute(
        "INSERT INTO project_graphs (project_path, graph_json, updated_at)
         VALUES (?1, ?2, strftime('%s','now'))
         ON CONFLICT(project_path)
         DO UPDATE SET graph_json = excluded.graph_json, updated_at = excluded.updated_at",
        params![project_path, graph_json],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_project_graph(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<Option<String>, String> {
    load_project_graph_from_db(&app, project_path)
}

fn load_project_graph_from_db(
    app: &tauri::AppHandle,
    project_path: String,
) -> Result<Option<String>, String> {
    let conn = open_app_db(app)?;
    let mut stmt = conn
        .prepare("SELECT graph_json FROM project_graphs WHERE project_path = ?1")
        .map_err(|err| err.to_string())?;
    let mut rows = stmt
        .query(params![project_path])
        .map_err(|err| err.to_string())?;
    if let Some(row) = rows.next().map_err(|err| err.to_string())? {
        let graph_json: String = row.get(0).map_err(|err| err.to_string())?;
        Ok(Some(graph_json))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn save_project_chunk_embeddings(
    app: tauri::AppHandle,
    embeddings: Vec<ChunkEmbeddingInput>,
) -> Result<usize, String> {
    let conn = open_app_db(&app)?;
    let mut saved = 0;
    for item in embeddings {
        let embedding_json =
            serde_json::to_string(&item.embedding).map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO chunk_embeddings (
                project_path, chunk_id, document_path, document_name, chunk_index, text,
                text_hash, provider, model, dimensions, embedding_json, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, strftime('%s','now'))
             ON CONFLICT(project_path, chunk_id, provider, model)
             DO UPDATE SET
                document_path = excluded.document_path,
                document_name = excluded.document_name,
                chunk_index = excluded.chunk_index,
                text = excluded.text,
                text_hash = excluded.text_hash,
                dimensions = excluded.dimensions,
                embedding_json = excluded.embedding_json,
                updated_at = excluded.updated_at",
            params![
                item.project_path,
                item.chunk_id,
                item.document_path,
                item.document_name,
                item.chunk_index as i64,
                item.text,
                item.text_hash,
                item.provider,
                item.model,
                item.dimensions as i64,
                embedding_json
            ],
        )
        .map_err(|err| err.to_string())?;
        saved += 1;
    }
    Ok(saved)
}

#[tauri::command]
async fn search_project_embeddings(
    app: tauri::AppHandle,
    request: SemanticSearchRequest,
) -> Result<Vec<SemanticSearchResult>, String> {
    let conn = open_app_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT chunk_id, document_path, document_name, chunk_index, text, embedding_json
             FROM chunk_embeddings
             WHERE project_path = ?1 AND provider = ?2 AND model = ?3",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(
            params![request.project_path, request.provider, request.model],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|err| err.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        let (chunk_id, document_path, document_name, chunk_index, text, embedding_json) =
            row.map_err(|err| err.to_string())?;
        let embedding: Vec<f64> =
            serde_json::from_str(&embedding_json).map_err(|err| err.to_string())?;
        let score = cosine_similarity(&request.embedding, &embedding);
        if score.is_finite() {
            results.push(SemanticSearchResult {
                chunk_id,
                document_path,
                document_name,
                chunk_index: chunk_index as usize,
                text,
                score,
            });
        }
    }
    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(request.limit.clamp(1, 24));
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            extract_concepts,
            test_model_connection,
            generate_slide_outline,
            open_project_folder,
            scan_project_documents,
            load_project_document,
            build_project_graph_input,
            save_project_graph,
            load_project_graph,
            save_project_chunk_embeddings,
            search_project_embeddings
        ])
        .run(tauri::generate_context!())
        .expect("error while running AnshuDoc");
}

fn open_app_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let db_path = dir.join("anshu_doc.sqlite");
    migrate_legacy_app_db(&db_path)?;
    let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_graphs (
            project_path TEXT PRIMARY KEY,
            graph_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|err| err.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chunk_embeddings (
            project_path TEXT NOT NULL,
            chunk_id TEXT NOT NULL,
            document_path TEXT NOT NULL,
            document_name TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            embedding_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(project_path, chunk_id, provider, model)
        )",
        [],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn)
}

fn cosine_similarity(left: &[f64], right: &[f64]) -> f64 {
    let len = left.len().min(right.len());
    if len == 0 {
        return 0.0;
    }
    let mut dot = 0.0;
    let mut left_norm = 0.0;
    let mut right_norm = 0.0;
    for index in 0..len {
        let a = left[index];
        let b = right[index];
        dot += a * b;
        left_norm += a * a;
        right_norm += b * b;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        dot / (left_norm.sqrt() * right_norm.sqrt())
    }
}

fn migrate_legacy_app_db(db_path: &Path) -> Result<(), String> {
    if db_path.exists() {
        return Ok(());
    }

    let Ok(home) = std::env::var("HOME") else {
        return Ok(());
    };
    let legacy_paths = [
        PathBuf::from(&home)
            .join(".brain_grap")
            .join("brain_graph.sqlite"),
        PathBuf::from(home)
            .join(".brain_graph")
            .join("brain_graph.sqlite"),
    ];
    for legacy_path in legacy_paths {
        if legacy_path.exists() {
            fs::copy(&legacy_path, db_path).map_err(|err| err.to_string())?;
            break;
        }
    }
    Ok(())
}

fn scan_project_path(path: PathBuf) -> Result<ProjectInfo, String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Project")
        .to_string();
    let mut documents = Vec::new();
    collect_documents(&path, &mut documents, 0)?;
    documents.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok(ProjectInfo {
        id: path.to_string_lossy().to_string(),
        name,
        path: path.to_string_lossy().to_string(),
        documents,
    })
}

fn collect_documents(
    path: &Path,
    documents: &mut Vec<ProjectDocument>,
    depth: usize,
) -> Result<(), String> {
    if depth > 6 {
        return Ok(());
    }

    let entries = fs::read_dir(path).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let child = entry.path();
        let name = child
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        if child.is_dir() {
            collect_documents(&child, documents, depth + 1)?;
            continue;
        }
        let extension = child
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !is_document_extension(&extension) {
            continue;
        }
        let size = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        documents.push(ProjectDocument {
            path: child.to_string_lossy().to_string(),
            name,
            extension,
            size,
        });
    }
    Ok(())
}

fn is_document_extension(extension: &str) -> bool {
    matches!(
        extension,
        "pdf"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "csv"
            | "txt"
            | "md"
            | "markdown"
            | "json"
            | "pptx"
            | "jpg"
            | "jpeg"
            | "png"
            | "bmp"
    )
}

fn read_with_markitdown(path: &Path) -> Result<Option<String>, String> {
    for command in markitdown_command_candidates() {
        if let Ok(Some(text)) = run_markitdown_command(&command, path) {
            return Ok(Some(text));
        }
    }

    Ok(None)
}

fn markitdown_command_candidates() -> Vec<PathBuf> {
    let sidecar_name = "markitdown-sidecar";
    let sidecar_target_name = if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "markitdown-sidecar-aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "markitdown-sidecar-x86_64-apple-darwin"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "markitdown-sidecar-x86_64-unknown-linux-gnu"
    } else {
        sidecar_name
    };

    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var("ANSHU_DOC_MARKITDOWN_SIDECAR") {
        candidates.push(PathBuf::from(path));
    }

    if let Ok(path) = std::env::var("BRAIN_GRAPH_MARKITDOWN_SIDECAR") {
        candidates.push(PathBuf::from(path));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(sidecar_name));
            candidates.push(dir.join(sidecar_target_name));
            candidates.push(dir.join("../Resources").join(sidecar_name));
            candidates.push(dir.join("../Resources").join(sidecar_target_name));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(sidecar_target_name),
    );
    candidates.push(PathBuf::from("markitdown"));

    candidates
}

fn run_markitdown_command(command: &Path, path: &Path) -> Result<Option<String>, String> {
    if command.components().count() > 1 && !command.exists() {
        return Ok(None);
    }

    let is_anshu_doc_sidecar = command
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with("markitdown-sidecar"))
        .unwrap_or(false);
    let mut process = Command::new(command);
    process.arg(path);
    if is_anshu_doc_sidecar {
        process.arg("--max-chars").arg("200000");
    }
    let output = process.output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            if text.trim().is_empty() {
                Ok(None)
            } else {
                Ok(Some(limit_text(text, 200_000)))
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(format!(
                "MarkItDown failed for {}: {}",
                path.display(),
                stderr.trim()
            ))
        }
        Err(err) => Err(format!(
            "MarkItDown command failed for {}: {}",
            path.display(),
            err
        )),
    }
}

fn project_cache_dir(project_path: &Path) -> PathBuf {
    project_path.join(".anshusoft-grove").join("anshu-doc")
}

fn project_markdown_dir(project_path: &Path) -> PathBuf {
    project_cache_dir(project_path).join("markdown")
}

fn project_build_config_path(project_path: &Path) -> PathBuf {
    project_cache_dir(project_path).join("config.json")
}

fn migrate_project_build_cache(project_path: &Path) -> Result<(), String> {
    let next_dir = project_cache_dir(project_path);
    if next_dir.exists() {
        return Ok(());
    }

    for legacy_dir in legacy_project_cache_dirs(project_path) {
        if !legacy_dir.exists() {
            continue;
        }
        if let Some(parent) = next_dir.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::rename(legacy_dir, next_dir).map_err(|err| err.to_string())?;
        break;
    }
    Ok(())
}

fn legacy_project_cache_dirs(project_path: &Path) -> [PathBuf; 2] {
    [
        project_path.join(".brain_graph"),
        project_path.join(".brain_grap"),
    ]
}

fn load_project_build_config(project_path: &Path) -> Result<ProjectBuildConfig, String> {
    let path = project_build_config_path(project_path);
    if !path.exists() {
        return Ok(ProjectBuildConfig {
            version: 1,
            documents: Vec::new(),
        });
    }
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text)
        .map_err(|err| format!("Invalid build config {}: {}", path.display(), err))
}

fn save_project_build_config(
    project_path: &Path,
    config: &ProjectBuildConfig,
) -> Result<(), String> {
    let dir = project_cache_dir(project_path);
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let text = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    fs::write(project_build_config_path(project_path), text).map_err(|err| err.to_string())
}

fn reset_project_build_cache(project_path: &Path) -> Result<(), String> {
    let markdown_dir = project_markdown_dir(project_path);
    if markdown_dir.exists() {
        fs::remove_dir_all(&markdown_dir).map_err(|err| err.to_string())?;
    }
    let config_path = project_build_config_path(project_path);
    if config_path.exists() {
        fs::remove_file(config_path).map_err(|err| err.to_string())?;
    }
    for legacy_dir in legacy_project_cache_dirs(project_path) {
        if legacy_dir.exists() {
            let _ = fs::remove_dir_all(legacy_dir);
        }
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn ensure_document_markdown(
    document: &ProjectDocument,
    source_hash: &str,
    rebuild: bool,
    _cache_dir: &Path,
    markdown_dir: &Path,
    config: &ProjectBuildConfig,
    pending_documents: &[ProjectBuildDocument],
) -> Result<Option<(String, PathBuf)>, String> {
    if !rebuild {
        if let Some(entry) = config
            .documents
            .iter()
            .find(|entry| entry.source_path == document.path && entry.source_hash == source_hash)
        {
            let path = PathBuf::from(&entry.markdown_path);
            if path.exists() {
                return fs::read_to_string(path)
                    .map(|text| {
                        Some((
                            limit_text(text, 200_000),
                            PathBuf::from(&entry.markdown_path),
                        ))
                    })
                    .map_err(|err| err.to_string());
            }
        }
    }

    let Some(markdown) = convert_document_to_markdown(document)? else {
        return Ok(None);
    };
    let markdown = limit_text(markdown, 200_000);
    if markdown.trim().is_empty() {
        return Ok(None);
    }
    fs::create_dir_all(markdown_dir).map_err(|err| err.to_string())?;
    let markdown_path = markdown_cache_path(document, source_hash, markdown_dir, pending_documents);
    fs::write(&markdown_path, &markdown).map_err(|err| err.to_string())?;
    Ok(Some((markdown, markdown_path)))
}

fn markdown_cache_path(
    document: &ProjectDocument,
    source_hash: &str,
    markdown_dir: &Path,
    pending_documents: &[ProjectBuildDocument],
) -> PathBuf {
    let stem = Path::new(&document.name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(&document.name);
    let base_name = format!(
        "{}_{}.md",
        sanitize_cache_filename(stem),
        sanitize_cache_filename(&document.extension)
    );
    let base_path = markdown_dir.join(&base_name);
    let already_pending = pending_documents.iter().any(|entry| {
        Path::new(&entry.markdown_path)
            .file_name()
            .and_then(|name| name.to_str())
            == Some(base_name.as_str())
    });
    if !base_path.exists() && !already_pending {
        return base_path;
    }

    let short_hash: String = source_hash.chars().take(8).collect();
    markdown_dir.join(format!(
        "{}_{}_{}.md",
        sanitize_cache_filename(stem),
        sanitize_cache_filename(&document.extension),
        short_hash
    ))
}

fn sanitize_cache_filename(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "document".to_string()
    } else {
        trimmed.to_string()
    }
}

fn convert_document_to_markdown(document: &ProjectDocument) -> Result<Option<String>, String> {
    let path = Path::new(&document.path);
    match document.extension.as_str() {
        "md" | "markdown" => fs::read_to_string(path)
            .map(|text| Some(limit_text(text, 200_000)))
            .map_err(|err| err.to_string()),
        "txt" | "csv" | "json" => fs::read_to_string(path)
            .map(|text| {
                Some(plain_text_to_markdown(
                    &document.name,
                    &document.extension,
                    &text,
                ))
            })
            .map_err(|err| err.to_string()),
        "pdf" | "docx" | "xlsx" | "xls" | "pptx" | "jpg" | "jpeg" | "png" | "bmp" => {
            read_with_markitdown(path)
        }
        "doc" => Ok(None),
        _ => Ok(None),
    }
}

fn plain_text_to_markdown(name: &str, extension: &str, text: &str) -> String {
    let limited = limit_text(text.to_string(), 200_000);
    match extension {
        "csv" => format!("## {}\n\n```csv\n{}\n```", name, limited),
        "json" => format!("## {}\n\n```json\n{}\n```", name, limited),
        _ => limited,
    }
}

fn split_markdown_document(
    document_path: &str,
    document_name: &str,
    markdown: &str,
) -> Vec<ProjectChunk> {
    let splitter = MarkdownSplitter::new(1200..1800);
    splitter
        .chunks(markdown)
        .enumerate()
        .filter_map(|(index, chunk)| {
            let text = chunk.trim();
            if text.is_empty() {
                return None;
            }
            Some(ProjectChunk {
                id: format!("{}#{}", document_path, index),
                document_path: document_path.to_string(),
                document_name: document_name.to_string(),
                index,
                text: text.to_string(),
                char_count: text.chars().count(),
            })
        })
        .collect()
}

fn limit_text(text: String, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn make_concept_prompt(text: &str) -> String {
    let clipped: String = text.chars().take(12000).collect();
    format!(
        r#"Extract meaningful concepts and their categories from the text for a knowledge graph.

Categories to use (pick one for each concept):
- Person: Named people or specific roles.
- Organization: Companies, institutions, groups.
- Technology: Tools, languages, frameworks, tech concepts.
- Location: Places, cities, countries.
- Event: Specific happenings or periods.
- Metric: Measurable values, targets, or performance indicators.
- Idea: Abstract concepts, theories, or opinions.
- Misc: Anything else that is a distinct entity.

Rules:
- Remove function words, filler words, vague verbs, and generic terms.
- Keep domain concepts, methods, objects, actors, metrics, problems, and important phrases.
- Preserve repeated concepts when they appear repeatedly, because frequency matters for graph construction.
- Merge obvious aliases into one canonical phrase.
- Use the original language of the concept.
- Return JSON only, with this exact shape: {{"concepts":[{{"name":"concept name","kind":"Category"}}]}}.
- Include no explanations.

Text:
---
{}
---"#,
        clipped
    )
}

fn make_slide_outline_context(
    graph: &StoredGraph,
    input: &ProjectGraphInput,
    request: &SlideOutlineRequest,
) -> Value {
    let query = request.question.to_lowercase();
    let mut scored_nodes = graph.nodes.clone();
    scored_nodes.sort_by(|left, right| {
        let left_match = if query.contains(&left.label.to_lowercase())
            || query.contains(&left.id.to_lowercase())
        {
            10.0
        } else {
            0.0
        };
        let right_match = if query.contains(&right.label.to_lowercase())
            || query.contains(&right.id.to_lowercase())
        {
            10.0
        } else {
            0.0
        };
        let left_score = left_match + left.pagerank * 100.0 + (left.frequency as f64).ln_1p();
        let right_score = right_match + right.pagerank * 100.0 + (right.frequency as f64).ln_1p();
        right_score
            .partial_cmp(&left_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let seed_nodes: Vec<StoredGraphNode> = scored_nodes.into_iter().take(16).collect();
    let seed_ids: std::collections::HashSet<String> =
        seed_nodes.iter().map(|node| node.id.clone()).collect();
    let sub_edges: Vec<StoredGraphEdge> = graph
        .edges
        .iter()
        .filter(|edge| seed_ids.contains(&edge.source) || seed_ids.contains(&edge.target))
        .take(80)
        .cloned()
        .collect();
    let mut sub_node_ids = seed_ids;
    for edge in &sub_edges {
        sub_node_ids.insert(edge.source.clone());
        sub_node_ids.insert(edge.target.clone());
    }
    let sub_nodes: Vec<&StoredGraphNode> = graph
        .nodes
        .iter()
        .filter(|node| sub_node_ids.contains(&node.id))
        .take(48)
        .collect();
    let keywords: Vec<String> = seed_nodes
        .iter()
        .take(12)
        .map(|node| node.label.to_lowercase())
        .collect();
    let mut evidence = Vec::new();
    for chunk in &input.chunks {
        let lower = chunk.text.to_lowercase();
        let hits: Vec<String> = keywords
            .iter()
            .filter(|keyword| lower.contains(keyword.as_str()))
            .take(4)
            .cloned()
            .collect();
        if hits.is_empty() {
            continue;
        }
        evidence.push(json!({
            "document": chunk.document_name,
            "chunkIndex": chunk.index,
            "concepts": hits,
            "text": limit_text(chunk.text.clone(), 900)
        }));
        if evidence.len() >= 12 {
            break;
        }
    }
    let semantic_evidence = request
        .semantic_evidence
        .as_ref()
        .map(|items| {
            items
                .iter()
                .take(10)
                .map(|item| {
                    json!({
                        "document": item.document_name,
                        "chunkIndex": item.chunk_index,
                        "score": item.score,
                        "text": limit_text(item.text.clone(), 900)
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    json!({
        "question": request.question,
        "audience": request.audience,
        "slideCount": request.slide_count,
        "language": request.language,
        "graphSummary": {
            "nodes": graph.nodes.len(),
            "edges": graph.edges.len(),
            "topConcepts": seed_nodes.iter().take(12).map(|node| node.label.clone()).collect::<Vec<_>>()
        },
        "subgraph": {
            "nodes": sub_nodes.iter().map(|node| json!({
                "id": node.id,
                "label": node.label,
                "kind": node.kind,
                "frequency": node.frequency,
                "pagerank": node.pagerank,
                "community": node.community
            })).collect::<Vec<_>>(),
            "edges": sub_edges.iter().map(|edge| json!({
                "source": edge.source,
                "target": edge.target,
                "weight": edge.weight
            })).collect::<Vec<_>>()
        },
        "evidence": evidence,
        "semanticEvidence": semantic_evidence
    })
}

fn make_slide_outline_prompt(context: &Value, request: &SlideOutlineRequest) -> String {
    format!(
        r#"You are a senior presentation strategist. Generate a readable Markdown slide outline from a project knowledge graph and evidence snippets.

Rules:
- Create about {} slides.
- Write for audience: {}.
- Answer the user's question directly.
- Output Markdown only. Do not output JSON.
- Use only facts supported by the context evidence and subgraph. Do not invent tools, products, metrics, or workflows.
- Merge duplicate topics.
- Make slide titles specific and useful for the audience.
- For each slide include: purpose, 2-4 bullets, suggested visual, and speaker notes.
- Include short evidence references when useful, using document name or chunk index.
- If evidence is insufficient, say what should be verified instead of inventing details.

Context JSON:
{}"#,
        request.slide_count,
        request.audience,
        serde_json::to_string(context).unwrap_or_else(|_| "{}".to_string())
    )
}

async fn extract_with_ollama(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<ConceptExtractionResult, String> {
    let url = format!("{}/api/chat", trim_slash(&settings.base_url));
    let client = reqwest_client()?;
    let response = client
        .post(url)
        .json(&json!({
            "model": settings.model,
            "stream": false,
            "format": "json",
            "messages": [{"role": "user", "content": prompt}]
        }))
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned {}", response.status()));
    }

    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let content = data["message"]["content"].as_str().unwrap_or("");
    Ok(ConceptExtractionResult {
        concepts: parse_concepts(content)?,
        provider_used: format!("ollama:{}", settings.model),
    })
}

async fn fetch_provider_models(settings: &ModelSettings) -> Result<Vec<String>, String> {
    match settings.provider.as_str() {
        "ollama" => fetch_ollama_models(settings).await,
        "gemini" => fetch_gemini_models(settings).await,
        "deepseek" | "minimax" | "custom" => fetch_openai_compatible_models(settings).await,
        _ => Ok(Vec::new()),
    }
}

async fn fetch_ollama_models(settings: &ModelSettings) -> Result<Vec<String>, String> {
    let base_url = if settings.base_url.is_empty() {
        "http://127.0.0.1:11434"
    } else {
        settings.base_url.as_str()
    };
    let url = format!("{}/api/tags", trim_slash(base_url));
    let client = reqwest_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| request_error_message("ollama", err))?;
    if !response.status().is_success() {
        return Err(format!("ollama returned {}", response.status()));
    }
    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let models = data["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["name"].as_str().map(|name| name.to_string()))
        .collect();
    Ok(models)
}

async fn fetch_openai_compatible_models(settings: &ModelSettings) -> Result<Vec<String>, String> {
    let base_url = if settings.base_url.is_empty() {
        match settings.provider.as_str() {
            "deepseek" => "https://api.deepseek.com",
            "minimax" => "https://api.minimax.io/v1",
            _ => "",
        }
    } else {
        settings.base_url.as_str()
    };
    if base_url.is_empty() {
        return Err("Base URL is required".to_string());
    }
    let url = format!("{}/models", trim_slash(base_url));
    let client = reqwest_client()?;
    let mut request = client.get(url);
    if !settings.api_key.is_empty() {
        request = request.bearer_auth(&settings.api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|err| request_error_message(&settings.provider, err))?;
    if !response.status().is_success() {
        return Err(format!(
            "{} returned {}",
            settings.provider,
            response.status()
        ));
    }
    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let models = data["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["id"].as_str().map(|id| id.to_string()))
        .collect();
    Ok(models)
}

async fn fetch_gemini_models(settings: &ModelSettings) -> Result<Vec<String>, String> {
    if settings.api_key.is_empty() {
        return Err("Gemini API key is required".to_string());
    }
    let base_url = if settings.base_url.is_empty() {
        "https://generativelanguage.googleapis.com/v1beta"
    } else {
        settings.base_url.as_str()
    };
    let url = format!("{}/models?key={}", trim_slash(base_url), settings.api_key);
    let client = reqwest_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| request_error_message("gemini", err))?;
    if !response.status().is_success() {
        return Err(format!("gemini returned {}", response.status()));
    }
    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let models = data["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item["name"]
                .as_str()
                .map(|name| name.trim_start_matches("models/").to_string())
        })
        .collect();
    Ok(models)
}

fn fallback_models(provider: &str) -> Vec<String> {
    match provider {
        "ollama" => vec!["qwen2.5:3b", "qwen2.5:7b", "llama3.2:3b", "gemma2:2b"],
        "deepseek" => vec!["deepseek-chat", "deepseek-reasoner"],
        "gemini" => vec!["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
        "minimax" => vec![
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2",
            "MiniMax-M2.5",
            "MiniMax-M2.7",
            "MiniMax-M2.1",
            "MiniMax-M2.5-highspeed",
        ],
        _ => Vec::new(),
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

async fn extract_with_openai_compatible(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<ConceptExtractionResult, String> {
    let base_url = if settings.base_url.is_empty() {
        match settings.provider.as_str() {
            "deepseek" => "https://api.deepseek.com",
            "minimax" => "https://api.minimax.io/v1",
            _ => "",
        }
    } else {
        settings.base_url.as_str()
    };

    let url = format!("{}/chat/completions", trim_slash(base_url));
    let client = reqwest_client()?;
    let response = client
        .post(url)
        .bearer_auth(&settings.api_key)
        .json(&json!({
            "model": settings.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}]
        }))
        .send()
        .await
        .map_err(|err| request_error_message(&settings.provider, err))?;

    if !response.status().is_success() {
        return Err(format!(
            "{} returned {}",
            settings.provider,
            response.status()
        ));
    }

    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");
    Ok(ConceptExtractionResult {
        concepts: parse_concepts(content)?,
        provider_used: format!("{}:{}", settings.provider, settings.model),
    })
}

async fn complete_text_with_model(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<String, String> {
    match settings.provider.as_str() {
        "ollama" => {
            let url = format!("{}/api/chat", trim_slash(&settings.base_url));
            let client = reqwest_client()?;
            let response = client
                .post(url)
                .json(&json!({
                    "model": settings.model,
                    "stream": false,
                    "messages": [{"role": "user", "content": prompt}]
                }))
                .send()
                .await
                .map_err(|err| request_error_message("ollama", err))?;
            if !response.status().is_success() {
                return Err(format!("Ollama returned {}", response.status()));
            }
            let data: Value = response.json().await.map_err(|err| err.to_string())?;
            Ok(data["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string())
        }
        "gemini" => {
            let model = if settings.model.is_empty() {
                "gemini-2.5-flash"
            } else {
                settings.model.as_str()
            };
            let base_url = if settings.base_url.is_empty() {
                "https://generativelanguage.googleapis.com/v1beta"
            } else {
                settings.base_url.as_str()
            };
            let url = format!(
                "{}/models/{}:generateContent?key={}",
                trim_slash(base_url),
                model,
                settings.api_key
            );
            let client = reqwest_client()?;
            let response = client
                .post(url)
                .json(&json!({
                    "generationConfig": {"temperature": 0.2},
                    "contents": [{"parts": [{"text": prompt}]}]
                }))
                .send()
                .await
                .map_err(|err| request_error_message("gemini", err))?;
            if !response.status().is_success() {
                return Err(format!("Gemini returned {}", response.status()));
            }
            let data: Value = response.json().await.map_err(|err| err.to_string())?;
            Ok(data["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string())
        }
        _ => {
            let base_url = if settings.base_url.is_empty() {
                match settings.provider.as_str() {
                    "deepseek" => "https://api.deepseek.com",
                    "minimax" => "https://api.minimax.io/v1",
                    _ => "",
                }
            } else {
                settings.base_url.as_str()
            };
            if base_url.is_empty() {
                return Err("Base URL is required".to_string());
            }
            let url = format!("{}/chat/completions", trim_slash(base_url));
            let client = reqwest_client()?;
            let response = client
                .post(url)
                .bearer_auth(&settings.api_key)
                .json(&json!({
                    "model": settings.model,
                    "temperature": 0.2,
                    "messages": [{"role": "user", "content": prompt}]
                }))
                .send()
                .await
                .map_err(|err| request_error_message(&settings.provider, err))?;
            if !response.status().is_success() {
                return Err(format!(
                    "{} returned {}",
                    settings.provider,
                    response.status()
                ));
            }
            let data: Value = response.json().await.map_err(|err| err.to_string())?;
            Ok(data["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string())
        }
    }
}

fn clean_model_markdown_text(content: &str) -> String {
    let mut cleaned = content.trim().to_string();
    if let Some(after_think) = cleaned.rsplit_once("</think>").map(|(_, tail)| tail.trim()) {
        cleaned = after_think.to_string();
    }
    let trimmed = cleaned.trim();
    if trimmed.starts_with("```") && trimmed.ends_with("```") {
        let without_start = trimmed
            .trim_start_matches("```markdown")
            .trim_start_matches("```md")
            .trim_start_matches("```")
            .trim();
        return without_start.trim_end_matches("```").trim().to_string();
    }
    trimmed.to_string()
}

fn make_fallback_slide_outline_markdown(
    context: &Value,
    request: &SlideOutlineRequest,
    reason: &str,
) -> String {
    let top_concepts = context["graphSummary"]["topConcepts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .take(8)
        .collect::<Vec<_>>();
    let mut sections = vec![
        format!("# {} - 幻灯片大纲", request.question),
        format!("- 受众：{}", request.audience),
        "- 目标：基于项目知识图谱生成可编辑的汇报大纲".to_string(),
        format!("> 模型生成失败，以下为本地图谱 fallback 草稿：{}", reason),
        "## 页面大纲".to_string(),
    ];
    let slide_count = request.slide_count.clamp(3, 12);
    for index in 0..slide_count {
        let concept = top_concepts
            .get(index % top_concepts.len().max(1))
            .copied()
            .unwrap_or("项目主题");
        sections.push(format!(
            "### {}. {}\n- 目的：围绕项目资料中的关键主题建立管理层理解。\n- 关键点：结合文档证据说明 `{}` 的背景、影响和待验证事项。\n- 建议视觉：summary_cards。\n- 讲稿提示：先说明该主题来自项目文档和图谱，再补充需要人工核验的业务含义。",
            index + 1,
            concept,
            concept
        ));
    }
    sections.join("\n\n")
}


async fn extract_with_gemini(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<ConceptExtractionResult, String> {
    let model = if settings.model.is_empty() {
        "gemini-2.5-flash"
    } else {
        settings.model.as_str()
    };
    let base_url = if settings.base_url.is_empty() {
        "https://generativelanguage.googleapis.com/v1beta"
    } else {
        settings.base_url.as_str()
    };

    let url = format!(
        "{}/models/{}:generateContent?key={}",
        trim_slash(base_url),
        model,
        settings.api_key
    );
    let client = reqwest_client()?;
    let response = client
        .post(url)
        .json(&json!({
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            },
            "contents": [{"parts": [{"text": prompt}]}]
        }))
        .send()
        .await
        .map_err(|err| request_error_message("gemini", err))?;

    if !response.status().is_success() {
        return Err(format!("Gemini returned {}", response.status()));
    }

    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let content = data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("");
    Ok(ConceptExtractionResult {
        concepts: parse_concepts(content)?,
        provider_used: format!("gemini:{}", model),
    })
}

fn reqwest_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|err| err.to_string())
}

fn request_error_message(provider: &str, err: reqwest::Error) -> String {
    if err.is_timeout() {
        format!("{} request timed out after 90 seconds", provider)
    } else {
        err.to_string()
    }
}

fn parse_concepts(content: &str) -> Result<Vec<TypedConcept>, String> {
    let cleaned = clean_model_json_text(content);
    let data: Value = serde_json::from_str(&cleaned).map_err(|err| err.to_string())?;
    let concepts = if data.is_array() {
        data.as_array()
    } else {
        data["concepts"].as_array()
    }
    .ok_or_else(|| "Model response did not include concepts[]".to_string())?;

    let mut result = Vec::new();
    for value in concepts.iter().take(3000) {
        let concept = if let Some(name) = value.as_str() {
            TypedConcept {
                name: name.trim().to_string(),
                kind: "Misc".to_string(),
            }
        } else {
            let name = value
                .get("name")
                .or_else(|| value.get("concept"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let kind = value
                .get("kind")
                .or_else(|| value.get("category"))
                .or_else(|| value.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("Misc")
                .trim()
                .to_string();
            TypedConcept { name, kind }
        };

        if concept.name.chars().count() >= 2 {
            result.push(concept);
        }
    }

    Ok(result)
}

fn clean_model_json_text(content: &str) -> String {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if serde_json::from_str::<Value>(cleaned).is_ok() {
        return cleaned.to_string();
    }

    if let Some(after_think) = cleaned.rsplit_once("</think>").map(|(_, tail)| tail.trim()) {
        if serde_json::from_str::<Value>(after_think).is_ok() {
            return after_think.to_string();
        }
    }

    extract_first_json_value(cleaned).unwrap_or_else(|| cleaned.to_string())
}

fn extract_first_json_value(text: &str) -> Option<String> {
    for (start, ch) in text.char_indices() {
        if ch != '{' && ch != '[' {
            continue;
        }
        let expected_end = if ch == '{' { '}' } else { ']' };
        let mut stack = vec![expected_end];
        let mut in_string = false;
        let mut escaped = false;
        for (offset, current) in text[start..].char_indices().skip(1) {
            if in_string {
                if escaped {
                    escaped = false;
                } else if current == '\\' {
                    escaped = true;
                } else if current == '"' {
                    in_string = false;
                }
                continue;
            }

            match current {
                '"' => in_string = true,
                '{' => stack.push('}'),
                '[' => stack.push(']'),
                '}' | ']' => {
                    if stack.pop() != Some(current) {
                        break;
                    }
                    if stack.is_empty() {
                        let end = start + offset + current.len_utf8();
                        let candidate = &text[start..end];
                        if serde_json::from_str::<Value>(candidate).is_ok() {
                            return Some(candidate.to_string());
                        }
                        break;
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn trim_slash(value: &str) -> &str {
    value.trim_end_matches('/')
}
