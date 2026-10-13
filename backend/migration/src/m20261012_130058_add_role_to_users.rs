use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // NOTE: intentionally raw SQL with NO nullability keyword. Loco's
        // `ColType::StringNull` emits `VARCHAR NULL`, and Turso ≤0.7 parses a
        // bare `NULL` as `NotNull { nullable: true }` but its ALTER TABLE path
        // (`Column::try_from`) ignores the flag and marks the column NOT NULL
        // (CREATE TABLE handles it correctly). Omitting the keyword keeps the
        // SQLite default: nullable.
        m.get_connection()
            .execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "role" VARCHAR"#)
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        remove_column(m, "users", "role").await?;
        Ok(())
    }
}
