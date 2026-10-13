# SPEC R-056 — Embedded print + flat editors + text tool (tshirt-studio)

Repo: /workspaces/Tshirt. Branch: main. Do NOT commit or push — the outer loop handles git.
Work region: frontend/ ONLY. Do not touch backend/, docs/, root files (except package.json deps if truly needed).
Read first: frontend/src/components/ShirtViewer.tsx, frontend/src/components/Interior.tsx, frontend/src/pages/DesignerPage.tsx, frontend/src/pages/OrderDetailPage.tsx, frontend/src/pages/AdminOrderPage.tsx, frontend/src/lib/api.ts, root AGENTS.md.
Skills available in .opencode/skills/ (ui-ux-pro-max, impeccable) — consult for design consistency with the existing kinpaku dark theme.

## 1. Embedded print (replace floating Decals)
Goal: artwork printed INTO the fabric — follows wrinkles, sheen, shadows, swing; never floats.
- In ShirtViewer: keep the real GLB + swing vertex shader + Interior scene. REMOVE the drei <Decal> overlay path.
- For each print view (front, back, sleeveLeft, sleeveRight) maintain one offscreen <canvas> (front/back 1024px, sleeves 512px) + THREE.CanvasTexture.
- Extend the material's onBeforeCompile FRAGMENT stage: 4 orthographic projectors:
  - front: axis +z; u = rex(x,[-0.276,0.274]), v = rex(y,[-0.352,0.261])
  - back: axis -z; u mirrored so right-on-fabric = uv.x=1-u
  - sleeveLeft: axis -x; u = rex(z,[-0.125,0.144]), v = rex(y,[-0.05,0.26])
  - sleeveRight: axis +x; u mirrored
  (rex(v,[a,b]) = (v-a)/(b-a))
- Uniforms: uPrintMap[4], uPrintOn[4] (float 0/1). Blend: uv feather via smoothstep (2% edges), single-sided (dot(normal, projectorDirView) > 0.25), then
  diffuseColor.rgb = mix(diffuseColor.rgb, print.rgb, print.a * mask).
- Texture config: sRGBColorSpace, anisotropy 4, wrap ClampToEdge. Where no items drawn, fill canvas transparent and set uPrintOn=0.
- Images: drawImage contain-fit into item's (x,y,scale,rotation) box; crossOrigin=anonymous; skip broken silently. Opacity per item: item.opacity ?? 1.

## 2. Flat 2D editors (new src/components/FlatViewEditor.tsx)
- One editor per view (tabs Front / Back / Sleeve L / Sleeve R) shown in the designer LEFT column alongside the 3D viewer (3D on top, active editor below on desktop; both stacked on mobile).
- Canvas 2D with shirt silhouette outline guide + collar no-go band shaded (top 12% front/back, top 20% sleeves) — items blocked from placement into band (clamp y) .
- Item model: { id, kind:'image'|'text', url?, text?, font?, size?:number (px at 1024), color?, x, y (center, 0..1), scale (relative, 1 = 0.2 view width), rotationDeg, opacity? }.
- Interactions (pointer events, must work on touch): click select, drag move (clamped incl. no-go band), wheel or pinch-free: sliders for scale (0.3..3) and rotation (-180..180); buttons: layer up/down, delete. Quick-place buttons: Center, Top-Left, Top-Right, Bottom-Left, Bottom-Right (xy snapped to printable-area corners below no-go band: TL=(0.28,0.28), TR=(0.72,0.28), BL=(0.28,0.78), BR=(0.72,0.78), C=(0.5,0.5)).
- readOnly prop for OrderDetailPage/AdminOrderPage (renders canvases + list, no editing).

## 3. Text tool
- In DesignerPage toolbar: "Add Text" opens inline form: text input (placeholder: "Cricket Tshirts"), font select (system stack list: Inter, Fraunces, Arial, Georgia, Impact, cursive), size (20..200), color swatch (#ffffff default + gold/champagne from theme), Add button → item lands centered on ACTIVE view, auto-selected.
- Render text via ctx.fillText with save/translate/rotate/restore; font string: `600 ${size}px ${font}`. textAlign center, textBaseline middle.

## 4. Snapshot schema v2 + persistence
- design_snapshot = { version: 2, color, material_id, views: { front:{items:[...]}, back:{}, sleeveLeft:{}, sleeveRight:{} }, thumbs: { front?, back? } (JPEG dataURL ≤40KB each; if canvas toDataURL exceeds 38KB drop that thumb) }.
- Upload-first: any File-backed image item must upload via POST /api/uploads on save (existing helper) and store returned URL only. Existing behavior (verbatim error surfacing, sizes object POST) is preserved — backend now accepts sizes objects.
- On load: if snapshot.version === 1 (old {zones, decals[{zone,url,scale}]}), migrate: map each decal to a center item of its view (front/back zones → front/back; sleeve_left/right → sleeveLeft/Right) with default scale/rotation 0.
- assets POST per uploaded file unchanged (zone mapping: sleeve_left→sleeveLeft etc.).

## 5. Designer page integration
- Keep saving flows, materials/color/sizes/qty/note form, settings-driven wind, mobile bottom-stacked layout, gold theme elements.
- 3D viewer takes `views` prop = live flat-editor state; edits re-bake textures immediately (throttle 150ms).

## Verification (REQUIRED before reporting done)
- npm run build: 0 tsc errors.
- vite preview on 7861 bg: GET / → 200; /models/shirt_baked_collapsed.glb → 200; then kill.
- Headless screenshot proof with cached chromium (ls /home/codespace/.cache/ms-playwright; if chromium fails, install deps: npx playwright install-deps chromium): 390x844 and 1440x900 shots of designer page — verify via pixel analysis (zlib-decode PNG, unique colors > 1000) and md5 differ between two shots saved 3s apart (swing renders). Serve over HTTP from the preview, never file://. Shots to /tmp/proof/.
Report format: FILES CHANGED, PRINT MATH SUMMARY, SCHEMA SHAPE, VERIFICATION RESULTS (commands + outputs), DEFERRED.
