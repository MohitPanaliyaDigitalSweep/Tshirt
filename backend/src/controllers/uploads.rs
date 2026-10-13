use axum::extract::Multipart;
use loco_rs::prelude::*;

const MAX_BYTES: usize = 10 * 1024 * 1024;

fn classify(content_type: Option<&str>, filename: &str) -> Option<(&'static str, &'static str)> {
    let ct = content_type.unwrap_or("").to_lowercase();
    if ct.contains("image/png") || filename.ends_with(".png") && ct.is_empty() {
        return Some(("png", "image/png"));
    }
    if ct.contains("image/jpeg") {
        let ext = if filename.ends_with(".jpeg") {
            "jpeg"
        } else {
            "jpg"
        };
        return Some((ext, "image/jpeg"));
    }
    if ct.contains("image/svg") || ct.contains("svg") {
        return Some(("svg", "image/svg+xml"));
    }
    if ct.contains("image/webp") {
        return Some(("webp", "image/webp"));
    }
    // Fall back to extension when the client omits content-type.
    if ct.is_empty() || ct.contains("octet-stream") {
        if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
            return Some(("jpg", "image/jpeg"));
        }
        if filename.ends_with(".webp") {
            return Some(("webp", "image/webp"));
        }
        if filename.ends_with(".svg") {
            return Some(("svg", "image/svg+xml"));
        }
    }
    None
}

/// POST /api/uploads (auth required). Stores via Loco Storage on local disk
/// (`STORAGE_PATH`, default `data/uploads`), served back at the returned URL.
async fn upload(
    _auth: auth::JWT,
    State(ctx): State<AppContext>,
    mut multipart: Multipart,
) -> Result<Response> {
    let mut saved: Option<serde_json::Value> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| loco_rs::errors::Error::BadRequest(e.to_string()))?
    {
        let filename = field.file_name().unwrap_or("file").to_lowercase();
        let content_type = field.content_type().map(|s| s.to_string());
        let Some((ext, file_type)) = classify(content_type.as_deref(), &filename) else {
            return bad_request("only png, jpeg, svg, webp are accepted");
        };
        let bytes = field
            .bytes()
            .await
            .map_err(|e| loco_rs::errors::Error::BadRequest(e.to_string()))?;
        if bytes.len() > MAX_BYTES {
            return bad_request("file exceeds 10MB");
        }
        if ext == "svg" {
            let text = String::from_utf8_lossy(&bytes).to_lowercase();
            if text.contains("<script") {
                return bad_request("svg must not contain scripts");
            }
        }
        let key = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        ctx.storage
            .upload(std::path::Path::new(&key), &bytes)
            .await
            .map_err(|e| loco_rs::errors::Error::Message(e.to_string()))?;
        saved = Some(serde_json::json!({
            "url": format!("/api/uploads/{key}"),
            "file_type": file_type,
            "size": bytes.len(),
        }));
    }
    match saved {
        Some(v) => format::json(v),
        None => bad_request("no file field in multipart body"),
    }
}

fn mime_for(filename: &str) -> &'static str {
    if filename.ends_with(".png") {
        "image/png"
    } else if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
        "image/jpeg"
    } else if filename.ends_with(".svg") {
        "image/svg+xml"
    } else if filename.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

/// GET /api/uploads/:filename — public, no auth.
async fn serve(State(ctx): State<AppContext>, Path(filename): Path<String>) -> Result<Response> {
    if filename.contains('/')
        || filename.contains('\\')
        || filename.contains("..")
        || filename.is_empty()
    {
        return bad_request("invalid filename");
    }
    let data: Vec<u8> = ctx
        .storage
        .download(std::path::Path::new(&filename))
        .await
        .map_err(|_| loco_rs::errors::Error::NotFound)?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, mime_for(&filename))],
        data,
    )
        .into_response())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/uploads")
        .add("/", post(upload))
        .add("/{filename}", get(serve))
}
