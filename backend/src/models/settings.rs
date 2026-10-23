//! Global shop settings: admin-controlled, public-read.
//!
//! One row per key (see the `settings` migration for defaults). Values are
//! stored as TEXT; [`typed_value`] parses the known numeric keys back to
//! JSON numbers for the public `GET /api/settings` map.

use loco_rs::prelude::*;
use serde_json::{Map as JsonMap, Value};
use std::collections::HashMap;

pub use super::_entities::settings::{self, ActiveModel, Entity, Model};

#[async_trait::async_trait]
impl ActiveModelBehavior for super::_entities::settings::ActiveModel {}

/// Keys the admin endpoint accepts. Anything else is rejected with 4xx.
pub const ALLOWED_KEYS: &[&str] = &[
    "fabric_wind",
    "swing_strength",
    "autorotate_speed",
    "max_upload_mb",
    "shop_name",
    "support_email",
    "announcement",
    "tshirt_preset_price",
    "hoodie_preset_price",
    "cap_preset_price",
];

/// Canonical defaults (must match the `settings` migration seed).
pub const DEFAULTS: &[(&str, &str)] = &[
    ("fabric_wind", "0.35"),
    ("swing_strength", "1.0"),
    ("tshirt_preset_price", "25.00"),
    ("hoodie_preset_price", "40.00"),
    ("cap_preset_price", "15.00"),
    ("autorotate_speed", "1.0"),
    ("max_upload_mb", "10"),
    ("shop_name", "T-Shirt Studio"),
    ("support_email", "support@example.com"),
    ("announcement", ""),
];

fn parse_range(value: &str, min: f64, max: f64) -> Option<f64> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v >= min && *v <= max)
}

/// Per-key validation of the raw string value. Returns the normalized
/// (stored) form on success, or a human-readable error on failure.
pub fn validate_setting(key: &str, value: &str) -> Result<String, String> {
    match key {
        "fabric_wind" => parse_range(value, 0.0, 1.0)
            .map(|v| v.to_string())
            .ok_or_else(|| "fabric_wind must be a number in 0..1".to_string()),
        "swing_strength" => parse_range(value, 0.0, 2.0)
            .map(|v| v.to_string())
            .ok_or_else(|| "swing_strength must be a number in 0..2".to_string()),
        "autorotate_speed" => parse_range(value, 0.0, 5.0)
            .map(|v| v.to_string())
            .ok_or_else(|| "autorotate_speed must be a number in 0..5".to_string()),
        "max_upload_mb" => value
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|v| (1..=50).contains(v))
            .map(|v| v.to_string())
            .ok_or_else(|| "max_upload_mb must be an integer in 1..50".to_string()),
        "shop_name" => {
            let v = value.trim();
            if v.is_empty() {
                return Err("shop_name must not be empty".to_string());
            }
            if v.len() > 200 {
                return Err("shop_name must be at most 200 characters".to_string());
            }
            Ok(v.to_string())
        }
        "support_email" => {
            let v = value.trim();
            if !v.contains('@') || v.len() > 320 {
                return Err("support_email must be a valid email address".to_string());
            }
            Ok(v.to_string())
        }
        "announcement" => {
            if value.len() > 2000 {
                return Err("announcement must be at most 2000 characters".to_string());
            }
            Ok(value.to_string())
        }
        _ => Err(format!("unknown setting key: {key}")),
    }
}

/// Render a stored value for the public map: known numeric keys become
/// JSON numbers, everything else stays a string.
pub fn typed_value(key: &str, value: &str) -> Value {
    match key {
        "max_upload_mb" => value
            .parse::<i64>()
            .map(Value::from)
            .unwrap_or_else(|_| Value::String(value.to_string())),
        "fabric_wind" | "swing_strength" | "autorotate_speed" => value
            .parse::<f64>()
            .map(|v| {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .unwrap_or_else(|| Value::String(value.to_string()))
            })
            .unwrap_or_else(|_| Value::String(value.to_string())),
        _ => Value::String(value.to_string()),
    }
}

impl Model {
    /// Public settings map. Starts from compiled defaults so a missing row
    /// (e.g. a pre-settings database whose migration has not run) still
    /// reads, then overlays whatever is stored.
    ///
    /// # Errors
    ///
    /// When the DB query fails
    pub async fn get_map(db: &DatabaseConnection) -> ModelResult<JsonMap<String, Value>> {
        let mut stored: HashMap<String, String> = HashMap::new();
        match Entity::find().all(db).await {
            Ok(rows) => {
                for row in rows {
                    if ALLOWED_KEYS.contains(&row.key.as_str()) {
                        stored.insert(row.key, row.value);
                    }
                }
            }
            Err(e) => {
                // Missing table (migration not yet run): fall back to defaults
                // rather than 500ing the public storefront.
                tracing::debug!(error = %e, "settings table unreadable, serving defaults");
            }
        }
        let mut map = JsonMap::new();
        for (key, default) in DEFAULTS {
            let value = stored.get(*key).map_or(*default, String::as_str);
            map.insert((*key).to_string(), typed_value(key, value));
        }
        Ok(map)
    }

    /// Admin upsert. `raw` is the pre-validation value; it is validated and
    /// normalized by [`validate_setting`] before storage.
    ///
    /// # Errors
    ///
    /// When validation fails or the DB query errors
    pub async fn upsert_setting(
        db: &DatabaseConnection,
        key: &str,
        raw: &str,
    ) -> ModelResult<Self> {
        let normalized = validate_setting(key, raw).map_err(|e| ModelError::msg(e.as_str()))?;
        let now = chrono::Utc::now().fixed_offset();
        let setting = match Entity::find_by_id(key.to_string()).one(db).await? {
            Some(row) => {
                let mut am = row.into_active_model();
                am.value = ActiveValue::set(normalized);
                am.updated_at = ActiveValue::set(now);
                am.update(db).await?
            }
            None => {
                ActiveModel {
                    key: ActiveValue::set(key.to_string()),
                    value: ActiveValue::set(normalized),
                    updated_at: ActiveValue::set(now),
                }
                .insert(db)
                .await?
            }
        };
        Ok(setting)
    }
}
