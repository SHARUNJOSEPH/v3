# Plan: 3D Curve Rework + Saved CanvasMap Source

**Status:** Proposed — awaiting approval before implementation  
**Date:** 2026-10-24  
**Scope:** `js/stage3d.js`, small bridge in `js/app.js`, `index.html` (3D Screen Visuals UI)  
**Non-goals (this plan):** Firebase SDK restore, CanvasMap magnet align tools, multi-wall stage from many canvases

---

## 1. Structure (what changes)

```
CanvasMap "Saved Output Map List"
        │  state.savedCanvases[] + state.currentCanvasId
        ▼
app.js bridge  →  window.state + PixelMap3D.rebuild() on load/save/select
        ▼
stage3d.js
  ├── resolveActiveSavedCanvas()     // texture + meters from selected saved canvas
  ├── compositeSavedCanvasTexture()  // offscreen 2D composite of saved objects
  ├── createCurvedWallMesh() REWORK  // chord-correct segments, no gaps
  └── flat wall path unchanged (BasicMaterial, sRGB, auto-frame)
```

**Default Screen Visuals:** `saved` (active saved canvas).  
**Optional fallback:** `live` (PixelMap), plus existing colorbars / grid / white.

---

## 2. Policy

1. **3D wall content defaults to the active saved CanvasMap only** (`currentCanvasId`). No unsaved workspace objects unless user picks Live PixelMap.
2. **If no saved canvas / none selected:** show a clear placeholder texture + toast/hint (“Save & Load a CanvasMap to preview in 3D”), not a misleading Live PixelMap.
3. **Physical size** for the wall comes from saved screen object `details.actualWidth` / `actualHeight` (meters) when present; otherwise estimate from object pixel size vs panel density; last resort keep current defaults.
4. **Curved wall must be watertight** at any angle 1–45° for both concave and convex — no visible gaps between cabinet faces.
5. **Keep no-bundler / vendored Three r128** model; no new dependencies.
6. **Bump shared `?v=`** on touched entry assets in the same change.
7. **Do not extend `js/main.js`.**

---

## 3. Planning — root causes

### 3.1 Curve gaps / wrong shape (confirmed)

`createCurvedWallMesh()` today:

- Sizes each face as **arc length** `width / cols`.
- Places faces on a circle of radius `R = width / θ`.
- True **chord** for step `Δθ` is `2 R sin(Δθ/2)` which is **shorter** than arc length → faces don’t meet cleanly (overlap or gaps depending on rotation), especially at higher angles / low panel counts.
- Cabinet backs use a Z offset that ignores convex/concave facing consistently.
- Segment count is tied only to LED panel columns — few columns ⇒ large facets that look “broken.”

### 3.2 Texture source

- Live path reads `#pixelMapCanvas` (PixelMap tab), not CanvasMap saved layouts.
- Saved canvases live in `state.savedCanvases[]` with `{ id, name, thumbnailUrl, objects[] }`.
- Each object can carry `details.actualWidth/Height` (meters) and `dataUrl` — enough to composite a layout texture and derive wall meters.
- `state.currentCanvasId` is set on Save / Load / Duplicate — usable as “active” selection.
- Note: `window.state = state` **is already assigned** in `app.js` (docs that still say otherwise are stale).

---

## 4. Execution — phases

### Phase A — Fix curved wall geometry (standalone, shippable)

**Rework `createCurvedWallMesh`:**

1. Choose segment count `segs = max(panelCols, ceil(θDeg / 3), 16)` so facets stay fine even with few cabinets.
2. `R = width / θ` (arc length preserved as wall width).
3. For each segment `i`:  
   - mid-angle `α`  
   - **chord** `w = 2 R sin(Δθ/2)`  
   - position `(sin(α)·R, 0, (cos(α)·R − R)·sign)`  
   - rotation `y = α`  
   - UV u-range `[i/segs, (i+1)/segs]` on a dedicated geometry (clone material or shared with correct UVs)
4. Cabinet backs: offset along **local −normal** (not world −Z) so concave/convex both sit behind the face.
5. Optional visual: thin joint lines via panelCols overlay (keep current grid-on-face if cheap).
6. Verify auto-frame still uses full curved span (width unchanged).

**Verify:** 0° flat unchanged; 15° / 30° / 45° concave + convex; 4-panel and 16-panel widths; no console errors.

### Phase B — Saved CanvasMap as default 3D source

1. **UI** (`index.html` Screen Visuals):  
   - Add `saved` option: “Saved CanvasMap (Active)” — **selected by default**.  
   - Keep `live` as “Live 2D PixelMap (fallback)”.  
   - Keep colorbars / grid / white.
2. **`getScreenTexture()`**  
   - `saved`: composite active saved canvas objects onto an offscreen canvas (same approach as saved-canvas PNG export); sRGB + BasicMaterial path unchanged.  
   - Empty / no `currentCanvasId`: placeholder “No saved canvas selected”.
3. **Size resolution** in `rebuildScreens` / engineering specs:  
   - Prefer bounds from objects’ `details.actualWidth/Height` and layout positions (convert object px → meters via `actualWidth/resWidth` when available).  
   - Fallback: existing `window.state.actualWidthMeters` only for `live` mode.
4. **Bridge in `app.js`:** after `loadCanvasState`, save confirm, duplicate, delete (if deleted was active) → `PixelMap3D.rebuild()` when 3D already initialized.
5. **Config default:** `testPattern: 'saved'`.

**Verify:** Save two canvases → Load A → 3D shows A; Load B → 3D shows B; Live option still works; placeholder when list empty.

### Phase C — Advancement (optional follow-on)

1. Dropdown on 3D tab listing saved canvases (doesn’t require Load into editor).  
2. True single `BufferGeometry` curved ribbon (one draw call, seamless UV).  
3. Persist per-canvas curve/rigging presets.  
4. Multi-screen stage from multiple objects inside one saved canvas (left/right/center by CanvasMap X layout).

Phase C is **not** required to close the two user requests; schedule after A+B.

---

## 5. Safety

| Risk | Mitigation |
|---|---|
| Large saved canvases → slow texture composite on every rebuild | Composite once per `currentCanvasId` + object revision; reuse texture until change; dispose previous `CanvasTexture` |
| Missing `details` meters → wrong wall size | Explicit fallbacks + show size source in specs label |
| Curve math edge case θ→0 | Keep flat path for `curveAngle === 0` (already) |
| CSP / new origins | None (canvas-only) |
| Breaking Live PixelMap users | Keep as optional dropdown value |

---

## 6. Rollout

1. Implement Phase A → manual curve QA → bump `?v=`.  
2. Implement Phase B → save/load QA → bump `?v=`.  
3. Update `TODO.md` / `CLAUDE.md` (fix `window.state` note; document `saved` texture mode).  
4. Phase C only if requested.

**Rollback:** revert `stage3d.js` / `index.html` / bridge call sites; bump `?v=` again.
