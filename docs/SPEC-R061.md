# SPEC R-061 — PWA install/download option (Android / Windows / iOS)

Repo: /workspaces/Tshirt. Do NOT commit or push. Frontend-only (vite-plugin-pwa already generates manifest + SW; verify config in frontend/vite.config.ts + manifest.webmanifest content).
Read: frontend/src/App.tsx, frontend/index.html, frontend/vite.config.ts, root AGENTS.md. Keep kinpaku theme + a11y.

## Requirements
1. **Install manager** (`frontend/src/components/InstallApp.tsx` + small hook): capture `beforeinstallprompt` (preventDefault, stash event); expose `canInstall`, `promptInstall()` (calls prompt(), awaits userChoice, clears stash on accept), `isInstalled` (matchMedia display-mode: standalone/fullscreen OR navigator.standalone OR beforeinstallprompt never fires + already installed).
2. **UI**: an "Install App" button/section — place in the account menu (App.tsx AccountMenu) AND a dismissible banner/card on the home/designer for eligible (not-installed) users. iOS Safari (no beforeinstallprompt): show platform-specific guide sheet: Share icon → "Add to Home Screen" → Add, with numbered steps + icons (text ok). Detect iOS via UA + `navigator.standalone===false`.
3. **Manifest check**: ensure manifest has name/short_name, start_url `/`, display `standalone`, theme/background colors matching kinpaku lacquer, 192 + 512 PNG icons + maskable purpose icon. If icons missing, generate simple gold-on-lacquer "T" PNGs (192/512 + maskable 512) via a node script into frontend/public/ and wire them. Do NOT break existing icon.svg references unnecessarily.
4. **Edge cases**: button hidden when installed or when prompt unavailable AND not iOS (e.g. Firefox desktop → show manual "bookmark/add" hint? keep simple: hide). No console errors. Nothing that triggers install prompt automatically — user gesture only.
5. Verify: npm run build 0 errors; preview :7861: GET / 200, manifest 200, icons 200, sw.js 200; headless check that InstallApp renders (banner or menu item) with 0 console errors.
Report: FILES CHANGED, MANIFEST STATUS, VERIFICATION OUTPUTS, DEFERRED.
