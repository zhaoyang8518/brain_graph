use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use calamine::{open_workbook_auto, Reader};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use rusqlite::{params, Connection};
use zip::ZipArchive;

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
struct ConceptExtractionResult {
    concepts: Vec<String>,
    provider_used: String,
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
async fn build_project_graph_input(path: String) -> Result<ProjectGraphInput, String> {
    let project = scan_project_path(PathBuf::from(path))?;
    let mut documents_read = 0;
    let mut documents_skipped = 0;
    let mut parts = Vec::new();

    for document in project.documents {
        match read_document_text(Path::new(&document.path)) {
            Ok(Some(text)) if !text.trim().is_empty() => {
                documents_read += 1;
                parts.push(format!(
                    "\n\n# Document: {}\nPath: {}\n\n{}",
                    document.name, document.path, text
                ));
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

    Ok(ProjectGraphInput {
        text: parts.join("\n"),
        documents_read,
        documents_skipped,
    })
}

#[tauri::command]
async fn save_project_graph(project_path: String, graph_json: String) -> Result<(), String> {
    let conn = open_app_db()?;
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
async fn load_project_graph(project_path: String) -> Result<Option<String>, String> {
    let conn = open_app_db()?;
    let mut stmt = conn
        .prepare("SELECT graph_json FROM project_graphs WHERE project_path = ?1")
        .map_err(|err| err.to_string())?;
    let mut rows = stmt.query(params![project_path]).map_err(|err| err.to_string())?;
    if let Some(row) = rows.next().map_err(|err| err.to_string())? {
        let graph_json: String = row.get(0).map_err(|err| err.to_string())?;
        Ok(Some(graph_json))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            extract_concepts,
            open_project_folder,
            scan_project_documents,
            build_project_graph_input,
            save_project_graph,
            load_project_graph
        ])
        .run(tauri::generate_context!())
        .expect("error while running Brain Graph");
}

fn open_app_db() -> Result<Connection, String> {
    let home = std::env::var("HOME").map_err(|err| err.to_string())?;
    let dir = PathBuf::from(home).join(".brain_grap");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let db_path = dir.join("brain_graph.sqlite");
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
    Ok(conn)
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
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "csv" | "txt" | "md" | "markdown" | "json"
    )
}

fn read_document_text(path: &Path) -> Result<Option<String>, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    match extension.as_str() {
        "txt" | "md" | "markdown" | "csv" | "json" => fs::read_to_string(path)
            .map(|text| Some(text.chars().take(200_000).collect()))
            .map_err(|err| err.to_string()),
        "pdf" => read_pdf_text(path).map(Some),
        "docx" => read_docx_text(path).map(Some),
        "xlsx" | "xls" => read_excel_text(path).map(Some),
        "doc" => Ok(Some(
            "Unsupported legacy .doc file. Convert this document to .docx for text extraction."
                .to_string(),
        )),
        _ => Ok(None),
    }
}

fn read_pdf_text(path: &Path) -> Result<String, String> {
    pdf_extract::extract_text(path)
        .map(|text| limit_text(text, 200_000))
        .map_err(|err| format!("PDF extraction failed for {}: {}", path.display(), err))
}

fn read_docx_text(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| err.to_string())?;
    let mut document = archive
        .by_name("word/document.xml")
        .map_err(|err| format!("DOCX document.xml not found in {}: {}", path.display(), err))?;
    let mut xml = String::new();
    document.read_to_string(&mut xml).map_err(|err| err.to_string())?;

    let mut reader = XmlReader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut text = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Text(event)) => {
                let value = reader
                    .decoder()
                    .decode(event.as_ref())
                    .map_err(|err| err.to_string())?;
                text.push_str(&value);
                text.push(' ');
            }
            Ok(Event::End(event)) => {
                let name = event.name();
                if name.as_ref() == b"w:p" || name.as_ref() == b"w:br" {
                    text.push('\n');
                }
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(err.to_string()),
            _ => {}
        }
    }

    Ok(limit_text(text, 200_000))
}

fn read_excel_text(path: &Path) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|err| format!("Excel extraction failed for {}: {}", path.display(), err))?;
    let mut text = String::new();

    for sheet_name in workbook.sheet_names().to_owned() {
        match workbook.worksheet_range(&sheet_name) {
            Ok(range) => {
                text.push_str("\n# Sheet: ");
                text.push_str(&sheet_name);
                text.push('\n');
                for row in range.rows() {
                    let values: Vec<String> = row
                        .iter()
                        .map(|cell| cell.to_string())
                        .filter(|value| !value.trim().is_empty())
                        .collect();
                    if !values.is_empty() {
                        text.push_str(&values.join("\t"));
                        text.push('\n');
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Ok(limit_text(text, 200_000))
}

fn limit_text(text: String, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn make_concept_prompt(text: &str) -> String {
    let clipped: String = text.chars().take(12000).collect();
    format!(
        r#"Extract meaningful concepts and noun phrases from the text for a text network graph.

Rules:
- Remove function words, filler words, vague verbs, and generic terms.
- Keep domain concepts, methods, objects, actors, metrics, problems, and important phrases.
- Preserve repeated concepts when they appear repeatedly, because frequency matters for graph construction.
- Merge obvious aliases into one canonical phrase.
- Use the original language of the concept.
- Return JSON only, with this exact shape: {{"concepts":["concept one","concept two"]}}.
- Include no explanations.

Text:
---
{}
---"#,
        clipped
    )
}

async fn extract_with_ollama(
    prompt: &str,
    settings: &ModelSettings,
) -> Result<ConceptExtractionResult, String> {
    let url = format!("{}/api/chat", trim_slash(&settings.base_url));
    let client = reqwest::Client::new();
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
    let client = reqwest::Client::new();
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
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("{} returned {}", settings.provider, response.status()));
    }

    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let content = data["choices"][0]["message"]["content"].as_str().unwrap_or("");
    Ok(ConceptExtractionResult {
        concepts: parse_concepts(content)?,
        provider_used: format!("{}:{}", settings.provider, settings.model),
    })
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
    let client = reqwest::Client::new();
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
        .map_err(|err| err.to_string())?;

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

fn parse_concepts(content: &str) -> Result<Vec<String>, String> {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let data: Value = serde_json::from_str(cleaned).map_err(|err| err.to_string())?;
    let concepts = if data.is_array() {
        data.as_array()
    } else {
        data["concepts"].as_array()
    }
    .ok_or_else(|| "Model response did not include concepts[]".to_string())?;

    Ok(concepts
        .iter()
        .filter_map(|value| value.as_str())
        .map(str::trim)
        .filter(|value| value.chars().count() >= 2)
        .take(3000)
        .map(String::from)
        .collect())
}

fn trim_slash(value: &str) -> &str {
    value.trim_end_matches('/')
}
