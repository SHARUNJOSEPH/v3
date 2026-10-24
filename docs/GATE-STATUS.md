# PixelMap Ready Gates — Status Tracker

**Product:** PixelMap LED Grid Generator  
**Charter:** [`TEAM-CHARTER-AND-EXECUTION-PLAN.md`](./TEAM-CHARTER-AND-EXECUTION-PLAN.md) §5.4  
**Client build:** asset `?v=3.6`  
**Last updated:** 2026-10-24 (Eng Lead — Waves 2+3 landed; gates reconciled)  
**“Ready” rule:** announce only when **G1–G5** are green with evidence below.

---

## Scoreboard

| Gate | Name | Status | Evidence (current) | Blocker / next |
|---|---|---|---|---|
| **G1** | Cloud SDK | **GREEN (code)** | P0-1 done: Firebase compat **10.12.2** under `js/vendor/`; loaded from `index.html` (`TODO.md`). Hosting-preview auth smoke still recommended at G5. | Optional: confirm Auth not stuck in `__IS_DEMO__` solely for missing SDK on preview |
| **G2** | Rules | **YELLOW** | P0-2 authored: `firestore.rules` + `storage.rules` wired in `firebase.json`; see [`P0-2-RULES-DEPLOY.md`](./P0-2-RULES-DEPLOY.md). **Deploy to project still required.** | Human/CI: `firebase deploy --only firestore:rules,storage` + negative tests documented |
| **G3** | 3D QA | **YELLOW (code harden done; browser unsigned)** | Wave 2 (`?v=3.6`): dispose-on-rebuild, spotlight target cleanup, rebuild signature skip, live-only PixelMap→3D bridge, curve θ/NaN guards, stale picker clear on delete. Static matrix 3D-01…10 PASS / 3D-11 FIXED. Checklist: [`QA-3D-MATRIX-CHECKLIST.md`](./QA-3D-MATRIX-CHECKLIST.md). | Product owner: browser sign-off of 3D-01…3D-11 (env ON for ground rows) |
| **G4** | Lint | **YELLOW (landed; install pending)** | Wave 3: `eslint.config.mjs`, `npm run lint` / `lint:security` / `lint:eslint`, fallback `scripts/security-lint.js`. Fallback run **0 errors / 16 warns** (`app.js` `innerHTML` baseline). Registry egress blocked full `npm install` in agent VM. | Host: `npm install` then `npm run lint`; paste ESLint plugin counts; CI later |
| **G5** | Release | **BLOCKED** | Needs G1–G4 green + Hosting preview smoke + `main` Actions green + production smoke (charter §4.6). | Unblock after G2 deploy, G3 browser sign-off, G4 npm install confirmation |

**Headline:** G1 green; G2 deploy pending; G3 code harden at `?v=3.6` (browser sign-off pending); G4 lint exit 0 via fallback (npm install pending); G5 blocked.

---

## Wave alignment

| Wave | Focus | Status (2026-10-24) |
|---|---|---|
| 0 Kickoff | Freeze ready criteria | Complete (charter + staffing) |
| 1 Platform spine | P0-1, P0-2 | P0-1 done; P0-2 authored/wired — **deploy pending** |
| 2 3D QA | Matrix + hotfix | Code harden shipped `?v=3.6`; browser matrix sign-off pending |
| 3 Lint | P1-1 ESLint | Config + scripts landed; fallback lint 0/16; `npm install` still required for full ESLint |
| 4 Cleanup / Phase C | Optional | Partial Phase C picker done; multi-object + `main.js`/`public/` still open |
| 5 RC → main | Hosting / Store | Blocked on G1–G4 |

---

## Human / manual sign-off still required

1. **G2:** Deploy rules to Firebase project; record negative-test results (unauth write denied; user A ↛ user B).  
2. **G3:** Full browser run of [`QA-3D-MATRIX-CHECKLIST.md`](./QA-3D-MATRIX-CHECKLIST.md) on `?v=3.6` with screenshots/console evidence; complete sign-off block. Remember **Show stage environment ON** for ground-support rows.  
3. **G4:** Run `npm install` then `npm run lint`; confirm exit 0. Fallback baseline (2026-10-24): **0 errors / 16 `innerHTML` warns on `app.js`** (accepted). Full ESLint plugin counts TBD after install.  
4. **G5:** Hosting preview smoke (auth, PixelMap, CanvasMap save/load, 3D spot-check, one PDF export); production smoke after merge.

---

## Doc index

| Path | Role |
|---|---|
| `docs/QA-3D-MATRIX-CHECKLIST.md` | G3 row procedures + static findings + G4 lint definition |
| `docs/P0-2-RULES-DEPLOY.md` | G2 deploy instructions |
| `docs/PLAN-3d-curve-and-saved-canvas.md` | 3D design (A/B done; C optional) |
| `TODO.md` | Living task checkboxes |
