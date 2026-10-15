# SPEC R-067 — Camera-calibrated sleeve mapping (numerical, no guessing)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only.

## Why this works (methodology)
Blind θ formulas keep missing. This run derives the mapping from MEASURED data:
1. FIX the cameras: set 3 orbit poses EXACTLY (azimuth/polar/distance + target) and WAIT 800ms for damping to settle before every shot. Poses: P1 front (az 0°, pol 78°), P2 front-¾ left (az -35°, pol 78°), P3 direct outer-left (az -90°, pol 80°). Print the actual camera position/target used into the log.
2. PROJECT landmarks: in-page script that takes world points and returns their screen coords via the live camera matrices: SEAM=(0.19,0.10,0.01), ARM_MID=(0.23,0.08,0.01), CUFF=(0.26,0.06,0.01), SHOULDER_TOP=(0.14,0.22,0.0), plus for P3 the outer-arm face center. Log these FIRST (before any paint) — they are the ground truth grid.
3. PAINT grid: draw red 40px squares at sleeve-canvas grid points [(0.3,0.4),(0.5,0.4),(0.7,0.4),(0.3,0.62),(0.5,0.62),(0.7,0.62),(0.5,0.8)] as ONE item per test iteration (7 quick runs, rebuild bake each); screenshot P1/P2/P3; blob-detect red pixels (thresholded), compute centroid screen coords; tabulate which canvas point lands nearest which landmark.
4. DERIVE: choose (θ span, center, along-x window) so that: canvas (0.5,0.62) centroid ≈ ARM_MID projection (±40px at 1440px), (0.5,0.4) lands between SEAM and ARM_MID, and NO grid point lands within 40px of SHOULDER_TOP projection. If current raycast mechanism cannot satisfy this with ANY constants, fall back to planar front-facing anchor: plane z=0.25 facing −z, u along x∈[0.18,0.27], per-item raycast toward −z, decal oriented by hit normal — and state explicitly which mechanism won.
5. BAKE the winning constants as Logo (0.5,0.62,0.45w) + Strip presets; clean build; final orbit proof set with a real logo+text design + pixel evidence table (blob centroid vs landmarks) in the report.

## Constraints
- Debug paint harness: temp page or hidden debug prop, REMOVED before finishing. One mechanism only in final code. No behavior changes to front/back/editor UI.
- Report: FILES CHANGED, LANDMARK TABLE (pose → screen coords), GRID TABLE (canvas pt → nearest landmark + px), FINAL CONSTANTS, PROOF METRICS, VERIFICATION, DEFERRED.
