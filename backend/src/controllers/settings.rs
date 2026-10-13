use crate::models::settings::{self, ALLOWED_KEYS};
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};

use super::authz;

#[derive(Debug, Deserialize, Serialize)]
pub struct SettingParams {
    pub key: String,
    pub value: serde_json::Value,
}

/// GET /api/settings — public. Returns the full settings object map.
async fn list(State(ctx): State<AppContext>) -> Result<Response> {
    let map = settings::Model::get_map(&ctx.db).await?;
    format::json(map)
}

/// PUT /api/admin/settings — admin only. `{key, value}` upsert with an
/// allowlist of keys and per-key validation (invalid → 422).
async fn upsert(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Json(params): Json<SettingParams>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let key = params.key.trim().to_string();
    if !ALLOWED_KEYS.contains(&key.as_str()) {
        return bad_request(format!("unknown setting key: {key}"));
    }
    let raw = match &params.value {
        serde_json::Value::String(s) => s.clone(),
        v => v.to_string(),
    };
    match settings::Model::upsert_setting(&ctx.db, &key, &raw).await {
        Ok(row) => format::json(serde_json::json!({
            "key": row.key,
            "value": settings::typed_value(&row.key, &row.value),
        })),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("must be") || msg.contains("unknown setting") {
                authz::unprocessable(&msg)
            } else {
                Err(e.into())
            }
        }
    }
}

pub fn routes() -> Routes {
    Routes::new().prefix("/api/settings").add("/", get(list))
}

pub fn admin_routes() -> Routes {
    Routes::new()
        .prefix("/api/admin/settings")
        .add("/", put(upsert))
}
