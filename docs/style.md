# Basemap style (WS1)

The terrain basemap: Mapterhorn elevation as 3D terrain, hillshade, Sentinel‑2 cloudless imagery,
optional hypsometric tint (`relief`), a labels-only OpenFreeMap overlay, and sky with distance haze.
Everything lives in `src/map/style/`; all of it is free and needs no API key.

Test page: `pnpm dev`, then open <http://localhost:5173/src/map/style/dev.html>. It has every toggle,
the exaggeration slider, a DEM provider switch, fly-to buttons for the places below, tile boundaries and
an FPS readout. Query parameters for scripted screenshots: `?loc=uluru&l=imagery,hillshade&x=1.5&dem=aws&hud=0`.

## Using it

```ts
import '../setupMaplibre'; // before the first Map (worker URL)
import { applyStyleOptions, buildStyle, installDemFallback, onDemFallback, MAP_OPTIONS } from './style';

const map = new maplibregl.Map({ container, style: buildStyle(opts), maxPitch: MAP_OPTIONS.maxPitch, ... });
installDemFallback(map);                      // as early as possible, so the first failing tiles count
onDemFallback(map, () => toast('Using backup terrain'));
// on every store change (cheap; only touches what differs):
applyStyleOptions(map, { ...store.layers, exaggeration: store.exaggeration, demProvider: 'mapterhorn' });
```

- `buildStyle(o)` is pure (no network, no Map). Use it once, for the constructor. **Never call `setStyle`
  afterwards**: it would wipe WS2's marker sources and layers.
- `applyStyleOptions(map, o)` changes the style in place: `visibility` for the four toggles, the
  imagery-dependent hillshade/relief strengths, `setTerrain` for exaggeration, and a remove/add of the
  DEM sources for a provider switch (deferred to `idle`, see below). Calls made before the style has
  loaded are queued and applied on `style.load` (latest wins). It also calls `installDemFallback`.
- Contract names (`docs/contracts.md`) are unchanged in `ids.ts`. Extra exports are listed in
  `src/map/style/index.ts`, notably `SOURCE_DEM_SHADE`, `LABEL_LAYER_IDS`, `DEM_FALLBACK_EVENT`,
  `ATTRIBUTION_TEXT` (plain-text credits for the footer) and `DEFAULT_STYLE_OPTIONS`.

### Layer order (bottom → top)

| Layer id | Type | Source | Toggle |
|---|---|---|---|
| `background` | background | – | always (ocean `#0f1f37`, matched to the Sentinel‑2 open ocean) |
| `imagery` | raster | `imagery` | `imagery` |
| `relief` | color-relief | `dem-shade` | `relief` |
| `hillshade` | hillshade | `dem-shade` | `hillshade` |
| `labels-waterway-line` | line (rivers z ≥ 9, streams z ≥ 13.5) | `labels` | `labels` |
| `labels-boundary` | line (state borders, dashed) | `labels` | `labels` |
| *WS2 markers go here* | `map.addLayer(layer, LAYER_LABELS_FIRST)` | | |
| `labels-water` = `LAYER_LABELS_FIRST` | symbol (seas, lakes, bays) | `labels` | `labels` |
| `labels-water-line`, `labels-waterway-name` (z ≥ 11), `labels-road` (z ≥ 11) | symbol | `labels` | `labels` |
| `labels-place-minor` (village z ≥ 10; hamlet/locality/suburb z ≥ 12), `-town` (z ≥ 7), `-city` (z ≥ 4), `-state` (z 3.5–8), `-country` (z < 5) | symbol | `labels` | `labels` |

The two line layers sit below the marker insertion point so rivers and borders never draw over markers;
every label symbol is above it. Note for WS2: symbol layers higher in the stack win collisions, so our
place labels take priority over a `nations-label` layer inserted below them. Use `text-allow-overlap`
or `symbol-sort-key`/`text-optional` on the nations layer if they must always show.

### Options → paint

| Option | Effect |
|---|---|
| `imagery` on | `hillshade-exaggeration` 0.35, highlight `rgba(255,244,224,0.35)`; relief opacity 0.25 (a tint over the photo) |
| `imagery` off | `hillshade-exaggeration` 0.6, highlight `#fff4e0`; relief opacity 0.85 |
| `exaggeration` | `terrain.exaggeration` (store range 1.0–2.5, default 1.5) |
| `demProvider` | both DEM sources: Mapterhorn (512 px WebP, z0–17) or AWS Terrain Tiles (256 px PNG, z0–15) |

Hillshade: standard method, light from 315° anchored to the viewport (top-left of the screen, so slopes
never read inverted when a flight swings the bearing), warm dark-brown shadow `#3a2414`.

