use loco_rs::prelude::*;
use std::path::{Component, PathBuf};

/// Directory holding the built Vite PWA (`frontend/dist`).
/// Overridable via `FRONTEND_DIST`; defaults to `frontend/dist` relative to
/// the backend process cwd (in the single-container image `WORKDIR /app` that
/// is `/app/frontend/dist`). For local dev (`cwd = backend/`) the sibling
/// `../frontend/dist` is accepted as a fallback when the default is absent.
fn frontend_dist() -> PathBuf {
    if let Ok(v) = std::env::var("FRONTEND_DIST") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    let primary = PathBuf::from("frontend/dist");
    if primary.is_dir() {
        return primary;
    }
    let sibling = PathBuf::from("../frontend/dist");
    if sibling.is_dir() {
        return sibling;
    }
    primary
}

fn mime_for(name: &str) -> &'static str {
    if name.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if name.ends_with(".js") || name.ends_with(".mjs") {
        "text/javascript; charset=utf-8"
    } else if name.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if name.ends_with(".json") || name.ends_with(".webmanifest") {
        "application/json"
    } else if name.ends_with(".map") {
        "application/json"
    } else if name.ends_with(".svg") {
        "image/svg+xml"
    } else if name.ends_with(".png") {
        "image/png"
    } else if name.ends_with(".jpg") || name.ends_with(".jpeg") {
        "image/jpeg"
    } else if name.ends_with(".webp") {
        "image/webp"
    } else if name.ends_with(".ico") {
        "image/x-icon"
    } else if name.ends_with(".woff2") {
        "font/woff2"
    } else if name.ends_with(".woff") {
        "font/woff"
    } else if name.ends_with(".ttf") {
        "font/ttf"
    } else {
        "application/octet-stream"
    }
}

fn clean_rel(path: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for c in std::path::Path::new(path).components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            // Reject escapes / absolute paths.
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(out)
}

async fn serve_file(path: PathBuf, mime: &'static str) -> Result<Response> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| loco_rs::errors::Error::NotFound)?;
    Ok(([(axum::http::header::CONTENT_TYPE, mime)], bytes).into_response())
}

async fn serve_index() -> Result<Response> {
    let index = frontend_dist().join("index.html");
    if !index.is_file() {
        return Ok((
            axum::http::StatusCode::NOT_FOUND,
            "frontend not built (missing index.html)",
        )
            .into_response());
    }
    serve_file(index, "text/html; charset=utf-8").await
}

/// SPA fallback: serve static files from `FRONTEND_DIST`, else `index.html`.
/// Only reached when no `/api/*` or `/healthz` route matched (registered last),
/// but defensively return 404 for reserved prefixes.
async fn serve_spa(Path(path): Path<String>) -> Result<Response> {
    let first = path.split('/').next().unwrap_or("");
    if first == "api" || path == "healthz" || first == "_ping" || first == "_health" {
        return Err(loco_rs::errors::Error::NotFound);
    }
    let Some(rel) = clean_rel(&path) else {
        return serve_index().await;
    };
    if rel.as_os_str().is_empty() {
        return serve_index().await;
    }
    let full = frontend_dist().join(&rel);
    if full.is_file() {
        let name = rel.to_string_lossy().to_lowercase();
        return serve_file(full, mime_for(&name)).await;
    }
    serve_index().await
}

pub fn routes() -> Routes {
    Routes::new()
        .add("/", get(serve_index))
        .add("/{*path}", get(serve_spa))
}
