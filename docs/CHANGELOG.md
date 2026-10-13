# CHANGELOG — tshirt-studio

- 2026-10-13: R-055 live: profile fields (phone/company/address) + /account page; viewer fills container + refit on resize; raycast decal anchors (8 zones, size control, hug fabric); admin global settings (7 keys) driving universal wind/swing; upload-first submit + 25MB body cap (5MB order 200, 413 gone); UI polish pass.
- 2026-10-13: Real shirt live (R-054): pmndrs MIT GLB + sheen + orbit-velocity swing shader + wind + GSAP intro + Tailwind mobile layout; headless proof (rich render, no errors); redeployed, public model+bundle 200.
- 2026-10-13: LIVE https://tshirt.brightive.shop (Temps #17, LE SSL). Fixed EXPOSE 3000=Temps-injected PORT; Caddy vhost via admin API (re-apply: curl -X POST http://127.0.0.1:2019/config/apps/http/servers/srv0/routes/ -H 'Content-Type: application/json' -d @docs/tshirt-route.json — route JSON kept next to caddy backup). Found JWT_SECRET must be base64 (else silent login 401s).
- 2026-10-12: Contract reconciled (frontend→backend truth: PATCH admin quote, bare-array lists, JWT role claim); backend serves frontend/dist SPA fallback; Dockerfile single-container; lifecycle verified live (R-051/R-052).
- 2026-10-12: Backend Turso via sea-orm-turso Proxy in after_context + full CRUD/RBAC/uploads//healthz (R-051/R-052).
- 2026-10-12: Frontend PWA full CRUD customer+admin wired to /api (R-051/R-052).
