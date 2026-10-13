# CODESPACE TODO — pending changes for the opencode session in this codespace

> 💡 You (opencode in codespace) have no model limit pressure — take the time to do these well.
> Read `docs/STATUS.md`, `docs/REQUIREMENTS.md`, and root `AGENTS.md` first (project rules).

## R-056 — Design/print pipeline (highest priority)

1. **Embedded print, not floating decals.** Replace the drei `<Decal>` overlays in
   `frontend/src/components/ShirtViewer.tsx` with *projective texture-baked* printing:
   for each view (front/back/sleeve-left/sleeve-right) keep one canvas + `THREE.CanvasTexture`;
   in the shirt material's fragment shader (it already uses onBeforeCompile for the swing),
   project the view plane orthographically onto the surface and blend the print texture into
   `diffuseColor`. Print must follow wrinkles, sheen, shadows and swing — never float.
2. **Flat 2D editors per view.** New `src/components/FlatViewEditor.tsx`: a 2D canvas for
   front / back / sleeve L / sleeve R with shirt-silhouette guides and a blocked collar band
   (top ~12%). Items = images or text with x/y/scale/rotation/layer. Quick-place buttons:
   Center / Top-Left / Top-Right / Bottom-Left / Bottom-Right. Visualize everything on flat 2D,
   then embed into 3D via the projector above using a shared placement spec.
3. **Text tool.** "Add Text" in the designer: text input, font select, size, color
   (e.g. "Cricket Tshirts"). Render text in the flat editors and bake into the 3D print.
4. **Save payload.** `design_snapshot` schema v2: `{ version:2, views:{front:{items:[]},...} }`
   with uploaded URLs only (+ small thumbnails ≤40KB). Migrate v1 snapshots on read
   (map old `decals[{zone,url,scale}]` to center items so old orders still render).
- DONE already: backend accepts `sizes` as object OR string (`backend/src/controllers/orders.rs`
  `OrderParams.sizes` is `Option<serde_json::Value>`, normalized in `apply_params`) — the
  "Save failed / Bad Request" bug source. Verify end-to-end anyway.

## Nice to have
- `cargo test` pre-existing seed-fixture failures (admin seed takes users.id=1; fixtures use 1..3).
- Bundle code-splitting warning (>500kB three.js).
- Soft shadows + rug noise refinement in `src/components/Interior.tsx`.

## Constraints
- Never commit secrets; Turso creds via env only. Host: tshirt.brightive.shop via Temps.
- Minimal, modular, no dead code. Verify `npm run build` + `cargo check` before finishing.
