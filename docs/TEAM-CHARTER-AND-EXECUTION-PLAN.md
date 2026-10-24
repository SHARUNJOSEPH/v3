# PixelMap Internal Team Charter & Execution Plan

**Product:** PixelMap LED Grid Generator  
**Branch (active):** `n1` → promote via PR to `main` (CI Hosting deploy)  
**Current client build:** asset `?v=3.1`  
**Status:** Charter ready for staffing / kickoff — **not** an authorization to ship until Gates below pass  
**Date:** 2026-10-24  
**Owner of this doc:** Eng Lead (PixelMap) — update in the same PR that changes scope or owners

---

## 0. Mission

Stand up a small internal squad that **closes the open backlog**, **hardens the 3D Stage Visualizer**, and **makes PixelMap production-ready** for Firebase Hosting + Microsoft Store packaging — with clear Structure, Policy, Planning, Execution, and Safety.

**Definition of “ready”:** a named release candidate on `main` where (1) cloud auth works outside demo mode with security rules, (2) 3D Stage QA checklist is green, (3) lint/CSP/UTF-8 gates pass, (4) Hosting preview smoke is signed off.

---

## 1. Structure

### 1.1 Squad shape (recommended 4 seats; 2 people can dual-hat)

| Seat | Focus | Primary files / surfaces |
|---|---|---|
| **Eng Lead / TL** | Scope, sequencing, PR quality, release gate | `TODO.md`, `docs/*`, `CLAUDE.md`, `ENGINEERING.md` |
| **Frontend — Core App** | `app.js` CanvasMap / PixelMap / exports / auth UI | `js/app.js`, `index.html`, `css/style.css` |
| **Frontend — 3D Stage** | Three.js stage, curve, support, textures | `js/stage3d.js`, 3D pane in `index.html` |
| **Platform / Security** | Firebase SDK restore, rules, CSP, ESLint, CI | `js/vendor/`, `firebase.json`, `firestore.rules`, `storage.rules`, `.github/workflows/`, ESLint config |

Optional part-time: **QA / AV SME** (manual matrix for LED sizes, curve, power specs copy).

### 1.2 RACI (high level)

| Workstream | TL | Core | 3D | Platform |
|---|---|---|---|---|
| 3D Stage harden + Phase C | A | C | **R** | C |
| Firebase compat SDK restore | A | C | I | **R** |
| Firestore / Storage rules | A | C | I | **R** |
| ESLint + security plugin | A | C | C | **R** |
| Legacy cleanup (`main.js`, `public/`) | A | **R** | I | C |
| Hosting / Store release | **R** | C | C | C |
| Docs / charter updates | **R** | C | C | C |

R = Responsible, A = Accountable, C = Consulted, I = Informed.

### 1.3 Cadence

- **Daily (async):** update `TODO.md` checkboxes + blocker note in PR / chat.  
- **Twice weekly (30 min):** TL walkthrough of open PRs and Gate status.  
- **Release train:** feature PRs → `n1` (or short-lived feature branches) → PR to `main` → Hosting preview → live.

### 1.4 Repo map (do not invent new architecture)

See `CLAUDE.md` / `ENGINEERING.md`. Non-negotiables: no bundler by default; do not extend `js/main.js`; Hosting root = repo `.` (not `public/`); bump shared `?v=` when entry JS/CSS change.

---

## 2. Policy

1. **Standalone-first.** Core calc/export works without login; cloud is enhancement.  
2. **Security before “cloud ready.”** No claiming production cloud profile/Storage until `firestore.rules` + `storage.rules` are reviewed and wired.  
3. **Vendor Firebase locally** (same Tracking Prevention rationale as Bootstrap/jsPDF). Prefer compat line that matches historical app (`10.12.x`) unless Platform documents a deliberate upgrade; do not mix majors on `index.html`.  
4. **CSP is a gate.** Any new origin updates `firebase.json` in the same PR.  
5. **UTF-8 only** for HTML/JS/CSS.  
6. **3D product rules (already decided):**  
   - Default Screen Visuals = **Saved CanvasMap (Active)**; Live PixelMap = fallback.  
   - Curved walls must stay watertight 1–45° concave **and** convex.  
   - Ground support must stay entirely behind the LED face.  
7. **No drive-by refactors** of the `app.js` monolith without a written plan.  
8. **Secrets:** never commit `FIREBASE_TOKEN`, service accounts, or private keys. Client web config may stay public.  
9. **Aptabase:** no PII in event props.  
10. **Definition of Done** for every PR (section 5.3) is mandatory.

---

## 3. Planning

### 3.1 Current state (as of `?v=3.1`)

**Done (recent):**

- Eng doc pack (`CLAUDE.md`, `README.md`, `ENGINEERING.md`)  
- 3D: pre-init guards, visibility/auto-frame, color (unlit + sRGB), saved-canvas default source, chord curve, convex pose fix, ground support behind face  
- Local Firebase init 404 silenced; password-form a11y username; MediaPro regex fix  

**Open (from `TODO.md`):**

