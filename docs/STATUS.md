# STATUS — tshirt-studio

**Goal:** Customer 3D quote PWA + admin dashboard, Loco API, Turso-synced DB.
**State:** LIVE https://tshirt.brightive.shop (2026-10-26) — kinpaku dark design, garment editors, baked 3D print, admin backoffice.

## Live features (verified 2026-10-26)
- Kinpaku dark design system + oak/matte interior viewer scene (Interior.tsx).
- Garment-shaped flat editors with Logo/Strip presets, crop/rotate/resize/align (RLTB center snap)/keyboard nudge, layer list, lock/visibility.
- 3D print baked into fabric via projective mapping: front/back ortho; sleeves cylindrical on outer arm |x| 0.18–0.27 — verified via orbit screenshots.
- Account menu (no standalone login/logout buttons); profile gate (name/phone/address/city) before save/quote with ?next= return.
- PWA install on Android/Windows/iOS (banner, account-menu entry, iOS Share guide; PNG icons).
- Admin standalone backoffice: sidebar (Orders/Materials/Assets/Clients/Settings), sort/search, assets gallery, client aggregation.
- Order flow enforced: done from confirmed only; admin cancel from quote_requested/quoted/confirmed; customer cancel from draft/quote_requested.
- Settings save fixed: per-key {key,value} PUT upserts with verbatim 422 collection.
- COLLARED wind is global-only (designer slider removed).

## GitHub / codespace
- Repo github.com/MohitPanaliyaDigitalSweep/Tshirt, main tip `038282b`.
- Admin credentials: admin@brightive.shop / Mohit8866
- Local SQLite DB (data/app.db) with all migrations applied.

## Done (Latest Session 2026-10-26)
- Hoodie/Cap 3D model support: modelType prop ('shirt' | 'hoodie' | 'cap') with GLB model loading
- Product preset prices: tshirt_preset_price (₹25), hoodie_preset_price (₹40), cap_preset_price (₹15)
- Quote request flow: POST /api/orders/{id}/request-quote endpoint, status transition draft → quote_requested → quoted → confirmed → done
- Design export/snapshot: POST /api/orders/{id}/export-design endpoint
- Login fix: Argon2 hash corrected for loco-rs compatibility
- Full quote flow tested end-to-end on production: draft → quote_requested → quoted → confirmed → done ✅
- Deployment #50 completed successfully on Temps

## Next
- Text tool (codespace, R-056 remainder).
- Snapshot schema v2 + v1 migration (codespace, R-056 remainder).

## Reminders / Open
- DB is ephemeral on Temps redeploys (re-seeded).
- Clients tab shows "—" for contact details (known gap).
- Caddy route is in-memory — re-apply cmd in CHANGELOG (docs/tshirt-route.json).

## Key paths
`backend/`, `frontend/`, `frontend/src/components/Interior.tsx`, `.devcontainer/`, `docs/CODESPACE-PLAYBOOK.md`, `docs/CODESPACE-TODO.md`.

## Commands
Backend `cargo loco start`; frontend `npm run dev`, `npm run build`; deploy via Temps (see CHANGELOG).

## Constraints
One machine + one codespace (codespace opencode owns R-056 remainder); SeaORM→local sqlite file only; secrets in env.