Imagery: EOX `s2cloudless-2024_3857` (`{z}/{y}/{x}` order), z ≤ 14, saturation −0.1, contrast +0.05,
250 ms cross-fade as zoom levels swap.

Sky: `sky-color #7fb0e0`, horizon/fog a pale warm haze (`#efeae0` / `#e8e2d6`), `fog-ground-blend 0.6`,
`horizon-fog-blend 0.75`; atmosphere glow fades out between z10 and z12. At pitch above ~55° the far
terrain dissolves into haze (see the horizon shot below).

### Colour relief ramp

![Relief ramp](style/relief-ramp.svg)

| Elevation | Colour | |
|---|---|---|
| ≤ 0 m | transparent | sea (Mapterhorn has no bathymetry and stores the sea as exactly 0 m) |
| 1 m | `#5b6332` | deep green‑ochre |
| 300 m | `#d4b97e` | sand |
| 800 m | `#a4502c` | rust |
| 1500 m | `#8f8b87` | grey |
| 2200 m | `#f7f5f2` | white (Kosciuszko 2228 m) |

Most of the continent is below 600 m, so the first 300 m get a full green→sand sweep and rust marks the
ranges. Side effect of the transparent sea: land below sea level (Kati Thanda–Lake Eyre, about −15 m)
shows the background colour in relief-only mode, which reads as a lake.

## Sources, bounds and attribution

| Source id | Tiles | Attribution (visible text exactly as `docs/research.md`) |
|---|---|---|
| `dem`, `dem-shade` | `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` | `© Mapterhorn` → mapterhorn.com/attribution |
| (fallback) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | `Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)` |
| `imagery` | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` | `Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)` |
| `labels` | TileJSON `https://tiles.openfreemap.org/planet` (OpenMapTiles schema, copied from the `liberty` style) | `OpenFreeMap` + `© OpenMapTiles © OpenStreetMap contributors` |
| glyphs | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (Noto Sans) | – |

Every source has `bounds` = `AUSTRALIA_BOUNDS` padded by 0.5° (`SOURCE_BOUNDS` = 112–155° E,
45–9° S). The padding is deliberate: the contract box stops at 9.5° S, but Boigu (9.23° S), Saibai and
Dauan in the northern Torres Strait are home to Torres Strait Islander nations and their high-zoom
tiles would otherwise never load. Checked with a request log over the 24 toggle screenshots below: 889 tile
requests, **none** outside those bounds. The labels source keeps the OpenFreeMap TileJSON `url` because
its `tiles` URL is versioned and rotates; MapLibre lets our `bounds`/`attribution` override the
TileJSON's.

OpenFreeMap credits itself in its own TileJSON, so the labels attribution adds an "OpenFreeMap" link
in front of the research.md string. WS5's footer can use `ATTRIBUTION_TEXT` (plain text).

## DEM fallback

`installDemFallback(map)` watches tile errors on `dem`/`dem-shade`. After **3 consecutive** failures
(no successful DEM tile in between) while on Mapterhorn it switches both sources to AWS and fires
`style:dem-fallback` on the map with `{ from: 'mapterhorn', to: 'aws', error }`; subscribe with the typed
`onDemFallback(map, cb)`. The fallback is sticky for the life of the map: later
`applyStyleOptions(..., { demProvider: 'mapterhorn' })` calls stay on AWS, so the app shell does not
need a `demProvider` field in the store.

- MapLibre does not raise 404s as errors (it treats them as "no tile here"), so only network, CORS, 5xx
  and decode failures count. Mapterhorn legitimately 404s at z13+ wherever only 30 m data exists (e.g.
  around Uluru); those requests show as `Failed to load resource: 404` in the browser console and are
  harmless. WS6: don't fail smoke tests on those console lines.
- The swap (setTerrain(null) → remove layers → remove/add sources → re-add layers in place →
  setTerrain) waits for `idle`, or at most 4 s and then the next `moveend`, so it never yanks the terrain
  away mid-flight. Layers from other workstreams that use the DEM sources keep their position and paint.
- MapLibre only logs errors to the console when nobody listens for `error`; the watcher re-logs them when
  it is the only listener so that behaviour is preserved.
- Verified in headless Chromium with every `tiles.mapterhorn.com` request refused: the event fired, both
  sources moved to AWS, terrain and layer order were intact (screenshot below).

## Decisions and MapLibre 6.17 gotchas

- **Two DEM sources.** Terrain uses `dem` (contract). Hillshade and relief use `dem-shade`, same tiles.
  MapLibre loads the terrain DEM one zoom level coarser than a normal source, so a separate source keeps
  the hillshade crisp, and MapLibre warns in the console when one source serves both. The cost is more
  DEM tile requests (the same URLs, so the HTTP cache absorbs part of it).
