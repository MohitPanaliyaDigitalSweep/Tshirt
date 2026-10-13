use crate::models::_entities::{
    assets::{self, ActiveModel, Entity},
    orders,
};
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};

use super::authz;
use super::authz::current_user;

#[derive(Debug, Deserialize, Serialize)]
pub struct AssetParams {
    pub zone: Option<String>,
    pub file_url: Option<String>,
    pub file_type: Option<String>,
    pub transform: Option<serde_json::Value>,
}

/// Parent order iff the caller may access it (admin: all; customer: own).
async fn accessible_order(
    ctx: &AppContext,
    auth: &auth::JWT,
    order_id: i64,
) -> Result<Option<orders::Model>> {
    let Some(order) = orders::Entity::find_by_id(order_id).one(&ctx.db).await? else {
        return Ok(None);
    };
    if authz::is_admin(auth) {
        return Ok(Some(order));
    }
    let me = current_user(&ctx.db, auth).await?;
    if order.customer_id == Some(me.id) {
        Ok(Some(order))
    } else {
        Ok(None)
    }
}

async fn visible_asset(
    ctx: &AppContext,
    auth: &auth::JWT,
    id: i64,
) -> Result<Option<assets::Model>> {
    let Some(asset) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return Ok(None);
    };
    match asset.order_id {
        Some(oid) => match accessible_order(ctx, auth, oid).await? {
            Some(_) => Ok(Some(asset)),
            None => Ok(None),
        },
        None => {
            if authz::is_admin(auth) {
                Ok(Some(asset))
            } else {
                Ok(None)
            }
        }
    }
}

async fn list_for_order(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(order_id): Path<i64>,
) -> Result<Response> {
    if accessible_order(&ctx, &auth, order_id).await?.is_none() {
        return not_found();
    }
    let items = Entity::find()
        .filter(assets::Column::OrderId.eq(order_id))
        .all(&ctx.db)
        .await?;
    format::json(items)
}

async fn create_for_order(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(order_id): Path<i64>,
    Json(params): Json<AssetParams>,
) -> Result<Response> {
    if accessible_order(&ctx, &auth, order_id).await?.is_none() {
        return not_found();
    }
    let mut am = ActiveModel::new();
    am.order_id = Set(Some(order_id));
    if let Some(v) = params.zone {
        am.zone = Set(Some(v));
    }
    if let Some(v) = params.file_url {
        am.file_url = Set(Some(v));
    }
    if let Some(v) = params.file_type {
        am.file_type = Set(Some(v));
    }
    if let Some(v) = params.transform {
        am.transform = Set(Some(v));
    }
    let item: assets::Model = am.insert(&ctx.db).await?;
    format::json(item)
}

async fn get_one(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    match visible_asset(&ctx, &auth, id).await? {
        Some(a) => format::json(a),
        None => not_found(),
    }
}

async fn update(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
    Json(params): Json<AssetParams>,
) -> Result<Response> {
    let Some(asset) = visible_asset(&ctx, &auth, id).await? else {
        return not_found();
    };
    let mut am = asset.into_active_model();
    if let Some(v) = params.zone {
        am.zone = Set(Some(v));
    }
    if let Some(v) = params.file_url {
        am.file_url = Set(Some(v));
    }
    if let Some(v) = params.file_type {
        am.file_type = Set(Some(v));
    }
    if let Some(v) = params.transform {
        am.transform = Set(Some(v));
    }
    let item: assets::Model = am.update(&ctx.db).await?;
    format::json(item)
}

async fn destroy(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(asset) = visible_asset(&ctx, &auth, id).await? else {
        return not_found();
    };
    asset.delete(&ctx.db).await?;
    format::empty_json()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/orders")
        .add("/{id}/assets", get(list_for_order))
        .add("/{id}/assets", post(create_for_order))
}

pub fn asset_routes() -> Routes {
    Routes::new()
        .prefix("/api/assets")
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", patch(update))
        .add("/{id}", delete(destroy))
}
