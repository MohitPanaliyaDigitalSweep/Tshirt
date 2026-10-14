# SPEC R-060 — Garment editors, sleeve zones, text sizing, account menu, profile gate

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend + tiny backend-if-needed (prefer frontend-only).
Read: frontend/src/components/FlatViewEditor.tsx, frontend/src/lib/flat.ts, frontend/src/components/ShirtViewer.tsx, frontend/src/pages/DesignerPage.tsx, frontend/src/pages/AccountPage.tsx, frontend/src/App.tsx, frontend/src/lib/api.ts, root AGENTS.md. Keep kinpaku dark theme + a11y (44px, aria, focus rings).

## A. GARMENT-SHAPED EDITOR CANVASES (FlatViewEditor.tsx + flat.ts)
Editors must READ as garment panels, not blank rectangles:
- Front/back canvas: draw a recognizable tee flat-sketch: torso body, crew neckline rib (blocked collar band stays: top 12%), shoulder slopes, short-sleeve caps extending left/right (decorative, non-printable, dimmed), hem line. Printable torso region highlighted subtly (dashed gold boundary); items clamped inside printable region (existing no-go logic extends to region bounds).
- Sleeve canvases: draw ONE tapered sleeve panel (wider at shoulder/top, narrower cuff/bottom, slight curve): upper logo zone marker (small dashed box top-center, ~25% height) + vertical center strip guide (dashed center line top→bottom). Printable = whole panel.
- Guides must be light strokes that do NOT export into print (draw guides on screen only; the bake canvas stays art-only — keep two-canvas or redraw-without-guides approach).
- Quick-place presets per view: front/back keep Center/TL/TR/BL/BR; sleeves get: "Logo" (top-center small, scale preset 0.5) and "Strip" (vertical center, rotation 0, scale 1.2, y center 0.55).

## B. SLEEVE 3D TARGETING
Sleeve print must land on the sleeve's OUTER TOP area where logos/strips go (not the underside/armpit):
- Verify projector orientation: sleeveLeft canvas +u should run shoulder→cuff along the outer arm, canvas top = shoulder. If current mapping (u=z,v=y) puts art under the arm or mirrored, fix by flipping u/v and/or shifting the v window upward to the top half of the sleeve (outer-top quadrant). Normal-gating must keep print off the torso and inner arm.
- Prove with screenshots: sleeve editor with a logo + strip, 3D orbit to show outer sleeve; include one such shot in /tmp/proof/.

## C. TEXT RESIZING (must be obvious)
- Selected text item shows BOTH: font-size stepper (px, 20..200, +/- buttons + slider) AND scale slider; both update live in 2D + 3D bake. Size presets S/M/L buttons. Line-height fixed 1.15. Keep font/color controls.

## D. ACCOUNT MENU (replace login/logout buttons)
- App.tsx nav: remove direct Login/Logout buttons. Single user-section button (avatar circle with initial, or person icon when logged out) opening a dropdown menu: when logged out → "Sign in" (→/auth) + "Create account"; when logged in → header (name+email), "Profile", "My Orders", admin sees "Dashboard" link, "Sign out". Close on outside-click/Escape, aria-haspopup/menu/menuitem, keyboard navigable, 44px items.
- Mobile nav keeps same menu.

## E. PROFILE-GATED ORDERING
- Required profile for ordering: name (≥2), phone, address, city (country/postal optional). Helper `profileComplete(user)` in lib/api.ts or lib/profile.ts.
- DesignerPage: Save draft AND Request quote both check completeness FIRST; if incomplete → redirect to `/account?next=/quote` (or back to designer) with banner "Complete your profile (name, phone, address, city) to place orders"; AccountPage shows a completion checklist + after save returns to `next` when profile becomes complete. Quote page: same gate before requesting (defensive; designer already gates).
- Admin flows unaffected. Do NOT add backend validation (frontend gate only).

## Verification
- npm run build 0 errors; preview :7861 GET / 200; headless screenshots incl. sleeve-target proof + garment canvas look (1440 + 390, /tmp/proof/, unique colors >1000, zero console errors).
Report: FILES CHANGED, SLEEVE MAPPING (final u/v orientation + flips), GATE LOGIC, VERIFICATION OUTPUTS, DEFERRED.
