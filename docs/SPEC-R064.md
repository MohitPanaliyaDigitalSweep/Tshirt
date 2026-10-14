# SPEC R-064 — Fix sleeve art wrapping over the TOP of the arm (user screenshots = ground truth)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only.

## Symptom (from user screenshots — definitive)
User placed a round logo (canvas ~upper-middle) and bottom text "Cricket Tshirts" on the sleeve editor (tapered panel renders fine). In 3D the artwork sits like a **saddle over the TOP of the shoulder/arm** (canvas center maps to the tube's +y/top face), not wrapped around the **outer face of the sleeve** as customers expect. Length-wise position is approximately right (near shoulder seam); the WRAP (angular) placement is wrong.

Current mapping (R-059/R-060/R-063 work, see ShirtViewer.tsx): cylindrical around tube axis |x|∈[0.18,0.27], center (y=.10,z=.01), `u = 1-(θ/π*0.5+0.5)` for left, mirrored right, gates |x|, y, |θ| feather, radial dot.

## Required behavior
- Sleeve canvas CENTER HORIZONTAL LINE (u≈0.5) must land on the sleeve tube's **outer-facing side as seen by a front/side camera** — i.e. the half of the tube that faces the +z/front direction of the shirt, not the +y top face. For a hang-up tee in near-T-pose this is the quadrant around θ=+π/2 in the atan2(z,y) frame.
- Both sleeves same convention (no mirroring flip of the angular side — art must dawn on the +z/front half for both; keep correct text mirroring only if needed).
- Angular feather span ≈ ±70° (smooth at edges); all other gates (|x|, y-band, radial normal) stay.
- Logo preset target: center-upper area of outer arm near shoulder (canvas top-center) ⇒ 3D: outer arm near shoulder. Strip preset: vertical center strip down the outer arm.
- RESTORE the missing preset buttons in the sleeve editor — UI list shows only Front/Back/Sleeve tabs + Add Text + layer icons: the "Logo"/"Strip" quick-place buttons spec'd in R-060 are NOT rendering. Find why (conditional render? labels changed?) and make them visible/reachable (keyboard+click), minimal change.

## Visual verification loop (mandatory, as SPEC R-063)
Use the user's proven inputs: solid red square as Logo + cyan "CRICKET TSHIRTS" vertical strip, on BOTH sleeves. Orbit screenshots (front, front-¾, direct side, top-down) after each change; counts of red on the upper deltoid region must drop to ~0 while lateral outer-arm region gains them; final run restores normal design. All shots to /tmp/proof/r064-final/. 0 console errors. npm run build clean.

Report: FILES CHANGED, ACTUAL ANGULAR WINDOW (formula before→after, degrees), PROOF metrics (red pixel counts per region per orbit), VERIFICATION, DEFERRED.
