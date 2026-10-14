# STATUS — tshirt-studio

**Goal:** Customer 3D quote PWA + admin dashboard, Loco API, Turso-synced DB.
**State:** LIVE https://tshirt.brightive.shop (2026-10-14) — kinpaku dark design, garment editors, baked 3D print, admin backoffice.

## Live features (verified 2026-10-14)
- Kinpaku dark design system + oak/matte interior viewer scene (Interior.tsx).
- Garment-shaped flat editors with Logo/Strip presets, crop/rotate/resize/align (RLTB center snap)/keyboard nudge, layer list, lock/visibility.
- 3D print baked into fabric via projective mapping: front/back ortho; sleeves cylindrical on outer arm |x| 0.18–0.27 — verified via orbit screenshots; debug paint/proof routes removed.
- Account menu (no standalone login/logout buttons); profile gate (name/phone/address/city) before save/quote with ?next= return.
- PWA install on Android/Windows/iOS (banner, account-menu entry, iOS Share guide; PNG icons).
- Admin standalone backoffice: sidebar (Orders/Materials/Assets/Clients/Settings), sort/search, assets gallery, client aggregation.
- Order flow enforced: done from confirmed only; admin cancel from quote_requested/quoted/confirmed; customer cancel from draft/quote_requested (422s verbatim).
- Settings save fixed: per-key {key,value} PUT upserts with verbatim 422 collection.
- COLLARED wind is global-only (designer slider removed).

## GitHub / codespace
- Repo github.com/MohitPanaliyaDigitalSweep/Tshirt, main tip `c15626f`.
- Codespace loop: ssh alias works; free models — muse-spark had 2 froze runs on R-063 (codespace restarted after ~10 min per user protocol), cat-jam completed, big-pickle completed R-056.

## Done (R-056 / R-059 .. R-063)
- R-056 (codespace): projective print bake (embedded fabric decals), FlatViewEditor with corner presets.
- R-059: done/cancel lifecycle, flat-editor pro tools, cylindrical sleeves v1, profile city/postal/country, admin shell.
- R-060: garment canvases, sleeve Logo/Strip presets, text font-size/scale, account menu, profile gate, wind slider removed.
- R-061: PWA install UX + PNG icons; sleeve projector moved onto arm (vertex-bin proof 0 shoulder, 100% tube).
- R-062: settings save Bad Request fixed (per-key PUT).
- R-063: sleeve projector visually verified on outer-upper arm; debug page + aux routes removed.

## Next
- Text tool (codespace, R-056 remainder).
- Snapshot schema v2 + v1 migration (codespace, R-056 remainder).

## Reminders / Open
- Seed admin admin@example.com/Admin123! still UNROTATED.
- DB is ephemeral on Temps redeploys (re-seeded).
- Clients tab shows "—" for contact details (known gap).
- Caddy route is in-memory — re-apply cmd in CHANGELOG (docs/tshirt-route.json).

## Key paths
`backend/`, `frontend/`, `frontend/src/components/Interior.tsx`, `.devcontainer/`, `docs/CODESPACE-PLAYBOOK.md`, `docs/CODESPACE-TODO.md`.

## Commands
Backend `cargo loco start`; frontend `npm run dev`, `npm run build`; deploy via Temps (see CHANGELOG).

## Constraints
One machine + one codespace (codespace opencode owns R-056 remainder); SeaORM→local sqlite file only; secrets in env.
