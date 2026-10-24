# E2E Test Infra: 3D Stage Multi-Screen Layout

## Test Philosophy
- Opaque-box, requirement-driven.
- Derived strictly from `ORIGINAL_REQUEST.md` and user specifications, not internal implementation quirks.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Test Runner Architecture
- **Framework**: Node.js built-in native test runner (`node:test` and `node:assert`).
- **Command**: `node --test tests/stage3d-multiscreen.test.js`
- **Zero external dependencies**: Guaranteed zero build/bundler friction, cross-platform compatibility.
- **Pass/Fail Semantics**: Exit code 0 on all tests passing.

## Test Tiers & Coverage Goals

### Tier 1 - Feature Coverage (≥5 per feature)
- F1: Multi-screen ingestion (reading canvasMapObjects, reading saved.objects, fallback handling, empty screens, mixed formats).
- F2: Spatial coordinates (layoutCenterX centering, 2D to 3D scaling, proportional gaps, stageDeck grounding, camera centroid).
- F3: Mesh decomposition (separate mesh creation, panel grid cols/rows calculation, front emissive basic material, group hierarchy, name/id tracking).
- F4: Structural casing & legs (createScreenBackStructure generation, unistrut grid, ground legs extending to Y=0, multiple support posts, material separation).
- F5: Dynamic individual textures (per-screen canvas texture creation, label badge rendering, resolution text, test pattern isolation, video/canvas mapping).
- F6: Aggregated telemetry (panel summation, emissive area calculation, max/avg power watts, 110V/220V amperage, data port counting, total weight).
- F7: Memory hygiene & presets (recursive disposal of geometry/material/texture, zero leak under rapid rebuilds, lighting presets Show/Bright/Dark/Arena, dynamic stage deck/truss scaling).
- F8: Backward compatibility & events (single screen classic view, CanvasMap add/remove events triggering rebuild, preserve single screen centering at X=0, legacy saved layout migration).

### Tier 2 - Boundary & Corner Cases (≥5 per feature)
- Zero active screens (graceful empty stage handling).
- Single screen (classic single wall backward compatibility).
- Extreme aspect ratios (ultra-wide ribbon 32:1, ultra-tall portrait banner 1:8).
- Disparate panel sizes & pixel pitches between screens.
- Massive multi-screen cluster (10+ separate walls).
- Microscopic screens (1 panel) vs massive arena walls (1000+ panels).
- Negative or inverted 2D coordinate offsets.
- Identical overlapping coordinates.
- Asymmetrical left/right stage placement.
- Rapid successive screen additions/removals (100 iterations) verifying resource disposal.

### Tier 3 - Cross-Feature Combinations (Pairwise Coverage)
- Heterogeneous screens (Main 16:9 + IMAG 4:3 + DJ booth 8:1) with Color Bars pattern + Telemetry aggregation.
- Single screen switched dynamically to 3 screens, then back to 1 screen.
- Screen removal while camera is auto-framed to previous center.
- Arena lighting preset applied across multi-screen setup with ground legs grounded to expanding stage deck.
- Custom labels and resolution indicators on curved vs flat screens.

### Tier 4 - Real-World Application Scenarios (≥5 Scenarios)
1. **Scenario 1: Main Stage Arena Festival**: Center LED Wall (16m × 9m) + Stage Left IMAG (6m × 8m) + Stage Right IMAG (6m × 8m) + DJ Booth (4m × 1.5m).
2. **Scenario 2: Corporate Conference Keynote**: Wide Ultrawide Backdrop (24m × 4m) + 2 Delay Projection Screen Mimics (5m × 3m).
3. **Scenario 3: Broadcast Studio Hybrid**: Main Anchor Wall (6m × 3.5m) + Standup Screen (3m × 3m) + Ticker Banner (12m × 0.5m).
4. **Scenario 4: Touring Concert Rig**: Split Center Columns (3 columns of 2m × 10m each) + 2 Side Wings (8m × 6m).
5. **Scenario 5: Retail Exhibition Booth**: 4 Heterogeneous Display Towers (2m × 4m) staggered across the stage.
