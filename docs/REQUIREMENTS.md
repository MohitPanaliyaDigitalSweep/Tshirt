# REQUIREMENTS — tshirt-studio

- [x] Customer auth (signup/login, JWT, customer role)
- [x] Customer profile/details (name, email, phone, company, address)
- [x] Order form: material, color, size breakdown, quantity, note
- [x] 3D designer shell: rotate/zoom, color swap, zone tabs front/back/sleeves, upload + snapshot saved with order
- [x] Real GLTF tee (pmndrs MIT) + sheen + gravity/swing on rotate + wind + GSAP intro + mobile layout
- [x] Request Quote (`quote_requested`); view quoted price; confirm order; no payment/delivery
- [x] Admin auth + dashboard: orders table, filters, client details, assets gallery + download, 3D reload, quote form (price+note)
- [x] File uploads ≤10MB, SVG sanitized; DB stores metadata only (local disk now; R2 later)
- [x] PWA: manifest, SW offline shell, installable (SVG icon now; PNG 192/512 later)
- [x] Loco backend on Turso engine via sea-orm-turso (local file now; Cloud sync needs URL+token env)
- [x] LIVE on https://tshirt.brightive.shop with SSL (Temps + Caddy vhost + LE cert)
