use crate::models::_entities::orders::{self, ActiveModel, Entity};
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};

use super::authz;
use super::authz::current_user;

pub const STATUS_DRAFT: &str = "draft";
pub const STATUS_QUOTE_REQUESTED: &str = "quote_requested";
pub const STATUS_QUOTED: &str = "quoted";
pub const STATUS_CONFIRMED: &str = "confirmed";
pub const STATUS_DONE: &str = "done";
pub const STATUS_CANCELLED: &str = "cancelled";

#[derive(Debug, Deserialize, Serialize)]
pub struct OrderParams {
    pub material_id: Option<i64>,
    pub color: Option<String>,
    // Accept both a string ("M:10,L:5") and a legacy object {"S":0,"M":10,...};
    // frontend historically sent an object, which serde rejected with 400.
    pub sizes: Option<serde_json::Value>,
    pub qty_total: Option<i64>,
    pub customer_note: Option<String>,
    pub design_snapshot: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct QuoteParams {
    pub quote_price: Option<i64>,
    pub admin_note: Option<String>,
}

fn status_of(o: &orders::Model) -> &str {
    o.status.as_deref().unwrap_or(STATUS_DRAFT)
}

fn apply_params(mut am: ActiveModel, p: OrderParams) -> ActiveModel {
    if let Some(v) = p.material_id {
        am.material_id = Set(Some(v));
    }
    if let Some(v) = p.color {
        am.color = Set(Some(v));
    }
    if let Some(v) = p.sizes {
        let canonical = match &v {
            serde_json::Value::String(s) => Some(s.trim().to_string()),
            serde_json::Value::Object(map) => {
                let mut kv: Vec<(String, i64)> = map
                    .iter()
                    .map(|(k, v2)| (k.to_uppercase(), v2.as_i64().unwrap_or(0)))
                    .filter(|(_, n)| *n > 0)
                    .collect();
                let order = |k: &str| {
                    ["S", "M", "L", "XL", "XXL"]
                        .iter()
                        .position(|s| s == &k)
                        .unwrap_or(99)
                };
                kv.sort_by_key(|(k, _)| order(k));
                Some(
                    kv.iter()
                        .map(|(k, n)| format!("{k}:{n}"))
                        .collect::<Vec<_>>()
                        .join(","),
                )
            }
            serde_json::Value::Number(n) => Some(n.to_string()),
            _ => None,
        };
        if let Some(s) = canonical {
            am.sizes = Set(Some(s));
        }
    }
    if let Some(v) = p.qty_total {
        am.qty_total = Set(Some(v));
    }
    if let Some(v) = p.customer_note {
        am.customer_note = Set(Some(v));
    }
    if let Some(v) = p.design_snapshot {
        am.design_snapshot = Set(Some(v));
    }
    am
}

/// Load an order visible to the caller: admin sees all, customers only own.
async fn visible_order(
    ctx: &AppContext,
    auth: &auth::JWT,
    id: i64,
) -> Result<Option<orders::Model>> {
    let Some(order) = Entity::find_by_id(id).one(&ctx.db).await? else {
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

async fn list(State(ctx): State<AppContext>, auth: auth::JWT) -> Result<Response> {
    if authz::is_admin(&auth) {
        let items = Entity::find().all(&ctx.db).await?;
        return format::json(items);
    }
    let me = current_user(&ctx.db, &auth).await?;
    let items = Entity::find()
        .filter(orders::Column::CustomerId.eq(me.id))
        .all(&ctx.db)
        .await?;
    format::json(items)
}

async fn create(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Json(params): Json<OrderParams>,
) -> Result<Response> {
    let me = current_user(&ctx.db, &auth).await?;
    let mut am = apply_params(ActiveModel::new(), params);
    am.customer_id = Set(Some(me.id));
    am.status = Set(Some(STATUS_DRAFT.to_string()));
    let item: orders::Model = am.insert(&ctx.db).await?;
    format::json(item)
}

async fn get_one(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    match visible_order(&ctx, &auth, id).await? {
        Some(o) => format::json(o),
        None => not_found(),
    }
}

async fn update(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
    Json(params): Json<OrderParams>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    if !authz::is_admin(&auth) {
        match status_of(&order) {
            STATUS_DRAFT | STATUS_QUOTE_REQUESTED => {}
            _ => {
                return authz::unprocessable("order is no longer editable");
            }
        }
    }
    let am = apply_params(order.into_active_model(), params);
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

async fn destroy(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    if !authz::is_admin(&auth) && status_of(&order) != STATUS_DRAFT {
        return authz::unprocessable("only draft orders can be deleted");
    }
    order.delete(&ctx.db).await?;
    format::empty_json()
}

/// POST /api/orders/:id/request-quote — draft -> quote_requested.
async fn request_quote(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    if status_of(&order) != STATUS_DRAFT {
        return authz::unprocessable("only draft orders can request a quote");
    }
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_QUOTE_REQUESTED.to_string()));
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

/// POST /api/orders/:id/confirm — quoted -> confirmed.
async fn confirm(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    if status_of(&order) != STATUS_QUOTED {
        return authz::unprocessable("only quoted orders can be confirmed");
    }
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_CONFIRMED.to_string()));
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

/// POST /api/orders/:id/cancel — customer cancels own order from draft|quote_requested.
async fn cancel(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    match status_of(&order) {
        STATUS_DRAFT | STATUS_QUOTE_REQUESTED => {}
        _ => {
            return authz::unprocessable("only draft or quote-requested orders can be cancelled");
        }
    }
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_CANCELLED.to_string()));
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

/// POST /api/admin/orders/:id/done — confirmed -> done (admin only).
async fn done(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(order) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    if status_of(&order) != STATUS_CONFIRMED {
        return authz::unprocessable("Only confirmed orders can be marked done");
    }
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_DONE.to_string()));
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

