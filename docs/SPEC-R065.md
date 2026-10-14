# SPEC R-065 — Sleeve placement per industry standard (logo 1–2" above hem)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only.

## Ground truth (researched, multiple print-industry sources)
- Standard short-sleeve logo: 2–4" wide, **centered on the outer arm, 1–2" above the sleeve hem** (RushOrderTees, Wooter, MaggieFrames, Stahls). Shoulder-seam-side placement (2" below seam) is only the sporty "shoulder accent", NOT the cricket-jersey sponsor spot.
- Our sleeve canvas: TOP = shoulder seam, BOTTOM = cuff hem; canvas centerline = outer-arm centerline (R-060 mapping holds).
- Conclusion: the Logo preset at top-center is wrong by construction. Move it DOWN.

## Changes
1. `Logo` sleeve preset: position (0.5, **0.62**) — i.e. centered horizontally, ~62% down the panel (≈1–2" above hem on a standard sleeve); default scale relative width **0.45** of panel width (2–3.5" real-world). Label stays "Logo".
2. `Strip` preset: vertical band centered x=0.5, spanning y **0.25 → 0.92** (top-to-bottom center, stopping clear of both seam and hem per industry), narrow width (0.16 panel width).
3. Sleeve editor guide: draw a subtle "print zone" band on the panel highlighting y 0.50–0.75 (the sweet spot) with a tiny label "logo zone"; keep collar/no-go band, Logo/Strip preset buttons, Logo top note updated ("1–2 in above hem" hint text).
4. 3D bake: NO angular change (R-064 outer-front window stays); only the along-tube mapping implied by new preset positions must land mid-outer-arm. If the v window needs a nudge so that canvas y=0.62 ⇒ outer arm middle third, adjust and state the numbers.
5. Guard: cap sleeve item scale at panel-relative 0.6 width for images (bigger art wraps awkwardly on a curved arm — industry rule; text exempt but warn past 0.8).

## Verification (mandatory)
- npm run build 0 errors. Preview :7861. Headless: place Logo preset + Strip on both sleeves, orbit screenshots (front, ¾, side, top) to /tmp/proof/r065-*; compute print centroid vs sleeve silhouette: centroid must be BELOW the shoulder seam line and ABOVE the cuff in screen space on side views; 0 console errors.
Report: FILES CHANGED, PRESET NUMBERS (x/y/scale), 3D MAPPING NUMBERS (any v-window change), PROOF METRICS, VERIFICATION, DEFERRED.
