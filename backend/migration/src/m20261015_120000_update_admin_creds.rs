use sea_orm_migration::prelude::*;

/// Updates the admin user's email and password to admin@brightive.shop / Mohit8866
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        let password =
            loco_rs::hash::hash_password("Mohit8866").map_err(|e| DbErr::Custom(e.to_string()))?;
        let password = password.replace('\'', "''");
        // Update existing admin user
        conn.execute_unprepared(&format!(
            "UPDATE users SET email = 'admin@brightive.shop', password = '{password}', name = 'admin' \
             WHERE email = 'admin@example.com' OR email = 'admin@brightive.shop'"
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        let conn = m.get_connection();
        let password = loco_rs::hash::hash_password("Admin123!").map_err(|e| DbErr::Custom(e.to_string()))?;
        let password = password.replace('\'', "''");
        conn.execute_unprepared(&format!(
            "UPDATE users SET email = 'admin@example.com', password = '{password}', name = 'admin' \
             WHERE email = 'admin@brightive.shop'"
        ))
        .await?;
        Ok(())
    }
}
