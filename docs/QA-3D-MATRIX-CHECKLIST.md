# PixelMap 3D Stage — QA Matrix Checklist (G3)

**Product:** PixelMap LED Grid Generator  
**Gate:** **G3 — 3D QA** (charter §5.4)  
**Client build under test:** asset `?v=3.6`  
**Primary surfaces:** `js/stage3d.js`, 3D pane in `index.html`, bridge callers in `js/app.js`  
**Owner seats:** Frontend — 3D Stage (**R**), QA / AV SME (**C**), Eng Lead (**A**)  
**Method:** Manual browser matrix + static analysis (no automated browser harness in repo)  
**Date opened:** 2026-10-24  
**Status:** Wave 2 code harden landed — **browser sign-off in progress**

Related: [`TEAM-CHARTER-AND-EXECUTION-PLAN.md`](./TEAM-CHARTER-AND-EXECUTION-PLAN.md) §3.3 · [`PLAN-3d-curve-and-saved-canvas.md`](./PLAN-3d-curve-and-saved-canvas.md) · [`GATE-STATUS.md`](./GATE-STATUS.md)

---

## 1. Structure

| Element | Detail |
|---|---|
| Scope | Rows **3D-01…3D-11** must all Pass for G3 green |
| Out of scope | Phase C multi-object walls; Firebase auth; Hosting deploy; ESLint (→ G4) |
| Environment | Local `npm start` / `npx serve -l 3000 .`; Chrome or Edge; DevTools Console open |
| Asset cache | Confirm Network tab loads `stage3d.js?v=3.6` (hard refresh if stale) |
| API under test | `window.PixelMap3D` — `init`, `rebuild`, `resize`, `setCamera`, `setConfig` / `getConfig`, `notifySavedCanvasChanged`, `refreshSavedCanvasSelect`, `exportSnapshot` |
| Config flags | `curveAngle`, `curveDirection`, `riggingMode`, `flownHeight`, `sideWings`, `testPattern` (default `'saved'`), `showEnvironment` (default `false`), `ambientGlow` |
| Code map | Curve → `createCurvedWallMesh`; support → `createGroundSupportLocal` (gated by `showEnvironment && riggingMode==='ground'`); texture → `getScreenTexture` / `compositeSavedCanvasTexture` / `makePlaceholderTexture`; framing → `frameCameraToScreen` / `setCameraPreset`; env → `applyEnvironmentMode` |

### 1.1 UI control inventory (`index.html`)

| Control | ID / selector | Maps to |
|---|---|---|
| Saved canvas picker | `#stage3dSavedCanvasSelect` | Active texture source (saved) |
| Curvature slider | `#stage3dCurveSlider` (0–45°) | `curveAngle` |
| Concave / Convex | `input[name=stage3dCurveDir]` | `curveDirection` |
| Rigging | `#stage3dRiggingSelect` (`ground` / `flown`) | `riggingMode` |
| Flown height | `#stage3dFlownHeightSlider` | `flownHeight` |
| Side wings / DJ | `#stage3dSideWingsSelect` | `sideWings` |
| Show stage environment | `#stage3dShowEnvironmentToggle` | `showEnvironment` (**required ON to see ground legs**) |
| Screen Visuals | `#stage3dTextureSelect` (`saved` / `live` / patterns) | `testPattern` |
| Ambient glow | `#stage3dAmbientGlow` | `ambientGlow` |
| Camera presets | `.stage3d-camera-btn` (`foh`, `reset`, …) | `setCamera` |
| Auto-rotate / snapshot | `#stage3dAutoRotate`, `#stage3dSnapshotBtn` | ancillary |

---

## 2. Policy

1. **G3 is manual.** A row Passes only when Pass criteria are met **and** evidence is attached (screenshot and/or console note).
2. **No false green on ground support.** Product default is LED-only (`showEnvironment: false`). For **3D-01 / 3D-10 ground paths**, QA **must** enable **Show stage environment** before judging legs/feet.
3. **Saved CanvasMap is default** (`testPattern: 'saved'`). Live PixelMap is fallback only (3D-07).
4. **Curve watertight 1–45°** concave and convex; θ→0 stays on flat path (`curveAngle === 0`).
5. **Do not edit `js/stage3d.js` from the QA seat** while Wave 2 engineer is hot-fixing; file bugs as `3D-xx`.
6. **Console must stay clean** for 3D-11: no uncaught exceptions; no rebuild/remove spam under normal interaction.
7. **UTF-8 / CSP / secrets** unchanged by this checklist.
8. **Sign-off authority:** 3D seat or QA / AV SME; TL records Gate in `GATE-STATUS.md`.

