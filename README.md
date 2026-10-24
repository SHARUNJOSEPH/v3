# PixelMap LED Grid Generator

Professional LED video-wall grid generator, pixel calculator, power & signal estimator, Canvas 2D stage layout designer, and Three.js 3D stage visualizer for AV / event production.

Shipped as a Progressive Web App (web + desktop / Microsoft Store packaging) on Firebase Hosting.

| | |
|---|---|
| **Product** | PixelMap (`PixelMap LED Grid Generator`) |
| **Repo** | https://github.com/SHARUNJOSEPH/v3.git |
| **Stack** | HTML / CSS / Vanilla JS · Canvas 2D · Three.js · Firebase · Aptabase |
| **Local server** | `npm start` → `npx serve .` (port 3000) |

---

## Features

- **PixelMap** — panel / screen dimension entry, resolution math, topology numbering, visual effects, fit-to-screen.
- **Advanced Designer** — multi-module layouts with computed physical size feeding the canvas map.
- **CanvasMap** — 2D object layout, crop controls, saved canvases, `.pixl` project files.
- **3D Stage** — curved LED walls, ground/flown rigging, side wings, lighting, camera presets, snapshot export.
- **AV engineering specs** — area, cabinets, max/avg power (kW + amps @ 110/220 V), 1G RJ45 port count (@ ~650k px/port), weight estimate.
- **Exports** — combined PDF, pixel-map outline, detailed canvas PDF, multi-canvas PDF, Resolume XML, 3D snapshot.
- **Auth (optional)** — Firebase email/password + Google; demo mode for fully offline/local use.
- **PWA** — `manifest.json`, icons, desktop launchers (`launch-app.bat` / `launch.vbs`).

---

## Quick start

### Prerequisites

- Node.js 18+ (for the local static server)
- A Chromium-based browser (Edge or Chrome recommended for `--app=` desktop window)

### Run locally

```bash
npm install          # installs `serve` (devDependency)
npm start            # serves the repo root at http://localhost:3000
```

Or double-click **`launch-app.bat`** (Windows). It kills any stale process on port 3000, starts `npx serve -l 3000 .`, and opens an Edge/Chrome app window.

### Demo login (optional)

On `login.html`, demo credentials are `admin@gmail.com` / `admin`. The main app also runs without login (standalone mode).

---

## Project structure

```
.
├── index.html              # App shell (UI + script load order)
├── login.html              # Standalone Firebase login
├── pdf_preview.html        # PDF settings preview
├── manifest.json           # PWA manifest
├── sw.js                   # Cache-flush / self-unregistering service worker
├── firebase.json           # Hosting root = ".", CSP + cache headers
├── package.json            # `npm start` → npx serve .
├── config/
│   └── firebase-config.js  # window.__FIREBASE_CONFIG__ (project grid-945d4)
├── css/
│   ├── style.css           # App styles
│   └── vendor/             # Vendored Bootstrap CSS
├── js/
│   ├── app.js              # Product core (active)
│   ├── stage3d.js          # Three.js stage → window.PixelMap3D
│   ├── aptabase.js         # Analytics → window.Aptabase
│   ├── main.js             # Legacy / unused — do not extend
│   └── vendor/             # three, OrbitControls, bootstrap, jspdf
├── icons/                  # PWA / Store icons (44–512)
├── scripts/                # One-shot extraction helpers (not runtime)
├── public/                 # Stale Firebase starter — NOT the deploy root
├── launch-app.bat          # Desktop launcher
├── launch.vbs              # Silent launcher wrapper
├── TODO.md                 # Open engineering tasks
├── CLAUDE.md               # Guidance for AI-assisted development
└── ENGINEERING.md          # Onboarding, policy, planning, execution, safety
```

---

## Development

### Cache busting

Entry assets are versioned in `index.html` (`css/style.css?v=…`, `js/app.js?v=…`, etc.). Bump the shared `?v=` value when those files change and clients must pick up the new build.

### Encoding

Keep `index.html` and JS as **UTF-8**. The file was previously UTF-16LE; Windows editors can reintroduce that. If characters look corrupted, check with `file index.html`.

### Analytics

Aptabase is initialized in `app.js` with app key `A-US-4851614753`. Events currently tracked: `app_started`, `export_3d_snapshot`. CSP already allow-lists Aptabase endpoints.

### Firebase

- Project ID: `grid-945d4`
- Config: `config/firebase-config.js`
- Hosting public directory: **repo root** (not `public/`)
- CI: `.github/workflows/firebase-hosting.yml`
  - Push to `main` → live Hosting deploy
  - Pull request → preview channel `pr-<n>`
- Required GitHub secrets: `FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID`

> **Note:** Firebase Auth/Firestore/Storage compat SDKs were removed from CDN tags during a local-vendor pass and are not yet re-vendored under `js/vendor/`. Until restored, the app runs in demo mode (`window.__IS_DEMO__ = true`) unless the SDKs are present another way. See `TODO.md` / `ENGINEERING.md`.

---

## Deploy

```bash
# Live (mirrors CI on main)
firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID"

# Preview channel
firebase hosting:channel:deploy pr-<n> --project "$FIREBASE_PROJECT_ID"
```

---

## Open work

Tracked in [`TODO.md`](TODO.md):

- [ ] Add secure Firestore and Storage rules; wire them in `firebase.json`
- [ ] Introduce ESLint + security plugin
- [ ] Restore Firebase compat SDKs via local vendor copies
- [ ] Bridge `app.js` `state` → `stage3d.js` (`window.state` gap)

---

## Docs

| Doc | Audience |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | AI / Claude Code sessions — architecture, commands, conventions |
| [`ENGINEERING.md`](ENGINEERING.md) | Engineers & contractors — structure, policy, planning, execution, safety |
| [`TODO.md`](TODO.md) | Living task tracker |

---

## License / ownership

Private project. All rights reserved by the repository owner unless otherwise stated.
