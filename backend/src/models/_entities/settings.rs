//! `SeaORM` Entity for the global shop settings store.
//!
//! One row per key; `key` is the primary key (implies UNIQUE per the
//! migration). `value` is free-form TEXT, `updated_at` tracks the last
//! admin write. See [`crate::models::settings`] for defaults/validation.

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "settings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub key: String,
    #[sea_orm(column_type = "Text")]
    pub value: String,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
