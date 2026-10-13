# OPENCODE CODESPACE PLAYBOOK — run this in the codespace

You are opencode inside the Tshirt codespace ($OPENCODE_MODEL below). Read
`docs/CODESPACE-TODO.md` (the actual work), `AGENTS.md`, `docs/STATUS.md` first.

## Model
Prefer the best **free** model available to you at runtime, in this order:
1. `opencode/kimi-k2.5-free` (or any `*-free` Kimi/MiniMax model listed in `opencode models`)
2. `opencode/glm-4.6-free` / `opencode/qwen3-coder-free`
3. If none free listed, use the default free tier and keep prompts tight.
Set it: `export OPENCODE_MODEL=<best-free-found>` before starting.

## Fan-out rule (per AGENTS.md §4, nesting depth ≤3)
Split the work into INDEPENDENT subagent batches, run each batch in **one message**:
- Batch 1 (parallel): (A) print-bake shader in `ShirtViewer.tsx`; (B) `FlatViewEditor.tsx` + text tool; (C) snapshot v2 wiring in Designer/Detail/Admin pages. If conflict on DesignerPage, sequence (C) after (B).
- After each completed subagent change: `cargo check`/`npm run build`, then `git commit` + `git push` (small, working commits — never push broken builds).
- A `docs` subagent updates `docs/STATUS.md`/`CHANGELOG.md` after each push.

## Rate-limit protocol (free tier)
- If you hit "model limit reached": **stop work, commit WIP as `wip: pause`, push**, then message the user.
- Codespace operator: stop the codespace (`Codespaces → Stop`), wait **10 minutes**, restart it — opencode free limits reset — then resume from `git log` + `docs/STATUS.md` (state lives in files, not memory).
- Every commit must leave the build green so any resume point is safe.

## Definition of done for R-056
- Decals print *into* the fabric (projective bake), no floating; 4 flat editors w/ corner presets + collar no-go; text tool (e.g. "Cricket Tshirts"); order save works end-to-end on https://tshirt.brightive.shop (both sizes object & string accepted — backend fix already in place); verified with screenshots.
