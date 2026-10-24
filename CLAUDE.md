# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**PixelMap LED Grid Generator** (`PixelMap`) — professional AV / event-production tool for LED video-wall grid calculation, pixel mapping, power & signal estimation, Canvas 2D layout, PDF/Resolume export, and a Three.js 3D stage visualizer. Shipped as a static Progressive Web App (Firebase Hosting + Microsoft Store packaging).

Repo: `https://github.com/SHARUNJOSEPH/v3.git`. Active working branch is typically `n1`; CI deploys `main`.

## Commands

```bash
npm start                 # npx serve .  (static server, default port 3000)
npx serve -l 3000 .       # explicit port (matches launch-app.bat)
```

Desktop launchers (Windows):

```bat
launch-app.bat            # kill stale :3000, start serve, open Edge/Chrome --app=
launch.vbs                # silent wrapper around launch-app.bat
```

Firebase deploy (requires secrets `FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID`):

```bash
firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID"
firebase hosting:channel:deploy pr-<n> --project "$FIREBASE_PROJECT_ID"
```

There is **no** test runner, bundler, TypeScript, or ESLint config yet. `TODO.md` tracks adding ESLint security lint and Firestore/Storage rules. Do not invent a test/lint workflow — document or add it explicitly if introduced.

Cache-bust query strings (`?v=2.6`) on `css/style.css`, `js/aptabase.js`, `js/stage3d.js`, `js/app.js` must be bumped together when those files change and you need clients to pick up the new build.

## Architecture

Static SPA. No module bundler for the main app. Feature logic lives in a large deferred script; thinner modules expose `window.*` APIs.

### Runtime load order (`index.html`)

1. `css/vendor/bootstrap.min.css`, `css/style.css?v=…`
2. `js/vendor/jspdf.umd.min.js` (head)
3. End of body: `js/vendor/bootstrap.bundle.min.js`
4. `js/aptabase.js?v=…` (`defer`) → `window.Aptabase`
5. `js/vendor/three.min.js`, `js/vendor/OrbitControls.js` (sync)
6. `js/stage3d.js?v=…` (sync) → `window.PixelMap3D`
7. `js/app.js?v=…` (`defer`) — product core
8. Inline snippet that unregisters any service workers and clears Cache Storage

Firebase Auth / Firestore / Storage compat SDKs were previously loaded from `gstatic` CDN and were removed in the local-vendor pass (`fix: vendor all CDN scripts locally…`). They are **not** present under `js/vendor/` today. `app.js` only loads `config/firebase-config.js` (sets `window.__FIREBASE_CONFIG__`) and optionally `/__/firebase/init.js` on Hosting. Without the compat SDK scripts, `window.firebase` is undefined and the app falls into `__IS_DEMO__ = true`. Restore by vendoring the compat SDKs locally (preferred) or re-adding CDN tags — keep CSP in `firebase.json` aligned either way.

### Module map

| Path | Role |
|---|---|
| `js/app.js` (~10.5k lines) | **Active app.** Monolithic `DOMContentLoaded` IIFE: auth/demo, profile/Firestore, global `state`, PixelMap calc/draw, Advanced Designer, CanvasMap, PDF/Resolume exports, 3D tab bridge. |
| `js/main.js` (~5.7k lines, Nov 2025) | **Legacy / unused.** Not referenced by any HTML. Older subset of app logic. Do not extend; archive or delete only after confirming no external consumers. |
| `js/stage3d.js` | Three.js stage: curved LED walls, rigging, wings, lighting, engineering specs (kW / amps / RJ45 ports @ 650k px). Public API: `window.PixelMap3D = { init, rebuild, resize, setCamera, exportSnapshot, setConfig, getConfig }`. |
| `js/aptabase.js` | Analytics shim → `window.Aptabase.init` / `trackEvent`. Key `A-US-4851614753` (US). Events today: `app_started`, `export_3d_snapshot`. |
| `config/firebase-config.js` | Sets `window.__FIREBASE_CONFIG__` for project `grid-945d4`. Client API keys are expected to be public; protect data with Auth + security rules (rules files still missing — see Open work). |
| `login.html` | Standalone modular Firebase v12.4 login (email/password + Google). Demo fallback `admin@gmail.com` / `admin` → `localStorage.demoAuthUser` + 24h `authExpiryAt`. |
| `sw.js` | Self-unregistering SW that flushes caches (intentionally not a real offline cache — paired with the inline unregister in `index.html`). |
| `public/` | **Stale** Firebase Hosting starter. Not the deploy root. `firebase.json` → `"public": "."` (repo root). Do not treat `public/index.html` as the app. |
| `pdf_preview.html` | Standalone PDF settings preview page. |
| `scripts/*.ps1` | One-shot helpers used during the inline-script extraction. Not part of the runtime. |

