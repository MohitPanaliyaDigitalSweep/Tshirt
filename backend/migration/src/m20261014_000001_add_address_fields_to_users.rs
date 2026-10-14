use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

/// Adds nullable `city, postal_code, country` VARCHAR to `users`.
///
/// NOTE: intentionally raw SQL with NO nullability keyword (Turso-safe
/// precedent from `add_role_to_users` / `add_profile_fields_to_users`).
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "city" VARCHAR"#)
            .await?;
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "postal_code" VARCHAR"#)
            .await?;
        conn.execute_unprepared(r#"ALTER TABLE "users" ADD COLUMN "country" VARCHAR"#)
            .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        remove_column(m, "users", "city").await?;
        remove_column(m, "users", "postal_code").await?;
        remove_column(m, "users", "country").await?;
        Ok(())
    }
}
