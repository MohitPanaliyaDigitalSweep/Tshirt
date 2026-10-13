use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(
            m,
            "orders",
            &[
                ("id", ColType::PkAuto),
                ("customer_id", ColType::BigIntegerNull),
                ("material_id", ColType::BigIntegerNull),
                ("color", ColType::StringNull),
                ("sizes", ColType::TextNull),
                ("qty_total", ColType::BigIntegerNull),
                ("status", ColType::StringNull),
                ("customer_note", ColType::TextNull),
                ("quote_price", ColType::BigIntegerNull),
                ("admin_note", ColType::TextNull),
                ("design_snapshot", ColType::JsonNull),
            ],
            &[],
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "orders").await
    }
}