### Shared globals

- `window.__FIREBASE_CONFIG__`, `window.__IS_DEMO__`
- `window.firebase` (compat — only when SDK is loaded)
- `window.Aptabase`, `window.PixelMap3D`, `THREE`

**Known bridge gap:** `stage3d.js` reads `window.state` for engineering specs / screen rebuild, but `app.js` keeps `state` as a local `const` and never assigns `window.state = state`. Specs therefore often fall back to defaults (`4×2.5 m`, etc.). When touching either side, wire the bridge or pass explicit params.

### Feature boundaries inside `app.js`

Search these markers rather than reading the whole file:

- Auth / demo — `ensureFirebaseInitialized`, `setUiForAuth`, `showLoginModal`, `__IS_DEMO__`
- Profile / Firestore — `// ===== Profile: Firestore helpers` → `loadProfileFromCloud` / `saveProfileToCloud`
- Global state — `// --- Global State and Constants ---`
- PixelMap — `updatePixelMap`, `fitPixelMapToScreen`
- Advanced Designer — `// --- Advanced Designer (multi-module layout) ---`
- CanvasMap — `updateCanvasMap`, `redrawCanvasMapObjects`, `.pixl` project files
- Exports — `exportCombined`, `exportPixelMapOutline`, `exportDetailedCanvasPdf`, `exportResolumeXML`
- 3D bridge — Bootstrap tab `shown.bs.tab` on `#stage3d-tab` → `PixelMap3D.init/rebuild/resize`

Power / signal math lives in `stage3d.js` → `updateEngineeringSpecs()` (≈600 W/m² max, ≈240 W/m² avg, 1G RJ45 @ 650k px/port, ≈8 kg/cabinet).

### Auth model

Standalone product: login is optional for full local use. When Firebase initializes, `onAuthStateChanged` drives the header and cloud profile. Demo mode uses localStorage + 24h expiry. Password change UI only applies to email/password providers.

### Hosting, CSP, PWA

- Hosting root = repo root (`firebase.json` `"public": "."`).
- CSP is set as a Hosting header (not a meta tag). Aptabase (`*.aptabase.com`, `us.aptabase.com`), Google Fonts, Firebase, and (legacy) CDN hosts are allow-listed. Update CSP whenever a new network origin is introduced.
- Asset caching: HTML `no-cache`; JS/CSS/images long-cache immutable — hence the `?v=` busting.
- `manifest.json` + `icons/` support PWA / Microsoft Store packaging. `sw.js` currently only clears caches; do not assume offline support exists.
- CI: `.github/workflows/firebase-hosting.yml` — push to `main` → live deploy; PR → preview channel `pr-<n>`.

## Working conventions

- Prefer editing `js/app.js` / `js/stage3d.js` / `css/style.css` over inventing new frameworks. Keep the no-bundler model unless a deliberate migration is scoped.
- Do not revive or extend `js/main.js`.
- Keep HTML/JS UTF-8. `index.html` was previously UTF-16LE (see `TODO.md`); Windows editors can reintroduce that — verify with `file index.html` if characters look wrong.
- Vendor third-party scripts under `js/vendor/` / `css/vendor/` rather than CDN when Edge/Chrome Tracking Prevention or CSP is a concern.
- Bump `?v=` on touched entry assets in `index.html`.
- Aptabase app key and Firebase web config are already in-repo by design for a client SPA; never commit service-account JSON, `FIREBASE_TOKEN`, or other server secrets. CI secrets live in GitHub Actions.
- When changing engineering formulas (power, ports, weight), update both the UI labels in `index.html` (`spec3d*`) and `updateEngineeringSpecs()`.

## Open work (from `TODO.md`)

- [ ] Add `firestore.rules` + `storage.rules` and wire them in `firebase.json`.
- [ ] Introduce ESLint + security plugin.
- [ ] (Implied by recent vendor commit) Restore Firebase compat SDK via local vendor copies so cloud auth/profile works outside pure demo mode.
- [ ] Wire `window.state` from `app.js` into `stage3d.js` (or replace with an explicit API).
