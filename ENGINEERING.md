# PixelMap Engineering Guide

Onboarding and operating manual for engineers and contractors working on **PixelMap LED Grid Generator**.

This guide follows a large-company style loop: **Structure → Policy → Planning → Execution → Safety**. Read it once on day one; keep `CLAUDE.md` and `TODO.md` open while coding.

| Doc | Use when |
|---|---|
| [`README.md`](README.md) | Product overview, quick start, deploy |
| [`CLAUDE.md`](CLAUDE.md) | Architecture detail, commands, file map |
| [`TODO.md`](TODO.md) | Current open tasks |
| This file | How we plan, ship, and stay safe |

---

## 1. Structure

### 1.1 What we are building

A **static Progressive Web App** for professional AV / event production:

- LED video-wall **grid & pixel** calculation
- **Canvas 2D** stage layout (CanvasMap) and multi-module Advanced Designer
- **Three.js 3D** stage visualizer with AV engineering specs (power, signal ports, weight)
- **PDF / Resolume** exports
- Optional **Firebase** Auth + Firestore profile + Storage
- **Aptabase** product analytics
- Packaging for **web (Firebase Hosting)** and **desktop / Microsoft Store** (PWA + launchers)

There is no backend application server in this repo. The “backend” is Firebase (Auth, Firestore, Storage, Hosting) plus Aptabase.

### 1.2 System diagram (logical)

```
Browser / PWA / Edge--app window
├── index.html (shell)
├── css/style.css + css/vendor/bootstrap.min.css
├── js/vendor/{jspdf, bootstrap, three, OrbitControls}
├── js/aptabase.js      → window.Aptabase
├── js/stage3d.js       → window.PixelMap3D
└── js/app.js           → product core (state, PixelMap, CanvasMap, exports, auth)
        │
        ├── config/firebase-config.js → window.__FIREBASE_CONFIG__
        ├── Firebase Auth / Firestore / Storage   (when SDK present)
        └── Aptabase US (A-US-4851614753)
```

Hosting serves the **repo root** (`firebase.json` → `"public": "."`). The `public/` folder is a leftover Firebase starter and is **not** the app.

### 1.3 Ownership of code areas

| Area | Primary files | Notes |
|---|---|---|
| App shell / tabs / modals | `index.html`, `css/style.css` | Bootstrap 5 UI |
| Grid / pixel / canvas / PDF | `js/app.js` | Monolith — navigate by section markers |
| 3D + engineering specs | `js/stage3d.js` | Do not duplicate power/port math in `app.js` |
| Analytics | `js/aptabase.js` + call sites | Keep event names stable |
| Auth UI (standalone) | `login.html` | Modular Firebase v12; demo fallback |
| Hosting / CSP / CI | `firebase.json`, `.github/workflows/` | |
| PWA / Store | `manifest.json`, `icons/`, `sw.js`, launchers | `sw.js` only flushes caches today |
| Legacy | `js/main.js` | Unused — do not extend |

### 1.4 Branch & environment model

| Environment | How it is produced |
|---|---|
| Local | `npm start` or `launch-app.bat` → `http://localhost:3000` |
| PR preview | GitHub Actions → Firebase Hosting channel `pr-<n>` |
| Production | Push to `main` → Firebase Hosting live |

Working feature branch in recent history: `n1`. Production branch for CI: `main`. Prefer PRs into `main`; do not force-push `main`.

---

## 2. Policy

### 2.1 Product policy

1. **Standalone-first.** The generator must remain usable without a forced login. Cloud features enhance; they do not gate core calc/export.
2. **No bundler by default.** Stay on vendored static assets unless a migration is explicitly scoped and approved.
3. **UTF-8 only** for HTML/JS/CSS. Never re-save `index.html` as UTF-16LE.
4. **Local vendor preferred** for runtime JS/CSS that previously triggered browser Tracking Prevention (Bootstrap, jsPDF, Firebase compat when restored). CDNs remain allow-listed in CSP for fonts / Firebase platform endpoints.
5. **Cache-bust deliberately.** Bump shared `?v=` on entry assets in `index.html` when shipping JS/CSS users must refresh.
6. **Do not revive `js/main.js`.** New work goes in `app.js` / `stage3d.js` or a clearly justified new module with a `window.*` API.
7. **Engineering formulas are product surface.** Changing power (W/m²), port capacity (px/port), or weight assumptions requires updating UI copy (`spec3d*`) and `updateEngineeringSpecs()` together, and noting the change in the PR.

### 2.2 Security & privacy policy

