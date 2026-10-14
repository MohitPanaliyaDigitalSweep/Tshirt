# STATUS — tshirt-studio

**Goal:** Customer 3D quote PWA + admin dashboard, Loco API, Turso-synced DB.
**State:** LIVE https://tshirt.brightive.shop (2026-10-13) with kinpaku dark design system + interior viewer scene + order-sizes fix.

## Done (this session)
- Impeccable/kinpaku design system on all pages: lacquer ground, gold accent, Fraunces+Inter, GSAP, a11y pass.
- ShirtViewer interior scene (`frontend/src/components/Interior.tsx`): procedural oak plank floor (canvas-gen 2048px), terracotta rug, plaster wall, brass stool + caramel ottoman (Impeccable palette), amber practical strip, CSS vignette.
- Backend fix: `OrderParams.sizes` is now `Option<Value>` accepting object OR string — root cause of "Save failed: Bad Request" (frontend sent `{S,M,L,XL}` object). Normalized to canonical `"S:2,M:10..."`. No migration needed. Verified live: sizes-object POST → 200, stored `"S:2,M:10,L:5"`.
- Git: repo github.com/MohitPanaliyaDigitalSweep/Tshirt created; `main` pushed (2 commits). 2nd commit (docs playbook + .devcontainer) is LOCAL only — PAT revoked mid-session, re-push pending.
- Codespace handoff: `.devcontainer/devcontainer.json` (ssehd + node + ghcli + docker-in-docker) + post-create.sh installs opencode; `docs/CODESPACE-PLAYBOOK.md` + `docs/CODESPACE-TODO.md` (free-model priority kimi/glm/qwen -free, `export OPENCODE_MODEL`; 3-subagent fan-out, push after each change; 10-min restart rate-limit protocol; definition of done for R-056).

## Next (owned by codespace opencode — R-056)
1. Projective print bake: embedded fabric decals replacing floating drei Decals.
2. FlatViewEditor: 4 views + corner presets + collar no-go band.
3. Text tool.
4. Snapshot schema v2 + v1 migration.

## Reminders
- Seed admin admin@example.com/Admin123! still UNROTATED.
- Caddy route is in-memory — re-apply cmd in CHANGELOG (docs/tshirt-route.json).
- Re-push 2nd commit once new PAT available.

## Key paths
`backend/`, `frontend/`, `frontend/src/components/Interior.tsx`, `.devcontainer/`, `docs/CODESPACE-PLAYBOOK.md`, `docs/CODESPACE-TODO.md`.

## Commands
Backend `cargo loco start`; frontend `npm run dev`; deploy via Temps (see CHANGELOG).

## Constraints
One machine + one codespace (codespace opencode owns R-056); SeaORM→local sqlite file only; secrets in env.

## Open
R2 vs S3; Google/OTP auth vs password-only; Turso Cloud DB name/token; PAT re-issue for git push.
