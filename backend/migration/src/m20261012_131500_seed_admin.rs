use sea_orm_migration::prelude::*;

/// Seeds a default admin (`admin@example.com` / `Admin123!`, role `admin`).
/// Runs via auto-migrate against the Turso file, so a fresh boot always has
/// an admin to mint materials/quotes with. Re-login after any role change:
/// the JWT `role` claim is frozen at login time.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        let password =
            loco_rs::hash::hash_password("Admin123!").map_err(|e| DbErr::Custom(e.to_string()))?;
        // Quote-escape the argon2 hash (it contains `$` but no single quotes; be safe anyway).
        let password = password.replace('\'', "''");
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        conn.execute_unprepared(&format!(
            "INSERT INTO users (created_at, updated_at, pid, email, password, api_key, name, role) \
             SELECT '{now}', '{now}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', \
             '{password}', 'lo-admin-seed-key', 'admin', 'admin' \
             WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com')"
        ))
        .await?;
        conn.execute_unprepared(
            "UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'",
        )
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared("DELETE FROM users WHERE email = 'admin@example.com'")
            .await?;
        Ok(())
    }
}