| ID | Item | Sev | Owner seat |
|---|---|---|---|
| P0-1 | Restore Firebase Auth/Firestore/Storage **compat SDKs** under `js/vendor/` + load from `index.html` | **P0** | Platform |
| P0-2 | Add `firestore.rules` + `storage.rules`; wire in `firebase.json` | **P0** | Platform |
| P1-1 | ESLint + `eslint-plugin-security` (or equivalent) for `js/app.js`, `js/stage3d.js`, `js/aptabase.js` | **P1** | Platform |
| P1-2 | 3D Stage **QA harden** (regression matrix below) + fix any residual curve/support/texture bugs | **P1** | 3D + QA |
| P2-1 | Optional Phase C: 3D saved-canvas picker without Load; multi-object walls | **P2** | 3D |
| P2-2 | Archive/delete unused `js/main.js` + stale `public/` starter | **P2** | Core |
| P2-3 | Sync stale notes in older plans (e.g. Phase A/B status already done) | **P2** | TL |

### 3.2 Workstreams & phases

```
Wave 0  Kickoff + freeze “ready” criteria          [TL]           0.5 day
Wave 1  Platform security spine (P0-1, P0-2)       [Platform]     2–4 days
Wave 2  3D readiness QA + hotfix buffer            [3D]           1–2 days
Wave 3  Lint gate (P1-1)                           [Platform]     1–2 days
Wave 4  Cleanup + Phase C (optional)               [Core / 3D]    as capacity
Wave 5  Release candidate → main → Hosting/Store   [TL + all]     1 day
```

Waves 1 and 2 may run **in parallel** after kickoff. Wave 5 is blocked on P0-1 + P0-2 + 3D QA green.

### 3.3 3D Stage QA matrix (must be green for “ready”)

| # | Case | Pass criteria |
|---|---|---|
| 3D-01 | Flat wall, ground support | Legs/feet only behind face; no poke-through |
| 3D-02 | Flat wall, flown | No ground stacks; trim height OK |
| 3D-03 | Concave 15° / 30° / 45° | Continuous ribbon; normals toward audience |
| 3D-04 | Convex 15° / 30° / 45° | No fold/flip; continuous ribbon |
| 3D-05 | Saved CanvasMap default | After Save+Load, 3D shows that layout (not stale PixelMap) |
| 3D-06 | No saved canvas | Clear placeholder — not a fake live map |
| 3D-07 | Live PixelMap fallback | Dropdown switch works |
| 3D-08 | Colors vs source | Not washed out / dark (BasicMaterial + sRGB) |
| 3D-09 | Auto-frame small & large walls | Wall readable; FOH/Reset OK |
| 3D-10 | Wings / DJ | No extra ground stacks on wings; main wall OK |
| 3D-11 | Console | No `scene.remove` / rebuild spam; no uncaught curve errors |

### 3.4 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Shipping cloud without rules | Wave 5 blocked on P0-2; demo-mode fallback remains |
| Firebase major mismatch (`login.html` v12 modular vs app compat) | Platform picks one story; document in PR |
| Large saved canvases → slow 3D texture | Keep texture cache key; cap composite size (already 2048) |
| `app.js` merge conflicts | Small PRs; avoid drive-by edits outside owned markers |
| Stale browser cache | Always bump `?v=` with entry asset changes |

---

## 4. Execution

### 4.1 Kickoff checklist (Wave 0)

- [ ] Assign named humans to the four seats (or dual-hat list)  
- [ ] Confirm this charter as source of truth; link from `TODO.md`  
- [ ] Create tracking issues / PR titles matching IDs `P0-1` …  
- [ ] Agree release target date (or “when Gates green”)  
- [ ] Confirm GitHub secrets present: `FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID`

### 4.2 Wave 1 — Platform security spine

**P0-1 Firebase SDK restore**

1. Vendor compat builds under `js/vendor/` (app, auth, firestore, storage) — same major as previously used on `index.html` unless upgrade is explicit.  
2. Load scripts in `index.html` **before** `js/app.js` (sync or defer-ordered).  
3. Confirm `config/firebase-config.js` still initializes; local host still skips `/__/firebase/init.js`.  
4. Manual: email login, Google (if enabled), profile load/save path when not demo.  
5. Update CSP only if new origins appear (prefer local vendor → no CSP change).

**P0-2 Rules**

1. Author least-privilege `firestore.rules` (users can read/write only their profile/docs).  
2. Author `storage.rules` (user-scoped paths only).  
3. Wire in `firebase.json`; deploy rules via CI or documented CLI step.  
4. Threat review with TL (15 min).  
5. Test: unauthenticated write denied; user A cannot read user B.

### 4.3 Wave 2 — 3D readiness

1. Run full 3D QA matrix; file bugs as `3D-xx` against failing rows.  
2. Hotfix only regressions; no Phase C scope creep unless TL pulls it in.  
3. Update `docs/PLAN-3d-curve-and-saved-canvas.md` status if needed.

### 4.4 Wave 3 — Lint

1. Add ESLint + security plugin; scripts in `package.json` (`lint`).  
2. Start with `js/stage3d.js`, `js/aptabase.js`, then carve `app.js` (warn-first if volume is high).  
3. CI: run lint on PR (fail on error severity once baseline is clean).

