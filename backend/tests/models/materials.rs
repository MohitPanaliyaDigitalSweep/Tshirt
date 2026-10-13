use loco_rs::testing::prelude::*;
use sea_orm::EntityTrait;
use serial_test::serial;
use tshirt_backend::{app::App, models::_entities::materials};

macro_rules! configure_insta {
    ($($expr:expr),*) => {
        let mut settings = insta::Settings::clone_current();
        settings.set_prepend_module_to_snapshot(false);
        let _guard = settings.bind_to_scope();
    };
}

/// The `Materials` entity matches the table its migration created.
///
/// Selecting every column is the cheapest assertion that says something true:
/// it fails if the migration and the entity disagree — a renamed column, a
/// type that does not round-trip, a migration that never ran — which is the
/// most common way a generated model breaks. Extend it as the model grows.
#[tokio::test]
#[serial]
async fn can_query_materials() {
    configure_insta!();

    let boot = boot_test::<App>().await.unwrap();
    seed::<App>(&boot.app_context).await.unwrap();

    // The query is the assertion. Bind the result and compare it once you have
    // seed data to compare against, e.g.:
    //
    // let items = materials::Entity::find().all(&boot.app_context.db).await.unwrap();
    // assert_debug_snapshot!(items);
    materials::Entity::find()
        .all(&boot.app_context.db)
        .await
        .expect("`materials` should be queryable — entity and migration must agree");
}
