# WS1 — Terrain & basemap style

**Goal:** the best-looking free 3D Australia we can get: terrain + hillshade + Sentinel‑2 imagery + sky/fog,
optional hypsometric tint, labels-only vector overlay, all as runtime toggles. Expose a style factory per
`docs/contracts.md`.

**Owns:** `src/map/style/**`. Reference: `spikes/terrain-spike/index.html`, `docs/research.md`.

## Deliverables

1. `sources.ts`
   - `dem` (`raster-dem`, `encoding: 'terrarium'`): provider switch — Mapterhorn `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, `tileSize: 512`, `maxzoom: 17`; AWS `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `tileSize: 256`, `maxzoom: 15`. Attribution strings exactly as in research.md.
   - `imagery` (raster): EOX `s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` — note `{y}/{x}` order, `maxzoom: 14`, `tileSize: 256`.
   - `labels` (vector): OpenFreeMap. Read its `liberty` style JSON once, copy the `sources` block (OpenMapTiles schema). We use only symbol/line layers from it.
   - `bounds` on every source = `AUSTRALIA_BOUNDS` to avoid fetching the rest of the planet.
2. `layers/`
   - `background` dark ocean colour; `imagery` raster with `raster-saturation: -0.1`, `raster-contrast: 0.05`, fade on zoom.
   - `hillshade`: `hillshade-exaggeration` 0.35 (imagery on) / 0.6 (imagery off), `hillshade-illumination-direction: 315`, `hillshade-method` default; `hillshade-shadow-color` warm dark brown.
   - `color-relief` (`relief` toggle): ramp tuned for Australia (most land < 600 m): 0 m deep green‑ochre → 300 m sand → 800 m rust → 1500 m grey → 2200 m white. Opacity 0.85 when imagery off, 0.25 blended when on.
   - Labels-only overlay from OpenMapTiles: `water_name`, `place` (country/state/city/town/village, zoom-gated), `transportation_name` at z≥11, `waterway` lines at z≥9 (subtle), `boundary` admin level 4 dashed. Text halo for readability over imagery. The first label layer id must equal `LAYER_LABELS_FIRST` so WS2 can insert markers beneath labels.
3. `buildStyle(opts)` and `applyStyleOptions(map, opts)` — toggles via `setLayoutProperty('visibility')`, exaggeration via `map.setTerrain({source, exaggeration})`, provider switch via `removeSource/addSource` (wait for `idle`).
4. Terrain & sky: `terrain: { source: 'dem', exaggeration }`; `sky` block from the spike tuned so the horizon fades to pale haze at pitch > 55°; `fog-ground-blend` ~0.6. `maxPitch: 85`.
5. Fallback: on `error` events for the dem source (3 consecutive tile errors), switch provider to AWS and emit `style:dem-fallback` on the map so WS5 can toast.
6. `docs/style.md`: screenshots of each toggle at Uluru, Blue Mountains, Kakadu, Grampians, Tasmania SW, plus the colour ramp.

## Quality bar
- ≥ 45 FPS panning at pitch 65 on an M‑series Mac at 1440p; check with `map.showTileBoundaries` off.
- No seams between Mapterhorn 5 m and 30 m regions at the coast (if visible, lower hillshade exaggeration there is acceptable; document).
- Tiles outside Australia not requested (check Network panel).

## Done when
- `buildStyle` used in a Storybook-free test page `src/map/style/dev.html` (served by Vite) renders all toggles; screenshots in `docs/style.md`.
- Unit test: `buildStyle` output validates against `@maplibre/maplibre-gl-style-spec` `validateStyleMin`.

## Don't
- Don't use Esri, Google, Mapbox or MapTiler tiles. Don't add markers/camera code (WS2). Don't call `setStyle` after load (kills WS2's layers).
