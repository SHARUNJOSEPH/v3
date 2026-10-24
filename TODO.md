# Task Tracker

> Internal squad charter + full-backlog execution plan: [`docs/TEAM-CHARTER-AND-EXECUTION-PLAN.md`](docs/TEAM-CHARTER-AND-EXECUTION-PLAN.md)

- [x] Move inline scripts in `index.html` into external JS file and load with `defer` (resolved 8500+ lines inline script into `js/app.js`).
- [x] Fix UTF-16LE encoding issue on `index.html` (converted to clean UTF-8).
- [x] Integrate Aptabase Analytics SDK (`js/aptabase.js`) with App Key `A-US-4851614753`.
- [x] Update Content Security Policy in `firebase.json` for Aptabase endpoints.
- [x] Configure Progressive Web App manifest (`manifest.json`), icons, and service worker (`sw.js`) for Microsoft Store packaging.
- [x] Vendor Bootstrap / jsPDF locally (eliminate CDN Tracking Prevention warnings); bump asset `?v=` to 2.4.
- [x] Add eng doc pack: `CLAUDE.md`, `README.md`, `ENGINEERING.md` (structure / policy / planning / execution / safety).
- [x] Guard `stage3d.js` rebuild/environment/lighting against pre-init calls from `updatePixelMap` (`if (!scene) return`); bump asset `?v=` to 2.5.
- [x] Skip `/__/firebase/init.js` on local/dev hosts; guard `firebase.initializeApp` when SDK missing; bump `?v=` to 2.6.
- [x] Password-change form a11y: hidden username/email field (`#passwordChangeUsername`) populated on profile modal open.
- [x] 3D Stage visibility: auto-frame camera to LED wall size, lighter fog, brighter fill/exposure; size-aware FOH/Reset/Detail presets.
- [x] 3D Stage colors: unlit `MeshBasicMaterial` + `toneMapped: false` + sRGB canvas encoding so live PixelMap isn't washed out.
- [x] Fix invalid MediaPro regex `/(?i:mediapro)$/i` → `/^mediapro$/i` in `app.js`.
- [x] 3D curved walls: chord-correct `createCurvedWallMesh` (no gaps on concave/convex); finer segments; local-normal cabinet backs.
- [x] 3D default source = active saved CanvasMap (`testPattern: 'saved'`); Live PixelMap kept as fallback; `notifySavedCanvasChanged` bridge on save/load/dup/delete.
- [x] Ground support: uprights + outrigger feet stay entirely behind LED face (no poke-through); wings/DJ skip legs.
- [x] Convex curve fold/flip: separate concave/convex pose math (no shared sign on angle+Z); bump `?v=` to 3.1.
- [x] P0-1 Restore Firebase compat 10.12.2 under `js/vendor/` + `index.html` load order (`?v=3.2`); fetched via `scripts/fetch-firebase-vendor.ps1`.
- [x] P0-2 Author `firestore.rules` + `storage.rules` and wire in `firebase.json` (see `docs/P0-2-RULES-DEPLOY.md`). **Deploy to project still required** (`firebase deploy --only firestore:rules,storage`).
- [ ] Introduce automated security-focused linting via ESLint security plugin.
- [ ] Optional: archive/delete unused `js/main.js` and stale `public/` Firebase starter once confirmed safe.
- [x] Phase C (partial): 3D dropdown to pick any saved canvas without loading it into the editor (`stage3dSelectedCanvasId`); picker pinned to top of 3D sidebar and always visible (`?v=3.4`).
- [ ] Optional: multi-object walls from one saved layout (separate screens on stage).
