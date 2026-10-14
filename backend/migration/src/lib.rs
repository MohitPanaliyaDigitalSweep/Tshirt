#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20220101_000001_users;

mod m20261012_125021_materials;
mod m20261012_125439_orders;
mod m20261012_125825_assets;
mod m20261012_130058_add_role_to_users;
mod m20261012_131500_seed_admin;
mod m20261013_000001_add_profile_fields_to_users;
mod m20261013_000002_settings;
mod m20261014_000001_add_address_fields_to_users;
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_users::Migration),
            Box::new(m20261012_125021_materials::Migration),
            Box::new(m20261012_125439_orders::Migration),
            Box::new(m20261012_125825_assets::Migration),
            Box::new(m20261012_130058_add_role_to_users::Migration),
            Box::new(m20261012_131500_seed_admin::Migration),
            Box::new(m20261013_000001_add_profile_fields_to_users::Migration),
            Box::new(m20261013_000002_settings::Migration),
            Box::new(m20261014_000001_add_address_fields_to_users::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