---

## 3. Planning

### 3.1 Preconditions (all rows)

- [ ] App served locally; open 3D Stage tab (`#stage3d-tab`) so `PixelMap3D.init` runs  
- [ ] DevTools Console filtered to Errors + Warnings  
- [ ] Confirm `?v=3.6` on `js/stage3d.js`  
- [ ] PixelMap / CanvasMap have at least one usable layout for texture rows (except 3D-06)

### 3.2 Suggested run order

1. 3D-06 → 3D-05 → 3D-07 → 3D-08 (texture path)  
2. 3D-01 → 3D-02 → 3D-10 (rigging / wings; env ON for ground)  
3. 3D-03 → 3D-04 (curve sweep)  
4. 3D-09 (framing)  
5. 3D-11 (console soak across the session)

### 3.3 Bug filing

Title: `3D-NN: <short failure>`. Include build `?v=`, OS/browser, steps, expected vs actual, screenshot, console snippet.

---

## 4. Execution — matrix rows

### 3D-01 — Flat wall, ground support

| | |
|---|---|
| **Code** | `createScreenPanelMesh` → `createGroundSupportLocal`; flags `curveAngle=0`, `riggingMode='ground'`, **`showEnvironment=true`** |
| **Preconditions** | Flat (slider 0); Rigging = Ground; **Show stage environment ON** |
| **Steps** | 1) Set controls. 2) Orbit under / behind wall. 3) Confirm uprights + outrigger feet. |
| **Pass** | Legs/feet entirely behind LED face (`z` clearance); no poke-through of face plane |
| **Evidence** | Screenshot behind/under wall; console clean |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-02 — Flat wall, flown

| | |
|---|---|
| **Code** | `rebuildScreens` `baseY = flownHeight`; support skipped when `riggingMode !== 'ground'` |
| **Preconditions** | Flat; Rigging = Flown; set flown height mid-range |
| **Steps** | 1) Switch to Flown. 2) Adjust `#stage3dFlownHeightSlider`. 3) Confirm no ground stacks. |
| **Pass** | No ground legs; trim height tracks slider; wall readable |
| **Evidence** | Screenshot side view at two heights |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-03 — Concave 15° / 30° / 45°

| | |
|---|---|
| **Code** | `createCurvedWallMesh(..., 'concave')`; `totalAngleRad = max(0.001, …)` |
| **Preconditions** | Direction = Concave; env optional |
| **Steps** | Set slider to 15, then 30, then 45; orbit front and ends. |
| **Pass** | Continuous ribbon (no gaps); normals toward audience; no console errors |
| **Evidence** | Three screenshots (or one montage); console note |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-04 — Convex 15° / 30° / 45°

| | |
|---|---|
| **Code** | `createCurvedWallMesh(..., 'convex')` — separate pose math (no shared sign flip) |
| **Preconditions** | Direction = Convex |
| **Steps** | Same angle sweep as 3D-03. |
| **Pass** | No fold/flip; continuous ribbon; backs behind local face |
| **Evidence** | Three screenshots; console note |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-05 — Saved CanvasMap default

| | |
|---|---|
| **Code** | `testPattern:'saved'`; `compositeSavedCanvasTexture`; `notifySavedCanvasChanged` from `app.js` |
| **Preconditions** | ≥1 saved CanvasMap; Screen Visuals = Saved CanvasMap (Active) |
| **Steps** | Save layout A → open 3D → confirm A. Load/select B → confirm B (picker or Load + bridge). |
| **Pass** | 3D shows active saved layout, not stale live PixelMap |
| **Evidence** | Screenshot A then B; note picker value |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-06 — No saved canvas

