# tshirt-studio — AGENTS.md

3D T-shirt quote studio: customer PWA designer + admin dashboard, Rust (Loco) API, Turso-synced SQLite.

## Layout
- `backend/` — Loco (Axum + SeaORM) API, SQLite file synced to Turso Cloud. SaaS auth template.
- `frontend/` — Vite + React + TS + React-Three-Fiber PWA (customer `/`, admin `/admin`).
- `docs/` — REQUIREMENTS.md / STATUS.md / DECISIONS.md / CHANGELOG.md (update same turn as code).

## Commands
- Backend: `cargo loco start` (dev), `cargo test`, `cargo fmt`, `cargo clippy`
- Frontend: `npm install`, `npm run dev`, `npm run build`, `npm run preview`
- DB sync: `turso db ...` / local `app.db` push-pull (see docs/STATUS.md)

## Conventions
- API base `/api`; JWT Bearer; `role: admin|customer` gate on `/api/admin/*`.
- Uploads (png/jpeg/svg ≤10MB) → R2/S3 via Loco Storage; DB stores URL + zone + transform JSON only.
- Design zones: `front|back|sleeve_left|sleeve_right`. SVG rasterized client-side for Three.js texture; original kept for print.
- Order status: `draft → quote_requested → quoted → confirmed → done | cancelled`.
- PWA: app-shell cached, drafts in IndexedDB; submit/quote requires online.
- Never commit secrets (`.env`, tokens). Turso URL/token via env only.

## Gotchas
- SeaORM sqlite driver needs a LOCAL file — never point it at `libsql://` remote. Sync file to Turso separately.
- Three.js canvas needs `preserveDrawingBuffer:true` for PNG thumbnails; `captureStream+MediaRecorder` for video (later).
- Sleeve decals need UV anchors — same GLTF reused in admin read-only viewer.