/// POST /api/admin/orders/:id/cancel — admin cancels from quote_requested|quoted|confirmed.
async fn admin_cancel(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(order) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    match status_of(&order) {
        STATUS_QUOTE_REQUESTED | STATUS_QUOTED | STATUS_CONFIRMED => {}
        _ => {
            return authz::unprocessable(
                "only quote-requested, quoted or confirmed orders can be cancelled",
            );
        }
    }
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_CANCELLED.to_string()));
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

/// PATCH /api/admin/orders/:id/quote — quote_requested -> quoted (admin only).
async fn quote(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
    Json(params): Json<QuoteParams>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(order) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    if status_of(&order) != STATUS_QUOTE_REQUESTED {
        return authz::unprocessable("only quote-requested orders can be quoted");
    }
    let Some(price) = params.quote_price else {
        return bad_request("quote_price is required");
    };
    let mut am = order.into_active_model();
    am.status = Set(Some(STATUS_QUOTED.to_string()));
    am.quote_price = Set(Some(price));
    if let Some(note) = params.admin_note {
        am.admin_note = Set(Some(note));
    }
    let item: orders::Model = am.update(&ctx.db).await?;
    format::json(item)
}

async fn admin_list(State(ctx): State<AppContext>, auth: auth::JWT) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let items = Entity::find().all(&ctx.db).await?;
    format::json(items)
}

async fn admin_get_one(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    if !authz::is_admin(&auth) {
        return authz::forbidden();
    }
    let Some(order) = Entity::find_by_id(id).one(&ctx.db).await? else {
        return not_found();
    };
    format::json(order)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/orders")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(get_one))
        .add("/{id}", put(update))
        .add("/{id}", patch(update))
        .add("/{id}", delete(destroy))
        .add("/{id}/request-quote", post(request_quote))
        .add("/{id}/confirm", post(confirm))
        .add("/{id}/cancel", post(cancel))
}

pub fn admin_routes() -> Routes {
    Routes::new()
        .prefix("/api/admin/orders")
        .add("/", get(admin_list))
        .add("/{id}", get(admin_get_one))
        .add("/{id}/quote", patch(quote))
        .add("/{id}/done", post(done))
        .add("/{id}/cancel", post(admin_cancel))
}

/// POST /api/orders/:id/export-design — export design snapshot (public).
/// POST /api/orders/:id/export-design — export design snapshot (public).
async fn export_design(
    auth: auth::JWT,
    State(ctx): State<AppContext>,
    Path(id): Path<i64>,
) -> Result<Response> {
    let Some(order) = visible_order(&ctx, &auth, id).await? else {
        return not_found();
    };
    let snapshot = order.design_snapshot.clone().unwrap_or_default();
    // Manually construct JSON response
    let response = serde_json::json!({
        "success": true,
        "snapshot": snapshot,
    });
    format::json(response)
}
