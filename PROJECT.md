# Project: 3D Stage Multi-Screen Layout

## Architecture
PixelMap is a no-bundler browser application for LED wall planning, stage visualization, and AV engineering.
The 3D Stage Visualizer (`js/stage3d.js`) uses Three.js (r128) to render physical virtual stage setups.
This project extends `js/stage3d.js`, `js/app.js`, and `index.html` from a single monolithic LED wall to a true Multi-Screen 3D Stage Layout:
- **CanvasMap State Ingestion**: Supports both active workspace screens (`state.canvasMapObjects`) and saved multi-screen layouts (`state.savedCanvases[].objects`).
- **3D Spatial Mapping**: Converts 2D pixel coordinates and physical panel dimensions into 3D world meters relative to `layoutCenterX`, preserving inter-screen gaps and grounding each screen on the stage deck.
- **Mesh Hierarchy**: Groups independent screen meshes, cabinet back casings, and ground support stands under `screenGroup`, with recursive disposal preventing GPU memory leaks.
- **Dynamic Texturing**: Generates crisp, individual canvas textures per screen with labels, resolutions, and test patterns without cross-screen distortion.
- **Engineering Telemetry**: Replaces flawed bounding-box approximations with exact per-screen aggregations for power, load, panels, and data ports, displayed on the specs panel and 3D HUD overlay.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Multi-Screen Object Ingestion | Ingest active `state.canvasMapObjects` and `saved.objects` into `js/stage3d.js` via `getActiveScreenObjects()` | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Spatial Coordinates & Centering | Calculate `layoutCenterX`, scale 2D coordinates to 3D meters, ground screens at stageDeckY, auto-target camera to centroid | M1 | ORIGINAL_REQUEST §R2 |
| F3 | Multi-Screen Mesh Decomposition | Iterate over screen objects in `rebuildScreens()` generating distinct front emissive LED panel grids with seams | M2 | ORIGINAL_REQUEST §R1 |
| F4 | Screen Back & Ground Structure | Build modular cabinet casing `createScreenBackStructure` and vertical ground support legs down to deck floor | M2 | ORIGINAL_REQUEST §R1 |
| F5 | Dynamic Individual Textures | Render per-screen textures with screen labels, resolution badges, and test patterns without distortion | M3 | ORIGINAL_REQUEST §R3 |
| F6 | Aggregated AV Telemetry | Calculate exact aggregate power (kW, Amps), panels, area, and ports; display in sidebar card & 3D HUD overlay | M3 | ORIGINAL_REQUEST §R4 |
| F7 | WebGL Memory Hygiene & Presets | Recursive `disposeHierarchy` for geometries/materials/textures, lighting presets (`Show`, `Bright`, `Dark`, `Arena`), dynamic deck/truss sizing | M2 | ORIGINAL_REQUEST Acceptance Criteria |
| F8 | Backward Compatibility & Event Sync | Preserve classic single-screen view and wire CanvasMap mutation events (drop, duplicate, delete) to live 3D updates | M1 & M3 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Suite | Requirement-driven test harness & Tier 1-4 tests (`tests/stage3d-multiscreen.test.js`) publishing `TEST_READY.md` | none | IN_PROGRESS |
| M1 | Data Ingestion & Spatial Coordinates | `getActiveScreenObjects()`, coordinate transformations, proportional spacing, camera auto-framing, CanvasMap event bridges | none | PLANNED |
| M2 | Mesh Decomposition & Structural Casing | Per-screen mesh generation, `createScreenBackStructure`, ground support legs to deck, `disposeHierarchy`, lighting presets | M1 | PLANNED |
| M3 | Dynamic Individual Textures & Telemetry | Per-screen texture generator, labels/badges, exact telemetry math, HUD overlay & specs card updates, single-screen compatibility | M2 | PLANNED |
| M4 | Final E2E Verification & Adversarial Hardening | Pass 100% of E2E tests (Tiers 1-4), execute Tier 5 adversarial testing with Challengers, zero regressions | M0, M3 | PLANNED |

## Interface Contracts

### CanvasMap ↔ Stage3D Data Bridge
- **Function**: `window.PixelMap3D.getActiveScreenObjects()`
  - **Returns**: `Array<ScreenObject>` where each object has:
    ```javascript
    {
      id: string | number,
      x: number, y: number,
      width: number, height: number,
      dataUrl?: string, image?: HTMLImageElement | HTMLCanvasElement,
      details: {
        panelsWidth: number, panelsHeight: number, totalPanels: number,
        resWidth: number, resHeight: number,
        actualWidth: number, actualHeight: number
      }
    }
    ```
- **Function**: `window.PixelMap3D.rebuild()`
  - Triggers asynchronous rebuild of 3D scene from active screens.

### Spatial Transformation Contract
- **Function**: `calculateLayoutMetrics(screens)`
  - **Input**: `Array<ScreenObject>`
  - **Output**:
    ```javascript
    {
      minX: number, maxX: number,
      layoutCenterX: number, layoutCenterY: number,
      spanX_meters: number, spanY_meters: number,
      metersPerPixel: number,
      screens: Array<{
        obj: ScreenObject,
        x_meters: number,
        y_meters: number, // stageDeckY + heightM / 2
        width_meters: number,
        height_meters: number,
        cols: number, rows: number
      }>
    }
    ```

### Texture Generation Contract
- **Function**: `createScreenTexture(screen, index, totalScreens, pattern)`
  - **Input**: `ScreenObject, number, number, string`
  - **Output**: `THREE.CanvasTexture` (unlit, `toneMapped: false`, individual label badge)

### Telemetry Contract
- **Function**: `calculateAggregatedTelemetry(screens)`
  - **Output**:
    ```javascript
    {
      screenCount: number,
      totalPanels: number,
      totalAreaM2: number,
      totalPixels: number,
      maxWatts: number, avgWatts: number,
      amps220: number, amps110: number,
      dataPorts: number,
      totalWeightKg: number
    }
    ```

## Code Layout
- `js/stage3d.js`: Primary 3D stage rendering engine, Three.js scene setup, mesh generation, texture mapping, camera framing, lighting presets, telemetry calculation.
- `js/app.js`: CanvasMap workspace, event listeners, state management, screen object creation and manipulation, trigger bridges to `PixelMap3D`.
- `index.html`: DOM structure for 3D stage tab, AV engineering specs card (`#spec3dScreenCount`, etc.), 3D viewport container, HUD overlay (`#stage3dTelemetryOverlay`).
- `tests/stage3d-multiscreen.test.js`: Comprehensive opaque-box E2E and algorithmic verification suite run via `node --test`.
