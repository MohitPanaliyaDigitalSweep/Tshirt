# SPEC R-066 — Sleeve print via raycast-anchored Decal (Printonator-style anchoring)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only.

## Why (evidence)
- printonator.com: 3D tee configurator; artwork on predefined print AREA anchored to the mesh; per-part coloring (collar/sleeve/hem/cuff); fabric.js 2D editor with aligning/centering guidelines; PNG snapshot + WEBM video export.
- Industry placement (researched): sleeve logo = outer arm, 1–2" above hem, 2–3.5" wide; strip = vertical down outer arm centerline.
- Our GLB (pmndrs shirt) has NO print-area submeshes, so bare analytic cylinder math keeps landing art on the shoulder top. NEW APPROACH: raycast the REAL mesh per item and use drei <Decal> (box-projection onto surface = hugs curvature, not floating).

## Mechanism (frontend/src/components/ShirtViewer.tsx)
1. Keep current ortho projective bake for front/back (those embed fine). REPLACE sleeve cylinder math with per-item decals:
2. Sleeve coordinate mapping: sleeve editor canvas (x:0..1 outer-center→seams? keep current convention: x=0.5 = outer centerline as user sees panel; y: 0=shoulder seam, 1=cuff hem — confirm from flat.ts; invert if opposite).
   For an item at (cx cy): θ = (cx-0.5) * 2.4 rad around tube, 0 = outer-front center, positive θ sweeps toward sleeve top; along = mix(0.19, 0.26, cy) (world x toward cuff for left). Tube axis center (y=0.10, z=0.01, radius~0.09).
   Origin = center + dir*(0.09+0.15); raycast towards tube axis into nodes.T_Shirt_male (use THREE.Raycaster; include only that mesh).
3. Decal placement: position = hit + normal*0.002; quaternion = setFromUnitVectors((0,0,1), normal) then extra rotation about normal by item.rotationDeg (plus a base roll for TEXT: "CRICKET TSHIRTS" strip reads vertical down the arm — test with text!). scale = mapping: decal scale (sx,sy) = item scale normalized so default Logo (0.45 panel width rel)→ world width ~0.10.
4. Presets: Logo => canvas (0.5, 0.62); Strip => (0.5, 0.25–0.92 tall narrow). Buttons visible after upload (already fixed in R-064 — keep).
5. Miss-raycast (no hit / facing away) → skip item + console.warn once. alphaTest 0.1, polygonOffset on decal material.

## Verification loop (mandatory)
User's exact artifacts: round logo image + text "Cricket Tshirts". Place Logo on both sleeves, Strip on right; orbit 6 shots; verify visually via pixel-color detection of the logo's saturated pixels centroid relative to the SLEEVE silhouette region on 3/4 views (compute sleeve silhouette = rightmost/leftmost bright band of shirt region); also verify no art on shoulder cap top (region above silhouette mid-height). /tmp/proof/r066-*. 0 console errors. npm run build clean.

Report: FILES CHANGED, MAPPING (canvas→world math incl θ span and along-x window), WHY decals beat cylinder here, PROOF METRICS, VERIFICATION, DEFERRED.