1. **Client Firebase web config may live in-repo** (`config/firebase-config.js`). Treat it as public. Protect user data with Auth + **Firestore/Storage security rules** (rules files are still an open TODO — treat cloud writes as high risk until rules ship).
2. **Never commit** service-account JSON, `FIREBASE_TOKEN`, private keys, or `.env` with secrets. CI uses GitHub Actions secrets only.
3. **CSP is authoritative.** Any new network origin requires a `firebase.json` CSP update in the same PR.
4. **Demo auth** (`admin@gmail.com` / `admin`, `localStorage.demoAuthUser`) is for local/demo only — not a production identity.
5. **Aptabase** sends product events only (`app_started`, `export_3d_snapshot`). Do not attach PII (emails, project names, file contents) to event props.
6. **`sw.js` must not** start caching authenticated or user-generated content without an explicit offline design review.
7. **Password UI** must remain real `<form>` elements with correct `autocomplete` attributes (recent fix — do not regress).

### 2.3 Code review policy

Every PR should answer:

- What user-visible behavior changes?
- Does CSP / Hosting / `?v=` need updates?
- Does this touch Auth, Firestore, Storage, or exports of user data?
- Is `js/main.js` left untouched?
- Are formulas / labels still consistent?

Prefer small, reversible PRs. Large extractions from `app.js` need a written plan (see Planning).

### 2.4 Dependency policy

- Pin or vendor third-party browser libraries under `js/vendor/` / `css/vendor/`.
- `package.json` stays minimal (`serve` for local dev). Do not add a framework, bundler, or test runner casually — propose it under Planning first.
- Firebase JS major version: `login.html` uses modular **v12.4**; historical app path used compat **10.12.2**. When restoring SDKs, pick one line and document it — do not mix majors on the same page without a reason.

---

## 3. Planning

### 3.1 Intake checklist (before writing code)

1. Restate the user / stakeholder goal in one sentence.
2. Name the primary files you will touch.
3. List **non-goals** for this change.
4. Identify safety impact (Auth, rules, CSP, PII, exports).
5. Decide verification steps (manual UI path, `file` encoding check, Hosting preview, etc.).
6. If the change is multi-day or crosses `app.js` + `stage3d.js` + Hosting, write a short design note in the PR description (problem, options, decision, rollout, rollback).

### 3.2 Change classes

| Class | Examples | Expectation |
|---|---|---|
| **Fix** | Canvas TDZ, SW cache flush, encoding | Focused diff; reproduce → fix → verify |
| **Feature** | New export, 3D control, designer tool | Update UI + JS + `?v=`; consider Aptabase event |
| **Hardening** | Rules, ESLint, CSP, vendor Firebase | Security review; no silent behavior change |
| **Refactor** | Split `app.js`, wire `window.state` | Design note; no behavior change in the same PR if avoidable |
| **Release** | Store packaging, Hosting headers | Checklist below |

### 3.3 Known planned work (seed backlog)

From `TODO.md` and architecture review — prioritize in this order unless product says otherwise:

1. **Restore Firebase compat SDKs** under `js/vendor/` and load them from `index.html` (fixes cloud auth/profile outside demo).
2. **Add `firestore.rules` + `storage.rules`** and wire into `firebase.json`.
3. **Bridge `window.state`** from `app.js` to `stage3d.js` (or replace with an explicit API) so engineering specs track the live layout.
4. **ESLint + security plugin** for `js/app.js`, `js/stage3d.js`, `js/aptabase.js`.
5. Optional: archive/delete `js/main.js` and the stale `public/` starter once confirmed unused.
6. Optional: replace self-unregistering `sw.js` with a real PWA cache strategy only after Store/offline requirements are written down.

### 3.4 Rollout & rollback

- Prefer shipping behind Hosting preview channels on the PR.
- Rollback = redeploy previous Hosting release / revert the merge commit on `main`.
- Because static assets are long-cache immutable, a bad JS ship without a `?v=` bump can stick in browsers — always bump when behavior changes.

---

## 4. Execution

### 4.1 Day-one setup

```bash
git clone https://github.com/SHARUNJOSEPH/v3.git
cd v3
npm install
npm start
# open http://localhost:3000
```

Windows desktop window: run `launch-app.bat`.

Read in order: `README.md` → this file → `CLAUDE.md` → `TODO.md` → skim `index.html` script block and the section markers in `js/app.js`.

### 4.2 Everyday workflow

1. Branch from up-to-date `main` (or agreed integration branch).
2. Implement against the Policy constraints above.
3. Manually verify the affected tabs (PixelMap, Advanced Designer, CanvasMap, 3D Stage, Export, Login/Profile if touched).
4. If you edited entry JS/CSS, bump `?v=` in `index.html`.
5. If you added a network call, update CSP in `firebase.json`.
6. Open a PR; fill the review checklist in §2.3.
7. Use the PR preview channel before merging to `main`.

### 4.3 How to navigate `app.js`

Do **not** read all ~10.5k lines. Search for markers:

- `ensureFirebaseInitialized` / `__IS_DEMO__` — auth bootstrap
- `// ===== Profile: Firestore helpers`
- `// --- Global State and Constants ---`
- `updatePixelMap` / `fitPixelMapToScreen`
- `// --- Advanced Designer`
- `updateCanvasMap` / `redrawCanvasMapObjects`
- `exportCombined` / `exportResolumeXML` / PDF helpers
- `stage3d-tab` / `PixelMap3D` — 3D bridge

