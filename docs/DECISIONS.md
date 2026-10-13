# DECISIONS — tshirt-studio

- 2026-10-12: Loco (not raw Axum) for speed — Axum inside, SaaS auth + scaffolds free.
- 2026-10-12: Turso via file sync, not SeaORM→remote — sqlx-sqlite needs local file.
- 2026-10-12: Files to R2/S3 via Loco Storage; Turso holds URLs + transforms only.
- 2026-10-12: Single Vite PWA, role-routed (`/` customer, `/admin` admin), not two apps.
