use crate::models::_entities::materials::{self, ActiveModel, Entity};
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait};
use serde::{Deserialize, Serialize};

use super::authz;

#[derive(Debug, Deserialize, Serialize)]
pub struct MaterialParams {
    pub name: Option<String>,
    pub description: Option<String>,
    pub base_price: Option<i64>,
    pub colors: Option<serde_json::Value>,
    pub sizes: Option<serde_json::Value>,
}

fn apply_params(am: ActiveModel, p: MaterialParams) -> ActiveModel {
    let mut am = am;
    if let Some(v) = p.name {
        am.name = Set(Some(v));
    }
    if let Some(v) = p.description {
        am.description = Set(Some(v));
    }
    if let Some(v) = p.base_price {
        am.base_price = Set(Some(v));
    }
    if let Some(v) = p.colors {
        am.colors = Set(Some(v));
    }
    if let Some(v) = p.sizes {
        am.sizes = Set(Some(v));
    }
    am
}

async fn list(State(_ctx): State<AppContext>) -> Result<Response> {
    let items = Entity::find().all(&_ctx.db).await?;
    format::json(items)
}

async fn get_one(State(ctx): State<AppContext>, Path(id): Path<i64>) -> Result<Response> {
    let Some(item) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    format::json(item)
}

async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Json(params): Json<MaterialParams>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let am = apply_params(ActiveModel::new(), params);
    let item: materials::Model = am.insert(&ctx.db).await?;
    format::json(item)
}

async fn update(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
    Json(params): Json<MaterialParams>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(existing) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    let am = apply_params(existing.into_active_model(), params);
    let item: materials::Model = am.update(&ctx.db).await?;
    format::json(item)
}

async fn destroy(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(existing) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    existing.delete(&ctx.db).await?;
    format::empty_json()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/materials")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", patch(update))
        .add("/{id}", delete(destroy))
}
