use sea_orm_migration::prelude::*;

/// Global shop settings store: one row per key.
///
/// `key` is the primary key (implies UNIQUE), `value` is free-form TEXT
/// (numbers stored in canonical string form, parsed back by the model),
/// `updated_at` tracks the last admin write. Defaults are seeded
/// idempotently so re-running the migration never clobbers admin edits.
#[derive(DeriveMigrationName)]
pub struct Migration;

const DEFAULTS: &[(&str, &str)] = &[
    ("fabric_wind", "0.35"),
    ("swing_strength", "1.0"),
    ("autorotate_speed", "1.0"),
    ("max_upload_mb", "10"),
    ("shop_name", "T-Shirt Studio"),
    ("support_email", "support@example.com"),
    ("announcement", ""),
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        conn.execute_unprepared(
            r#"CREATE TABLE IF NOT EXISTS "settings" (
                "key" VARCHAR PRIMARY KEY,
                "value" TEXT NOT NULL DEFAULT '',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"#,
        )
        .await?;
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        for (key, value) in DEFAULTS {
            let value = value.replace('\'', "''");
            conn.execute_unprepared(&format!(
                "INSERT INTO settings (key, value, updated_at) \
                 SELECT '{key}', '{value}', '{now}' \
                 WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = '{key}')"
            ))
            .await?;
        }
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(r#"DROP TABLE IF EXISTS "settings""#)
            .await?;
        Ok(())
    }
}
