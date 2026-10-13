use loco_rs::prelude::*;

async fn health() -> Result<Response> {
    format::json(serde_json::json!({ "status": "ok" }))
}

pub fn routes() -> Routes {
    Routes::new().add("/healthz", get(health))
}