- **No paint transitions on runtime-changed properties** (`hillshade-exaggeration`,
  `hillshade-highlight-color`, `color-relief-opacity` have `*-transition: { duration: 0 }`). With terrain
  on, layers are draped through cached render-to-texture tiles that are refreshed when the style changes
  but not on every frame of a transition, so a transitioned value froze at its starting point (relief
  stuck at 0.25 opacity after switching imagery off). Anyone adding runtime paint changes to draped
  layers should do the same.
- **Hillshade over imagery mostly shades, hardly highlights.** A full-strength highlight washed cliffs and
  ridgelines out to grey on top of an already sunlit photo.
- `relief` sits under `hillshade` so the relief is shaded in both modes.

## Quality checks

| Check | Result |
|---|---|
| `validateStyleMin` (`@maplibre/maplibre-gl-style-spec` 26.5.1) | passes for all 32 combinations of the four toggles × two providers (`buildStyle.test.ts`) |
| FPS, 2560×1440, pitch 65°, continuous panning, all layers on | **60 fps** (the display cap) at Blue Mountains and Tasmania SW, Apple M5 Max, Chromium (ANGLE/Metal) |
| Tiles outside Australia | none requested (889 tile requests checked) |
| DEM fallback | works (see above) |
| Seams between Mapterhorn high-res (GA 5 m / Tasmania 2 m LiDAR) and 30 m areas | not visible with imagery on. In hillshade-only mode at high zoom, hairline light or dark lines can appear along some tile edges (likely hillshade border backfill between tiles of different zoom where LiDAR and 30 m coverage meet) (visible in `tassw-hillshade.jpg`). Not yet investigated further; noted as a known gap. |

FPS was measured with headless Chromium on the GPU (`--use-angle=metal`); `requestAnimationFrame` is
capped at 60 Hz there, so the real headroom is higher.

## Screenshots

All 1280×800, `hud=0`, default exaggeration 1.5, Mapterhorn DEM. Variants: **default** = imagery +
hillshade + labels; **relief** = relief + hillshade + labels, imagery off; **hillshade** = hillshade only;
**blend** = imagery + relief + hillshade.

### Overview (z3.7)

| default | relief |
|---|---|
| ![](style/overview-default.jpg) | ![](style/overview-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/overview-hillshade.jpg) | ![](style/overview-blend.jpg) |

### Uluru (z12.4, pitch 64°)

| default | relief |
|---|---|
| ![](style/uluru-default.jpg) | ![](style/uluru-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/uluru-hillshade.jpg) | ![](style/uluru-blend.jpg) |

### Blue Mountains, Katoomba and the Jamison Valley (z12.6, pitch 66°)

| default | relief |
|---|---|
| ![](style/bluemtns-default.jpg) | ![](style/bluemtns-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/bluemtns-hillshade.jpg) | ![](style/bluemtns-blend.jpg) |

Horizon haze at pitch 80°, and the same area on the AWS fallback DEM with Mapterhorn blocked:

| pitch 80° | AWS fallback |
|---|---|
| ![](style/bluemtns-horizon.jpg) | ![](style/bluemtns-aws-fallback.jpg) |

### Kakadu, Jim Jim Creek and the Arnhem Land escarpment (z12.2, pitch 64°)

| default | relief |
|---|---|
| ![](style/kakadu-default.jpg) | ![](style/kakadu-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/kakadu-hillshade.jpg) | ![](style/kakadu-blend.jpg) |

### Grampians (Gariwerd), Halls Gap (z11.8, pitch 65°)

| default | relief |
|---|---|
| ![](style/grampians-default.jpg) | ![](style/grampians-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/grampians-hillshade.jpg) | ![](style/grampians-blend.jpg) |

### Tasmania south-west, Arthur Range (z11.6, pitch 66°)

| default | relief |
|---|---|
| ![](style/tassw-default.jpg) | ![](style/tassw-relief.jpg) |
| **hillshade** | **blend** |
| ![](style/tassw-hillshade.jpg) | ![](style/tassw-blend.jpg) |

## Known gaps

- Labels outside Australia (PNG, Indonesia, Timor-Leste) appear where their vector tiles overlap the
  bounds; the OpenMapTiles `place` layer has no country code to filter on.
- Mapterhorn's z13+ 404s in 30 m-only areas produce browser console noise (see above).
- A manual provider switch (dev page only) briefly flattens the terrain until the new DEM tiles arrive.
- Hairline tile-edge lines in hillshade-only mode in patchy LiDAR areas (see Quality checks).
- The labels overlay is English-first (`name:en`, then `name`), as OpenStreetMap tags it.
