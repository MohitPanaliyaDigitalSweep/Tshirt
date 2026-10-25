use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // Add created_at column (ignore if already exists - idempotent)
        let _ = m.alter_table(
            Table::alter()
                .table("orders")
                .add_column(
                    ColumnDef::new("created_at")
                        .date_time()
                        .null()
                )
                .to_owned(),
        )
        .await;

        // Add updated_at column (ignore if already exists - idempotent)
        let _ = m.alter_table(
            Table::alter()
                .table("orders")
                .add_column(
                    ColumnDef::new("updated_at")
                        .date_time()
                        .null()
                )
                .to_owned(),
        )
        .await;

        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(
            Table::alter()
                .table("orders")
                .drop_column("created_at")
                .drop_column("updated_at")
                .to_owned(),
        )
        .await
    }
}
