# REFERENCES — mockup/configurator knowledge base (tshirt-studio)

> Purpose: everything learned from researching live tools and OSS projects, so the SAME
> architecture extends to hoodies, sweatshirts, polo, kids wear, caps, tote bags etc.
> Update this file whenever a new reference is studied. Newest first per section.

## 1. Live product teardown

### printonator.com (3D T-shirt creator) — reference app for print placement
- URL: https://printonator.com/?model=4 (multiple models via query param = product-catalog pattern)
- Stack (observed from page source): jQuery 2.1.4, **fabric.js** (2D editor) with community plugins
  `aligning_guidelines.js` + `centering_guidelines.js`, FontFaceObserver, jscolor; jQuery-Form
  upload POST → `/engine/uploads/upload.php` (classic upload server, asset URL returned).
- FEATURES (exact behavior to copy):
  - 2D editor = print-area canvas where artwork/text can be moved, rotated, scaled, opacity-changed,
    font/color editing for text; font loading via FontFaceObserver (custom fonts likely served).
  - The 3D model carries **predefined print areas** (placement regions) — art is anchored, not
    free-cylindrical projections. Evidence: separate color controls for **collar**, **sleeves**,
    **bottom hem**, **cuff**, **inner color**, **print area color** ⇒ the GLB/fbx holds multiple
    material groups/submeshes, i.e. zones are authored in the 3D asset.
  - Exports: **PNG mockup snapshot** + **WEBM video** of the 3D scene (captureStream+MediaRecorder)
    and PNG download of the 2D layout.
  - "Model" selector (?model=4): multiple garments → one viewer with per-model zone definitions.
- LESSON for us: zone definitions must accompany every clothing model (front/back/sleeves/
  collar/hem are separate material groups or UV islands). Anchor art to zone meshes, never guess
  with analytic math.

## 2. OSS configurators (GitHub)

| Repo | License | Stack | Notable |
|---|---|---|---|
| pmndrs/examples › t-shirt-configurator (codesandbox ioxywi) | MIT (repo) | R3F + drei + valtio | Source of our shirt GLB (`shirt_baked_collapsed.glb`); drei `<Decal>` placement on `T_Shirt_male` |
| afilahkle/3D-Clothing-Configurator (85★) | (check LICENSE) | Vite+R3F | Multi-garment (tee/shorts/pants/shoes) with per-zone/logo placement — closest architecture for multi-clothing |
| adrianhajdin/project_threejs_ai_shirt (the tutorial family: Starklord17/threejs-t-shirt, SamarthHChinivar/3d-shirt-designer, vivekup3424/Product-Customizer, BhaskarAcharjee/TShirtify[MIT]) | mixed/none | R3F + drei + valtio + OpenAI/DALL·E | SAME shirt_baked.glb + Decal at pos[0,0.04,0.15]; demonstrates AI image-gen add-on; Front print only |
| BhaskarAcharjee/TShirtify | MIT | React+Vite, Node/Express, DALL-E | AI design suggestions + export artwork |
| zyadhajaji/threadforge | (check) | Next.js 14 + Fabric.js + Prisma + Stripe | Brand kit + collections + exports (SaaS mockup platform shape) |
| CTDave001/ yuto514 Automated_Mockup_Generator | (check) | Python/Pillow | Batch overlay generation for POD |
| morluto/rea | MIT | TS | Reverse-engineering tool (agents) — for inspecting closed tools like printonator |

## 3. Print-placement standards (researched 2026-10, RushOrderTees/Stahls/Wooter/MaggieFrames/Arklavo/ShirtSpace)
- Sleeve logo (short sleeve): **outer arm, 1–2" above hem**, width 2–3.5" (max), centered on the
  shoulder-seam→hem centerline; sizes up → shift ~1" higher on youth/women, +0.5–1" on XL/XXL.
- Shoulder accent (sporty): 3–5" wide, ~2" below shoulder seam — DIFFERENT from standard logo.
- Long-sleeve vertical strip: up to 15" long × 5" high, centered on outer arm.
- Left chest: 3.5–4" wide, 4–6" from centerline, 5.5–8" down from shoulder seam (≈3–4" below collar).
- Center chest: 6–10" wide, 3–4" below neckline.
- Full front/back: 12×14" typical (10–16), 2–3" below collar / back 6–8" below collar.
- Back collar tag: 1–3" just below rear neckline.
- Print techs the editor should stay neutral toward: sublimation, heat transfer, DTG, screen, DTF.

## 4. Multi-clothing extension plan (requirements per garment)
For EACH clothing model we onboard, capture in a `garment.config.ts` (future):
- GLB path + per-zone data: zone list (front/back/collar/hem/cuff/sleeves/pocket/hood...), each with
  anchor point, surface dir, printable bounding box in model coords, and 2D canvas aspect.
- Prefer models with **separate zone submeshes/material groups** (printonator-style). If ours are
  merged, keep raycast/decal anchoring (R-066) as fallback.
- Keep placement numbers from §3 as preset defaults per zone.

## 5. Source on file
- Model: pmndrs `shirt_baked_collapsed.glb` — MIT, attribution in `frontend/public/models/ATTRIBUTION.md`.
- No external HDRIs/textures currently; Interior scene is procedural (see `Interior.tsx`).
