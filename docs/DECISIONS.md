# DECISIONS — tshirt-studio

- 2026-10-13: OrderParams.sizes as Option<Value> (object OR string) over schema migration — frontend already sends object; normalize server-side to canonical string, zero data change.
- 2026-10-13: Procedural interior scene (canvas-gen textures) over external HDRI/assets — no licensing, tiny bundle, matches Impeccable palette.
- 2026-10-13: R-056 delegated to codespace opencode (playbook + todo in docs/) — frees local session; push-after-each-change guards against codespace loss.

- 2026-10-12: Loco (not raw Axum) for speed — Axum inside, SaaS auth + scaffolds free.
- 2026-10-12: Turso via file sync, not SeaORM→remote — sqlx-sqlite needs local file.
- 2026-10-12: Files to R2/S3 via Loco Storage; Turso holds URLs + transforms only.
- 2026-10-12: Single Vite PWA, role-routed (`/` customer, `/admin` admin), not two apps.
