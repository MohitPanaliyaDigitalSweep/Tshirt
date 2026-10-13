use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(
            m,
            "assets",
            &[
                ("id", ColType::PkAuto),
                ("order_id", ColType::BigIntegerNull),
                ("zone", ColType::StringNull),
                ("file_url", ColType::StringNull),
                ("file_type", ColType::StringNull),
                ("transform", ColType::JsonNull),
            ],
            &[],
        )
        .await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "assets").await
    }
}
