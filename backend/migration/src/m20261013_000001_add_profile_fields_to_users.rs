use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

/// Adds nullable customer profile fields to `users`.
///
/// NOTE: intentionally raw SQL with NO nullability keyword. Loco's
/// `ColType::StringNull` emits `VARCHAR NULL`, and Turso ≤0.7 parses a
/// bare `NULL` as `NotNull { nullable: true }` but its ALTER TABLE path
/// (`Column::try_from`) ignores the flag and marks the column NOT NULL
/// (CREATE TABLE handles it correctly). Omitting the keyword keeps the
/// SQLite default: nullable. Same pattern as `add_role_to_users`.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "phone" VARCHAR"#)
            .await?;
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "company" VARCHAR"#)
            .await?;
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "address" VARCHAR"#)
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        remove_column(m, "users", "phone").await?;
        remove_column(m, "users", "company").await?;
        remove_column(m, "users", "address").await?;
        Ok(())
    }
}
