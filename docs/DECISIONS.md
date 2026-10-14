# DECISIONS — tshirt-studio

- 2026-10-12: Loco (not raw Axum) for speed — Axum inside, SaaS auth + scaffolds free.
- 2026-10-12: Turso via file sync, not SeaORM→remote — sqlx-sqlite needs local file.
- 2026-10-12: Files to R2/S3 via Loco Storage; Turso holds URLs + transforms only.
- 2026-10-12: Single Vite PWA, role-routed (`/` customer, `/admin` admin), not two apps.
- 2026-10-14 (R-059): Sleeve prints use cylindrical projection around the sleeve axis (theta wrap + radial normal gating) instead of ortho ±x — wraps convincingly on curvy fabric. Feather ~2-3px texture-space; alpha-0 texels skipped explicitly. Print stays diffuse-before-lighting (no emissive).
- 2026-10-14 (R-059): Admin is a standalone backoffice shell (own sidebar/topbar, no customer components except ui kit + api client); Clients aggregates from admin orders list (no new endpoint).
