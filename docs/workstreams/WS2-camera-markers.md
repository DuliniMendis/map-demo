# WS2 — Camera choreography & markers

**Goal:** the signature interaction. Selecting a nation lifts the camera out of the current landscape, travels,
then descends and tilts into the new Country; the nation's marker is highlighted. Markers for all nations are
visible and clickable at every zoom.

**Owns:** `src/map/controller/**`, `src/map/markers/**`. Reference: `PLAN.md §6`, `docs/contracts.md` (MapController API).
Develop against `src/data/mock-nations.json` and WS0's stub style (use the spike's style inline in a dev page until WS1 lands).

## Deliverables

1. `choreography.ts` — **pure** `planFlight(from, to, reducedMotion)` returning steps:
   - from null (overview): `[{ type: 'flyTo', center, zoom, pitch, bearing, speed: 0.6, curve: 1.42 }]`
   - from a nation: `[{ type: 'easeTo', zoom: max(4.2, from.zoom − 5), pitch: 0, bearing: 0, duration: 900 }, { type: 'flyTo', … }]`
   - distance-aware: if great-circle distance < 150 km skip the rise step and use `easeTo` with pitch kept.
   - reducedMotion: `[{ type: 'jumpTo', … }]`.
   - Defaults: zoom 10.5, pitch 62, bearing −18; `to.view` overrides. Clamp zoom 8–13, pitch 0–75.
   Unit tests for each branch (vitest).
2. `MapController.ts` — executes steps sequentially, awaiting `moveend`; `map.stop()` on new selection; sets `cameraState`; guards against terrain not loaded (wait for `map.once('idle')` if `!map.getTerrain()` yet). Handles `flyToOverview()`.
3. `markersLayer.ts` — GeoJSON source `nations` with `promoteId: 'idx'`; layers:
   - `nations-circle`: circle radius by zoom (3 px at z3 → 7 px at z10), ochre fill, dark stroke; `feature-state.hover` → brighter; `feature-state.selected` → white stroke 2.5 px.
   - `nations-selected-ring`: pulsing ring (animate `circle-radius` via `requestAnimationFrame` for 1.2 s after arrival; stop when idle).
   - `nations-label`: `text-field: name`, visible at z ≥ 6.5, `text-allow-overlap: false`, `text-variable-anchor`, haloed.
   - Insert before `LAYER_LABELS_FIRST` if present, else top.
   - Pointer cursor on hover; `click` → callback with `code`; `mousemove`/`mouseleave` → hover state.
   - With terrain on, symbols/circles are draped correctly by MapLibre; verify markers don't sink below ridges at pitch 70 (if they do, set `circle-pitch-alignment: 'map'` vs `'viewport'` and document choice).
4. Collision: at the overview ~455 points overlap in SE Australia; use `circle-opacity` 0.85 and cluster **off** (we want every nation findable), but hide labels until z 6.5.
5. `docs/camera.md`: timing table measured for 5 transitions (Perth→Hobart, Uluru→Sydney, two neighbours in VIC, overview→Torres Strait, Kakadu→Kimberley) with a short screen recording each.

## Done when
- Dev page: 10 mock nations; clicking markers or calling `flyToNation` performs rise → travel → descend, total 2.5–4.5 s, no camera sea-level dip, no jank at the handoff between steps.
- `prefers-reduced-motion` honoured.
- Unit tests for `planFlight` pass; controller has an integration test under Playwright (WS6 will adopt it).

## Don't
- Don't touch style sources/layers other than `nations-*`. Don't read the zustand store directly — WS5 wires it via the constructor callbacks.
