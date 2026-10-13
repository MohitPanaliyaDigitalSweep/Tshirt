use loco_rs::{controller::extractor::auth, prelude::*};

/// Role comes from the JWT `role` claim minted at login
/// (`admin|customer`). Missing/nullable role is treated as `customer`.
pub fn role(auth: &auth::JWT) -> &str {
    auth.claims
        .claims
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("customer")
}

#[must_use]
pub fn is_admin(auth: &auth::JWT) -> bool {
    role(auth) == "admin"
}

pub fn forbidden() -> Result<Response> {
    Ok((
        axum::http::StatusCode::FORBIDDEN,
        Json(serde_json::json!({ "error": "forbidden" })),
    )
        .into_response())
}

pub fn unprocessable(msg: &str) -> Result<Response> {
    Ok((
        axum::http::StatusCode::UNPROCESSABLE_ENTITY,
        Json(serde_json::json!({ "error": msg })),
    )
        .into_response())
}

/// Authenticated user row for the JWT pid.
pub async fn current_user(
    db: &DatabaseConnection,
    auth: &auth::JWT,
) -> Result<crate::models::_entities::users::Model> {
    crate::models::users::Model::find_by_pid(db, &auth.claims.pid)
        .await
        .map_err(|_| loco_rs::errors::Error::Unauthorized("unauthorized".to_string()))
}