### 4.5 Wave 4 — Optional cleanup / Phase C

- Delete or quarantine `js/main.js` after grep proves zero references.  
- Remove or ignore stale `public/` starter.  
- Phase C only if product asks: picker UI + multi-object stage layout.

### 4.6 Wave 5 — Release

1. PR `n1` → `main` (or squash series).  
2. Hosting preview channel smoke (auth, PixelMap, CanvasMap save/load, 3D matrix spot-check, one PDF export).  
3. Merge; confirm Actions deploy green.  
4. Production smoke; bump Store package if needed (`manifest.json` / icons unchanged unless required).  
5. Tag release notes (3D fixes + cloud restore + rules).

### 4.7 Command cheat sheet

```bash
npm start                          # local serve
npx serve -l 3000 .                # match launch-app.bat
# after lint lands:
npm run lint                       # (to be added in Wave 3)
firebase deploy --only hosting
firebase deploy --only firestore:rules,storage
```

---

## 5. Safety

### 5.1 Threat priorities for this squad

1. **Open Firestore/Storage** → data abuse → P0-2 before “ready”.  
2. **Missing Auth SDK** → silent demo mode in production → P0-1.  
3. **CSP bypass “to make it work”** → XSS surface → Policy §2.4.  
4. **PII in Aptabase** → privacy → Policy §2.9.  
5. **Service worker caching authenticated content** → keep current unregister/flush behavior until offline design exists.

### 5.2 Incident triggers (during rollout)

| Trigger | Action |
|---|---|
| Rules misconfigured / open write | Disable cloud writes (`__IS_DEMO__` or feature flag); fix rules; redeploy |
| Bad Hosting JS | Revert `main` / redeploy previous; bump `?v=` |
| Token leak | Rotate GitHub/Firebase token immediately |

### 5.3 PR Definition of Done

- [ ] Linked backlog ID (`P0-1`, `3D-04`, …)  
- [ ] Behavior described (user-visible)  
- [ ] `?v=` bumped if entry assets changed  
- [ ] CSP reviewed if network changed  
- [ ] Manual QA notes (which matrix rows / auth paths)  
- [ ] No secrets committed  
- [ ] Docs/`TODO.md` updated when closing an item  
- [ ] UTF-8 confirmed if HTML touched  

### 5.4 Ready Gates (all required)

| Gate | Evidence |
|---|---|
| **G1 Cloud SDK** | Auth works on Hosting preview; not stuck in `__IS_DEMO__` solely for missing SDK |
| **G2 Rules** | Rules files deployed; negative tests documented |
| **G3 3D QA** | Matrix 3D-01…3D-11 signed by 3D seat or QA |
| **G4 Lint** | `npm run lint` clean (or agreed warn baseline) on touched paths |
| **G5 Release** | Preview smoke + `main` Actions green + production smoke |

**“Ready” announcement** only when G1–G5 are checked in this doc’s checklist copy (or linked issue).

---

## 6. Staffing (kickoff 2026-10-24)

| Seat | Name | Backup |
|---|---|---|
| Eng Lead / TL | Claude (dual-hat) | Product owner (user) |
| Frontend — Core App | Claude (as needed) | Product owner |
| Frontend — 3D Stage | Claude (as needed) | Product owner |
| Platform / Security | Claude (dual-hat) | Product owner |
| QA / AV SME (optional) | Product owner (user) | |

**Product owner / reviewer:** user (repo `SHARUNJOSEPH/v3`)  
**Target ready date:** when Gates G1–G5 green (Wave 1 in progress)  
**Escalation:** product owner / repo admin

**Wave status:** Wave 0 complete → Wave 1: **P0-1 done** + **P0-2 rules authored/wired** → **deploy rules to project**; Wave 2 (3D QA checklist) / Wave 3 (lint) in progress. Live scoreboard: [`docs/GATE-STATUS.md`](./GATE-STATUS.md). G3 matrix procedures: [`docs/QA-3D-MATRIX-CHECKLIST.md`](./QA-3D-MATRIX-CHECKLIST.md).

---

## 7. References

| Doc | Role |
|---|---|
| [`TODO.md`](../TODO.md) | Living task checklist |
| [`CLAUDE.md`](../CLAUDE.md) | Architecture for agents/devs |
| [`ENGINEERING.md`](../ENGINEERING.md) | Onboarding + standing policy |
| [`README.md`](../README.md) | Quick start / deploy |
| [`docs/PLAN-3d-curve-and-saved-canvas.md`](./PLAN-3d-curve-and-saved-canvas.md) | 3D curve + saved-canvas design (A/B done; C optional) |

---

## 8. Immediate next actions (after charter approval)

1. Fill staffing table (§6).  
2. Open Wave 1 PR skeleton for **P0-1** (vendor Firebase).  
3. Draft rules files offline for **P0-2** review.  
4. 3D seat runs matrix once on `?v=3.1` and files any residual bugs.  
5. TL schedules Wave 5 only after G1–G4.