| | |
|---|---|
| **Code** | `makePlaceholderTexture(...)` when none selected / list empty |
| **Preconditions** | Empty saved list **or** no selection path that yields a canvas |
| **Steps** | Open 3D with no saved canvases (or clear selection per product behavior). |
| **Pass** | Clear placeholder messaging — **not** a fake live PixelMap |
| **Evidence** | Screenshot of placeholder face + picker empty state |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-07 — Live PixelMap fallback

| | |
|---|---|
| **Code** | `getScreenTexture` when `testPattern==='live'`; animate `needsUpdate` |
| **Preconditions** | `#pixelMapCanvas` has content |
| **Steps** | Switch `#stage3dTextureSelect` → Live 2D PixelMap; change PixelMap; observe 3D. |
| **Pass** | Dropdown switch works; live updates without crash |
| **Evidence** | Screenshot live vs saved; console clean |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-08 — Colors vs source

| | |
|---|---|
| **Code** | `MeshBasicMaterial` + `toneMapped:false`; sRGB via `applyTextureColorSpace` / renderer encoding |
| **Preconditions** | Known colorful source (saved or live) |
| **Steps** | Compare 2D source vs 3D face; nudge `#stage3dAmbientGlow` if needed. |
| **Pass** | Not washed out / crushed dark relative to source |
| **Evidence** | Side-by-side screenshot 2D vs 3D |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-09 — Auto-frame small & large walls

| | |
|---|---|
| **Code** | `frameCameraToScreen`; `setCameraPreset('foh'|'reset'|…)` |
| **Preconditions** | Ability to exercise small and large wall meters (panel count / saved size) |
| **Steps** | Load small wall → FOH / Reset. Load large wall → FOH / Reset. |
| **Pass** | Wall readable in frame; presets land sensibly (distance clamp ~4–28 m) |
| **Evidence** | Screenshots small + large for FOH and Reset |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-10 — Wings / DJ

| | |
|---|---|
| **Code** | `sideWings` `'wings'|'dj'`; wing meshes `withSupport=false`; main wall support still env-gated |
| **Preconditions** | Side wings ≠ off; for ground check on main: env ON + ground |
| **Steps** | Enable Wings; then DJ. Inspect main vs sides. |
| **Pass** | No extra ground stacks on wings/DJ; main wall OK when ground+env |
| **Evidence** | Screenshot wide stage; note `wingAngle` is config-fixed (35°) |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

### 3D-11 — Console hygiene

| | |
|---|---|
| **Code** | `rebuildScreens` `if (!scene) return` (~669); guarded `scene.remove` on known groups; θ floor |
| **Preconditions** | Full session covering rows above |
| **Steps** | Rapidly toggle curve, rigging, texture, env, wings; switch tabs; resize window. |
| **Pass** | No uncaught curve errors; no pathological `scene.remove` / rebuild console spam |
| **Evidence** | Console export or annotated screenshot after soak |
| **Owner** | 3D / QA |
| **Result** | ☐ Pass ☐ Fail ☐ Blocked — notes: ________ |

---

## 5. Safety

| Risk | Mitigation |
|---|---|
| Judging ground support with env OFF | Policy §2 + 3D-01 precondition — **toggle ON** |
| Stale cached `?v=` | Hard refresh; verify Network `3.5` |
| Texture cache shallow key (id + object count + ids, not `dataUrl`) | After re-save same structure, force picker change or rely on `notifySavedCanvasChanged`; call out Fail on 3D-05 if stale |
| GPU thrash from frequent `rebuild` without mesh dispose | Track under 3D-11; engineer owns dispose fix if Med finding confirmed in browser |
| QA editing `stage3d.js` during Wave 2 | Docs-only from this seat; bugs as `3D-xx` |
| Shipping G3 green without evidence | Sign-off block requires named signer + date |

### 5.1 Static findings (read-only pass, 2026-10-24)

Do **not** treat as code ownership for the QA seat — hand to Wave 2 3D engineer.

