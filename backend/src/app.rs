use async_trait::async_trait;
use loco_rs::{
    app::{AppContext, Hooks, Initializer},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    db::{self, truncate_table},
    environment::Environment,
    storage::{drivers::local, Storage},
    task::Tasks,
    Result,
};
use migration::Migrator;
use sea_orm::{Database, DatabaseConnection, DbBackend, ProxyDatabaseTrait};
use std::{path::Path, sync::Arc};

use crate::turso_proxy::TursoProxy;

#[allow(unused_imports)]
use crate::{controllers, models::_entities::users, tasks, workers::downloader::DownloadWorker};

/// Holds the synced Turso handle when `TURSO_DATABASE_URL`+`TURSO_AUTH_TOKEN`
/// are set, so `before_run` (which executes after auto-migrate) can push.
static SYNC_DB: std::sync::OnceLock<turso::sync::Database> = std::sync::OnceLock::new();

fn turso_file() -> String {
    std::env::var("TURSO_FILE").unwrap_or_else(|_| "data/app.db".to_string())
}

fn storage_path() -> String {
    std::env::var("STORAGE_PATH").unwrap_or_else(|_| "data/uploads".to_string())
}

fn err(msg: String) -> loco_rs::errors::Error {
    loco_rs::errors::Error::Message(msg)
}

pub struct App;
#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_CRATE_NAME")
    }

    fn app_version() -> String {
        format!(
            "{} ({})",
            env!("CARGO_PKG_VERSION"),
            option_env!("BUILD_SHA")
                .or(option_env!("GITHUB_SHA"))
                .unwrap_or("dev")
        )
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        create_app::<Self, Migrator>(mode, environment, config).await
    }

    async fn initializers(_ctx: &AppContext) -> Result<Vec<Box<dyn Initializer>>> {
        Ok(vec![])
    }

    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::with_default_routes() // controller routes below
            .add_route(controllers::health::routes())
            .add_route(controllers::auth::routes())
            .add_route(controllers::auth::profile_routes())
            .add_route(controllers::settings::routes())
            .add_route(controllers::settings::admin_routes())
            .add_route(controllers::materials::routes())
            .add_route(controllers::orders::routes())
            .add_route(controllers::orders::admin_routes())
            .add_route(controllers::assets::routes())
            .add_route(controllers::assets::asset_routes())
            .add_route(controllers::uploads::routes())
            // SPA static serving LAST: Axum matches static `/api/*` + `/healthz`
            // before the `/{*path}` wildcard, so API keeps priority and any
            // other GET falls back to `frontend/dist/index.html`.
            .add_route(controllers::frontend::routes())
    }

    /// Swap Loco's default sqlx pool for Turso *before* auto-migrate runs.
    ///
    /// Boot order in `loco_rs::boot::create_app` is
    /// `create_context` (which calls this hook) **then** `db::converge`
    /// (auto-migrate), so the `Migrator` runs against the Turso file with
    /// `auto_migrate: true` untouched.
    ///
    /// The Turso engine is fronted by [`TursoProxy`], a schema-aware
    /// [`ProxyDatabaseTrait`] impl over `turso::Connection`, exposed to
    /// SeaORM as `DatabaseConnection::Proxy`. (`sea-orm-turso`'s converter
    /// degrades every TEXT column to `Value::String`, which cannot
    /// materialize chrono/uuid/json entity fields, so it is not used for
    /// reads.)
    async fn after_context(mut ctx: AppContext) -> Result<AppContext> {
        let file = turso_file();
        if let Some(parent) = Path::new(&file).parent() {
            if !parent.as_os_str().is_empty() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| err(e.to_string()))?;
            }
        }

        let conn = match (
            std::env::var("TURSO_DATABASE_URL"),
            std::env::var("TURSO_AUTH_TOKEN"),
        ) {
            (Ok(url), Ok(token)) => {
                tracing::info!(file = %file, "turso sync mode: pulling from remote");
                let sync_db = turso::sync::Builder::new_remote(&file)
                    .with_remote_url(url)
                    .with_auth_token(token)
                    .build()
                    .await
                    .map_err(|e| err(e.to_string()))?;
                match sync_db.pull().await {
                    Ok(changed) => {
                        tracing::info!(changed, "turso pull complete on boot")
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "turso pull failed, continuing with local copy")
                    }
                }
                let conn = sync_db.connect().await.map_err(|e| err(e.to_string()))?;
                let _ = SYNC_DB.set(sync_db);
                // Push every 60s so runtime writes also reach Turso Cloud.
                tokio::spawn(async {
                    let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
                    loop {
                        tick.tick().await;
                        if let Some(db) = SYNC_DB.get() {
                            if let Err(e) = db.push().await {
                                tracing::warn!(error = %e, "periodic turso push failed");
                            } else {
                                tracing::debug!("periodic turso push complete");
                            }
                        } else {
                            break;
                        }
                    }
                });
                conn
            }
            _ => {
                tracing::info!(file = %file, "turso local mode (set TURSO_DATABASE_URL+TURSO_AUTH_TOKEN for sync)");
                turso::Builder::new_local(&file)
                    .build()
                    .await
                    .map_err(|e| err(e.to_string()))?
                    .connect()
                    .map_err(|e| err(e.to_string()))?
            }
        };

        let proxy: Box<dyn ProxyDatabaseTrait> = Box::new(TursoProxy::new(conn));
        let db: DatabaseConnection = Database::connect_proxy(DbBackend::Sqlite, Arc::new(proxy))
            .await
            .map_err(|e| err(e.to_string()))?;
        ctx.db = db;

        let spath = storage_path();
        tokio::fs::create_dir_all(&spath)
            .await
            .map_err(|e| err(e.to_string()))?;
        let driver = local::new_with_prefix(&spath).map_err(|e| err(e.to_string()))?;
        ctx.storage = Arc::new(Storage::single(driver));

        Ok(ctx)
    }

    /// Runs after auto-migrate, before serving: push local writes (migrations,
    /// seeds) to Turso Cloud when in sync mode.
    async fn before_run(_ctx: &AppContext) -> Result<()> {
        if let Some(sync_db) = SYNC_DB.get() {
            match sync_db.push().await {
                Ok(()) => tracing::info!("turso push complete after boot"),
                Err(e) => tracing::warn!(error = %e, "turso push failed after boot"),
            }
        }
        Ok(())
    }

    async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
        queue.register(DownloadWorker::build(ctx)).await?;
        Ok(())
    }

    #[allow(unused_variables)]
    fn register_tasks(tasks: &mut Tasks) {
        // tasks-inject (do not remove)
        tasks.register(tasks::user_create::UserCreate);
        tasks.register(tasks::user_delete::UserDelete);
    }
    async fn truncate(ctx: &AppContext) -> Result<()> {
        truncate_table(&ctx.db, users::Entity).await?;
        Ok(())
    }
    async fn seed(ctx: &AppContext, base: &Path) -> Result<()> {
        db::seed::<users::ActiveModel>(&ctx.db, &base.join("users.yaml").display().to_string())
            .await?;
        Ok(())
    }
}