For 3D and power/signal: edit `js/stage3d.js` (`updateEngineeringSpecs`, `window.PixelMap3D`).

### 4.4 Verification cheat sheet

| Change type | Minimum verification |
|---|---|
| PixelMap / designer math | Enter known panel grid; confirm resolution & physical size |
| CanvasMap | Add/move/crop object; Reset All; confirm objects preserved/cleared as intended |
| 3D | Open 3D tab; curve / rigging / wings; snapshot download |
| Engineering specs | After `window.state` bridge exists: change screen size → specs update; until then, confirm defaults render |
| PDF / Resolume export | Export sample; open artifact |
| Auth | Email login, Google (non-demo), logout, demo path |
| Hosting / CSP | Preview channel; DevTools console for CSP violations |
| Encoding | `file index.html` → must report UTF-8 |

### 4.5 Release checklist (Hosting / Store)

- [ ] `TODO.md` / PR notes updated
- [ ] `?v=` bumped for touched entry assets
- [ ] CSP reviewed if new origins
- [ ] Preview channel smoke-tested
- [ ] Merged to `main`; Actions deploy green
- [ ] Production smoke: load app, open 3D tab, one export
- [ ] Store packaging (if applicable): `manifest.json` icons, start URL, standalone display

---

## 5. Safety

### 5.1 Threat model (condensed)

| Asset | Risk if mishandled | Control |
|---|---|---|
| User projects / canvases / profiles | Data leak or overwrite | Auth + Firestore/Storage rules (to be added); demo mode isolation |
| Firebase project | Abuse of open rules / storage | Ship rules before relying on cloud in production |
| Auth session | Account takeover | Firebase Auth; 24h demo expiry; no password logging |
| Analytics | PII leakage | No emails/names in Aptabase props |
| Hosted JS | Supply-chain / XSS | Vendored scripts; CSP; `object-src 'none'`; no unbounded `innerHTML` of user input |
| Service worker | Stale or hostile cache | Current SW only unregisters + clears; keep it that way until designed otherwise |

### 5.2 Hard rules (do not violate)

1. Do not weaken CSP to “make it work” without documenting the new origin and why.
2. Do not deploy cloud profile/Storage features as “production-ready” until rules files exist and are reviewed.
3. Do not log passwords, ID tokens, or full Firebase config dumps in Aptabase or console statements left in production paths.
4. Do not introduce `eval`, dynamic `new Function`, or unsanitized HTML injection for user-supplied names/labels.
5. Do not commit secrets. Rotate immediately if a token leaks.
6. Do not leave Tracking Prevention / mixed CDN+local duplicates that load Firebase twice.

### 5.3 Incident response (lightweight)

1. **Bad Hosting ship** — revert commit on `main` or redeploy last known-good Hosting version; bump `?v=` if browsers cached bad JS.
2. **Suspected secret leak** — revoke GitHub/Firebase token; remove from git history if needed; notify repo owner.
3. **Open Firestore/Storage without rules** — disable client writes in app (`__IS_DEMO__` / feature flag) until rules ship; treat as Sev-1 if production data exists.
4. **XSS / script injection report** — reproduce, patch, tighten CSP if a directive was missing; note in PR.

### 5.4 Accessibility & operator safety (product)

- Preserve keyboard-reachable controls on primary workflows where already present.
- 3D WebGL can be GPU-heavy — keep `setPixelRatio` capped (already `Math.min(devicePixelRatio, 2)`); do not remove without measurement.
- Engineering numbers are **estimates** for planning (W/m², port capacity, weight). UI and docs should not imply certified electrical design. If you change copy, keep that caveat clear.

---

## 6. Onboarding 30 / 60 / 90 (suggested)

**First day**

- Run locally; complete one PixelMap → Canvas → 3D → Export path.
- Read Policy + Safety sections; skim `firebase.json` CSP.
- Identify where `__IS_DEMO__` flips and what breaks without Firebase SDKs.

**First week**

- Land a small fix or docs PR.
- Reproduce the `window.state` bridge gap and the missing Firebase vendor gap.
- Walk the CI workflow and a Hosting preview deploy (or watch one).

**First month**

- Own one backlog item from §3.3 (rules, ESLint, state bridge, or Firebase vendor restore).
- Propose any structural refactor with a written plan — no surprise `app.js` splits.

---

## 7. Contacts & sources of truth

| Topic | Source of truth |
|---|---|
| Open tasks | `TODO.md` |
| Architecture for agents/devs | `CLAUDE.md` |
| Product entry / quick start | `README.md` |
| Hosting & CSP | `firebase.json` |
| CI | `.github/workflows/firebase-hosting.yml` |
| Firebase project | `grid-945d4` via `config/firebase-config.js` |
| Analytics app key | `A-US-4851614753` in `js/app.js` |

When docs disagree with code, **code wins** — then update the docs in the same PR.