| Sev | Location (approx) | Finding | Matrix impact |
|---|---|---|---|
| **Med** | `stage3d.js` ~671, 842–950; frequent `PixelMap3D.rebuild()` from `app.js` | `scene.remove(screenGroup)` without disposing child geometries/materials → possible GPU thrash / leak under heavy PixelMap updates | **3D-11** |
| **Med** | `stage3d.js` ~864, 953; config `showEnvironment: false` | Ground supports suppressed unless env toggle ON — easy false Fail on **3D-01** | **3D-01**, **3D-10** |
| **Low** | ~603–605 | Saved texture cache key omits content/`dataUrl` — re-save with same ids/count may look stale until notify/picker | **3D-05** |
| **Low** | ~1174 vs init | `bindDomEvents` calls `applyEnvironmentMode` before `scene` exists — guarded (`if (!scene) return` ~141); safe | — |
| **Low** | ~883 | θ divide-by-zero mitigated (`Math.max(0.001, …)`); flat path skips curve builder | **3D-03/04/11** |
| **Low** | ~678–679 | NaN/≤0 wall meters clamped to defaults | **3D-09** |
| **Info** | Named-group `scene.remove` paths | Not unguarded arbitrary removes | **3D-11** |
| **Info** | Async image load → rebuild | Placeholder→real double rebuild possible (flicker) | **3D-05** |

**Not found:** unguarded bare `scene.*` outside init/guarded builders; θ=0 divide crash path.

---

## 6. G4 Lint verification (companion — Gate G4)

Wave 3 (Platform) landed config + scripts. Prefer full ESLint after `npm install`; zero-dep fallback covers Gate G4 when registry is unavailable.

### 6.1 Definition of “lint clean” (once Wave 3 lands)

1. `package.json` defines `"lint"` → `scripts/run-lint.js` over `js/stage3d.js`, `js/aptabase.js`, `js/app.js` (ESLint + `eslint-plugin-security` when installed; else `scripts/security-lint.js`).  
2. From repo root: **`npm run lint`** exits **0**.  
3. Charter allows an **agreed warn baseline** on `app.js` volume — **accepted 2026-10-24:** 0 errors; `innerHTML` assignment warns on `app.js` (fallback count: 16). `stage3d.js` / `aptabase.js`: 0/0. Full plugin counts TBD after `npm install`.  
4. CI runs lint on PR and fails on error severity once baseline is clean (charter §4.4).

### 6.2 Minimal verification script (manual / CI)

```bash
# From repo root
npm install          # pulls eslint + eslint-plugin-security (needs registry access)
npm run lint         # must exit 0 (or match agreed warn baseline)
# Offline / no node_modules/eslint:
npm run lint:security
```

Optional smoke (no browser automation required):

```bash
# Static presence checks — does not replace G3 browser matrix
test -f js/stage3d.js && test -f js/aptabase.js && test -f js/app.js
grep -n "if (!scene) return" js/stage3d.js
grep -n "createCurvedWallMesh" js/stage3d.js
```

QA seat does **not** author ESLint config (avoid conflict with Platform Wave 3).

---

## 7. G3 Sign-off

| Field | Value |
|---|---|
| Build | `?v=3.5` (reconfirm at sign-off; bump if Wave 2 hotfixes land) |
| Rows Pass | 3D-01 __ / 3D-02 __ / 3D-03 __ / 3D-04 __ / 3D-05 __ / 3D-06 __ / 3D-07 __ / 3D-08 __ / 3D-09 __ / 3D-10 __ / 3D-11 __ |
| Failures filed | |
| Static findings accepted / deferred | |
| Signer (3D or QA) | |
| Date | |
| TL acknowledged in `GATE-STATUS.md` | ☐ |

**G3 = GREEN** only when all 11 rows Pass (or Failures fixed and re-run) and this block is signed.

---

## 8. Suggested next actions (after Wave 2 + Wave 3 agents finish)

1. 3D engineer triages **Med** static findings (dispose-on-rebuild; document env toggle in any user-facing tip if needed).  
2. QA / product owner runs this checklist in browser; paste evidence links into Results.  
3. Platform lands `npm run lint`; run §6.2; mark **G4** in `GATE-STATUS.md`.  
4. Platform/human: `firebase deploy --only firestore:rules,storage` for **G2**.  
5. TL: G5 preview smoke only after G1–G4 green.
