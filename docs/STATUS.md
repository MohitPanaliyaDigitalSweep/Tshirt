# STATUS — tshirt-studio

**Goal:** Customer 3D quote PWA + admin dashboard, Loco API, Turso-synced DB.
**State:** LIVE https://tshirt.brightive.shop with REAL shirt (2026-10-13, Temps deploy completed in 7s).
**Shirt:** pmndrs MIT `shirt_baked_collapsed.glb` (T_Shirt_male, 10.5k verts) + MeshPhysicalMaterial sheen + vertex-shader swing (hem-weighted spring from camera orbit velocity, wind flutter, idle sway) + GSAP intro. Decals: front/back/sleeves mapped from measured bounds. Proof: headless WebGL screenshot renders rich (1126 colors, 74% content, zero page errors); live bundle index-BOsAXB2u.js + model 200.
**Next:** sleeve-decal visual fine-tune from user feedback; Turso Cloud sync; R2; SMTP; rotate seed admin.
**Key paths:** `backend/`, `frontend/`, `docs/`.
**Commands:** backend `cargo loco start`; frontend `npm run dev`.
**Constraints:** one machine only (no extra codespaces); SeaORM→local sqlite file only; secrets in env.
**Open:** R2 vs S3 bucket choice; Google/OTP auth or password-only; Turso Cloud DB name/token.
