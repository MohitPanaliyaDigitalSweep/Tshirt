# SPEC R-063 — Sleeve print MUST sit on outer arm (iterate until visually proven)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only. Keep all R-056..R-062 behavior.
Context: the sleeve projectors were moved off the shoulder (x-window ±0.18..0.27) yet the user still sees art ON the shoulder, not the outer arm — so stop trusting the math alone. Your job is a VISUAL loop: place → screenshot from multiple orbits → judge → adjust → repeat until proven.

## Methodology (mandatory)
1. Instrument: temporary debug page/params allowed locally (mark clearly, remove before reporting) to color-code: Logo paint = solid RED rectangle, Strip = cyan stripe, so screenshots unambiguously show placement.
2. Orbit shots: front 3/4, direct side (outer arm), top-down for EACH sleeve — 6+ screenshots per iteration in /tmp/proof/r063-*.
3. On-disk pixel checks: measure the red/cyan pixel centroid in image space AND, with a fixed camera, the shirt silhouette bounds — compute the centroid's relative position (must be inside the sleeve silhouette region, below the shoulder cap).
4. Iterate the shader mapping until: logo sits on outer-upper arm near but not at the shoulder seam; strip runs down the outer arm center; NOTHING on shoulder cap, torso, or inner/armpit side. Key knobs: v window (along |x|), u angular window (around tube, u=0.5=top), optional slight z-bias toward the arm center.
5. When convinced by screenshots, restore normal paint colors (remove debug), keep the improved mapping.

## Also
- Ensure 2D sleeve editor + mapping stay aligned (Logo preset top-center of canvas ⇒ outer-upper arm in 3D after final mapping).
- npm run build must pass; capture final screenshots with normal design (sample logo + "CRICKET TSHIRTS" strip) proving placement on BOTH sleeves.

Report: FILES CHANGED, FINAL MAPPING MATH (v window, u window, gates, with model measurements you used), ITERATION LOG (shots per iteration + where art landed), VERIFICATION OUTPUTS, DEFERRED.
