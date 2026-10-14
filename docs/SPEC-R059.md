# SPEC R-059 — Pro flat editors + profile + standalone admin + done/cancel (tshirt-studio)

Repo: /workspaces/Tshirt. Branch: main (has R-056: docs/SPEC-R056.md implemented as projective print + FlatViewEditor + text tool + snapshot v2).
Do NOT commit or push — outer loop handles git. Work in backend/ AND frontend/. Read root AGENTS.md + backend AGENTS.md first.
Skills in .opencode/skills/ (impeccable = kinpaku dark design language — KEEP it; ui-ux-pro-max for a11y rules).
Model: you run on muse-spark free tier — work steadily, verify as you go.

## A. DONE/CANCEL FLOW (backend + frontend) — highest priority, currently broken
Backend has NO done/cancel routes (verified). Add to backend/src/controllers/orders.rs + routes:
- `POST /api/admin/orders/:id/done` (admin only): allowed from `confirmed` ONLY, else 422 with clear message (`Only confirmed orders can be marked done`).
- `POST /api/admin/orders/:id/cancel` (admin only): allowed from `quote_requested|quoted|confirmed`, else 422.
- `POST /api/orders/:id/cancel` (customer own order): allowed from `draft|quote_requested`, else 422.
- All three return the updated order JSON. Reuse existing authz helpers + status constants. No migration needed.
Frontend: OrderDetailPage (customer: Cancel button when draft/quote_requested, with confirm dialog), AdminOrderPage (admin: Mark Done when confirmed, Cancel when quote_requested/quoted/confirmed, with confirms), status stepper shows done/cancelled terminal states, list pages filter chips include done/cancelled. Surface 422 messages verbatim.
Verify: cargo check; curl lifecycle on dev server: draft→cancel(200) ; draft→request→quote(admin)→confirm(customer)→done(admin,200); cancel-from-done→422; customer cancel of quoted→422; delete test rows after.

## B. FLAT EDITORS — PRO PLACEMENT TOOLS (frontend/src/components/FlatViewEditor.tsx + lib/flat.ts)
Keep 4 views (front/back/sleeve L/R), silhouette guides, collar no-go band, quick-place corners. ADD:
- Freehand move (already) + RLTB align toolbar for the SELECTED item: Align Left / Center-H / Right / Top / Middle-V / Bottom relative to the printable area; "Center" quick key.
- Resize: corner drag handles on canvas (pointer events, min 8px) + keep scale slider; aspect-lock toggle for images.
- Rotate: slider (-180..180) + 90° step buttons.
- Crop for image items: crop mode overlay (drag a rect, wheel/buttons adjust, Apply/Cancel); store crop rect {cx,cy,cw,ch 0..1} on the item; renderer + 3D bake honor it (drawImage source rect).
- Snap guides: center H/V dashed lines when item center within 6px; snap on release.
- Multi-item list panel per view (thumbnail, label, visibility eye, lock, delete, layer up/down).
- All controls ≥44px targets, aria-labels, keyboard: arrows nudge selected (1px, shift=10px), Delete removes. Keep readOnly mode functional.

## C. CURVY BAKE VERIFICATION (ShirtViewer.tsx print path)
The R-056 projective bake must read as REAL print on curvy fabric. Harden it:
- Projection must wrap sleeves convincingly (ortho along ±x is fine IF feather + normal-gating are right; if sleeve print looks painted-on-flat, switch sleeves to a cylindrical projection around the sleeve axis and note it).
- Blend mode: print multiplies fabric response — after computing print color, apply it as diffuse BEFORE lighting (already), PLUS modulate print alpha by (0.85 + 0.15 * wrinkleShade) is NOT needed — just ensure lighting applies (do not use emissive/basic materials for print).
- Edge feather 2-3px equivalent, no hard rectangles; transparent canvas regions must contribute ZERO (uPrintOn per view + alpha 0 skip).
- Prove with headless screenshots (playwright chromium in codespace): designer with a sample image + "Cricket Tshirts" text placed front-center and sleeve; 1440x900 + 390x844 to /tmp/proof/; pixel analysis (unique colors >1000, md5 differ 3s apart for swing); zero console errors. Serve preview over HTTP, never file://.

## D. FULL PROFILE PAGE (backend migration + frontend AccountPage)
Backend: new migration adding nullable `city, postal_code, country` VARCHAR to users (raw SQL ADD COLUMN, NO nullability keyword — Turso-safe precedent); expose in register/current/profile PATCH responses; PATCH validates lengths (city/country ≤60, postal ≤20).
Frontend AccountPage: sections — Contact (name/email/phone), Company, Address (address/city/postal/country), all editable + save with inline success/error; order history shortcut link. Keep kinpaku styling. Mobile stacked.

## E. STANDALONE ADMIN DASHBOARD (frontend/src/pages/AdminPage.tsx + AdminOrderPage.tsx)
Admin must feel like its own product, NOT a re-skinned customer page:
- Distinct admin shell: left sidebar nav (Orders, Materials, Assets, Clients, Settings) with icons + labels, topbar with admin chip + logout; content area per section (no customer components reused except ui.tsx kit + api client).
- Orders: table (id/customer/material/qty/status/updated) + search + status filter + sort by updated desc; row click → detail.
- Materials: full CRUD (create/edit modal, delete with confirm + 409/422 surfacing).
- Assets: gallery grid across recent orders with download links + zone labels.
- Clients: table of customers (name/email/phone/company/city, order count) from orders aggregation client-side (no new endpoint; reuse admin orders list).
- A11y: nav as <nav> with aria-label, aria-current on active, table with <th scope>, focus-visible rings (already in theme), live region for toasts (`aria-live="polite"`), skip-to-content link.
- Every button must WORK (no dead controls; if a feature needs backend that doesn't exist, do not render the button).

## Verification ladder (REQUIRED)
1. `cargo fmt --all -- --check` (or run cargo fmt), `cargo check --all-targets`, backend curl lifecycle incl. done/cancel matrix above.
2. Frontend `npm run build` 0 tsc errors; preview :7861 GET / 200 + model 200; screenshots with proofs as in C.
3. No backend breaking changes: old clients (sizes string|object, snapshot v1+v2) still accepted.
Report format: FILES CHANGED, FLOW MATRIX RESULTS, SCREENSHOT PROOFS, VERIFICATION COMMANDS+OUTPUTS, DEFERRED.
