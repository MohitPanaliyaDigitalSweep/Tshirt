# DECISIONS — tshirt-studio

- 2026-10-13: OrderParams.sizes as Option<Value> (object OR string) over schema migration — frontend already sends object; normalize server-side to canonical string, zero data change.
- 2026-10-13: Procedural interior scene (canvas-gen textures) over external HDRI/assets — no licensing, tiny bundle, matches Impeccable palette.
- 2026-10-13: R-056 delegated to codespace opencode (playbook + todo in docs/) — frees local session; push-after-each-change guards against codespace loss.

- 2026-10-12: Loco (not raw Axum) for speed — Axum inside, SaaS auth + scaffolds free.
- 2026-10-12: Turso via file sync, not SeaORM→remote — sqlx-sqlite needs local file.
- 2026-10-12: Files to R2/S3 via Loco Storage; Turso holds URLs + transforms only.
- 2026-10-12: Single Vite PWA, role-routed (`/` customer, `/admin` admin), not two apps.
- 2026-10-14 (R-059): Sleeve prints use cylindrical projection around the sleeve axis (theta wrap + radial normal gating) instead of ortho ±x — wraps convincingly on curvy fabric. Feather ~2-3px texture-space; alpha-0 texels skipped explicitly. Print stays diffuse-before-lighting (no emissive).
- 2026-10-14 (R-059): Admin is a standalone backoffice shell (own sidebar/topbar, no customer components except ui kit + api client); Clients aggregates from admin orders list (no new endpoint).
- 2026-10-14 (R-060): Sleeve L/R follow wearer convention (left=+x, screen-right in front view); the +x projector uses mirrored u so text reads correctly from outside-left, -x unmirrored. Print windowed to outer-top (|theta| feather ~83→100°, radial + N.y underside kill, x-range gates) — print sits on the shoulder-top logo zone, never torso/underside.
- 2026-10-14 (R-060): Profile gate is frontend-only (profileComplete in lib/api.ts, re-exported shape in lib/profile.ts); designer save+quote check first and redirect to /account?next=, account returns to next when complete; admin flows untouched; no backend validation added.
