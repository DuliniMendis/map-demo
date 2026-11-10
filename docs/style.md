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
import { applyStyleOptions, buildStyle, watchDemFallback, onDemFallback } from './style/buildStyle';
import { MAP_OPTIONS } from './style';

const map = new maplibregl.Map({ container, style: buildStyle(opts), maxPitch: MAP_OPTIONS.maxPitch, ... });
const unwatch = watchDemFallback(map);        // right after new Map(), before load (= installDemFallback)
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

`watchDemFallback(map)` (alias of `installDemFallback`, exported from `buildStyle.ts`; returns an
unsubscribe) watches tile errors on `dem`/`dem-shade`. Call it right after `new Map()`, before `load`.
After **3 consecutive** outage errors (no successful DEM tile in between) while on Mapterhorn it switches
both sources to AWS and fires `style:dem-fallback` on the map with `{ from: 'mapterhorn', to: 'aws', error }`;
subscribe with the typed `onDemFallback(map, cb)` or `map.on('style:dem-fallback', …)`. The fallback is
sticky for the life of the map: later `applyStyleOptions(..., { demProvider: 'mapterhorn' })` calls stay
on AWS, and re-applying `demProvider: 'aws'` after the event is a no-op (unit-tested), so the app shell
may or may not track the provider in its store.

- **What counts:** network/CORS failures (no HTTP status), 5xx, 408 and 429. **404s and other 4xx never
  count** (`countsAsOutage`). MapLibre 6.17 itself does not even raise an `error` event for a 404 (it
  treats it as "no tile here"); the explicit check guards against that changing.
- **Mapterhorn 404s are normal** and happen on every session:
  - all-ocean tiles inside the source bounds, e.g. `4/12/10`, `4/13/10` (Southern Ocean south of WA/SA)
    and `7/117/81` (south-east of Tasmania). They can't be avoided with a rectangular `bounds` without
    cutting off Tasmania or the Torres Strait, and Mapterhorn publishes no coverage mask;
  - z13+ tiles wherever only 30 m data exists (most of the interior, e.g. around Uluru).

  The browser logs each one as `Failed to load resource: the server responded with a status of 404`;
  page JavaScript cannot suppress those lines. **WS6: allow-list 404 responses from
  `tiles.mapterhorn.com`** (and the matching console lines) in smoke tests.
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
- Mapterhorn 404s (all-ocean tiles, and z13+ in 30 m-only areas) produce browser console noise (see DEM fallback).
- A manual provider switch (dev page only) briefly flattens the terrain until the new DEM tiles arrive.
- Hairline tile-edge lines in hillshade-only mode in patchy LiDAR areas (see Quality checks).
- The labels overlay is English-first (`name:en`, then `name`), as OpenStreetMap tags it.

## Phase 3 (WS7): contour lines and time-of-day light

Both are runtime options of `applyStyleOptions` (`contours`, `sunHour` in `StyleOptions`); `buildStyle`
is unchanged and never contains them (the contour source needs a protocol registered first, and the
sun needs the map centre). The style dev page has a contours checkbox, a sun slider and `?t=<hour>`.

### Contour lines

Generated in the browser from the DEM we already load, by
[maplibre-contour](https://github.com/onthegomap/maplibre-contour) 0.1.1 (BSD-3-Clause, onthegomap).
It registers a MapLibre protocol, fetches and decodes DEM tiles in its own web worker (a blob URL built
into the package, so it works the same under `vite` dev and `vite build`), runs marching squares and
hands MapLibre ready-made vector tiles. Works with MapLibre 6.17, Mapterhorn's terrarium **WebP** and
the AWS terrarium PNG fallback. The library (9.9 KB gz) is a separate chunk, downloaded the first time
contours are switched on (`src/map/style/contours.ts`).

| | |
|---|---|
| Source | `contours` (vector, `contour-<provider>-contour://{z}/{x}/{y}?…`), z10–13 generated, overzoomed above; `bounds` = `SOURCE_BOUNDS` |
| Layers | `contour-lines` (line), `contour-labels` (symbol, major lines only, from z10.5), both directly above `hillshade` and below the river/border lines, WS2's markers and every label |
| Intervals | z10–12: 50 m, major 250 m; z13+: 20 m, major 100 m (`CONTOUR_THRESHOLDS`, `contourInterval(z)`) |
| Labels | `"450 m"` (`number-format`, en-AU), `Noto Sans Regular` 9–11 px along the line, flat on the slope (`text-pitch-alignment: viewport`, rotation `map`) |
| Look | Thin (0.35–1.4 px) and faint (opacity 0.2 minor / 0.4 major, fading in over z10–10.5, so they are fully drawn where nation flights land). Over imagery a pale warm `rgb(255,246,230)`; with imagery off the hillshade's dark brown `rgb(58,36,20)` with a light halo on the labels |
| Off | `visibility: none` in place; the source stays so a re-toggle is instant |

**DEM reads match the terrain's.** maplibre-contour reads the DEM where the terrain mesh does, so most
of its fetches are URLs the browser already has (Mapterhorn sends `cache-control: public,
max-age=604800`):

- Mapterhorn (512 px): the terrain loads z−1 tiles; contours use `overzoom: 1` (a zN contour tile from a
  quadrant of the z(N−1) DEM tile, needing ≤ 3 neighbours instead of 8). DEM capped at **z12**, because
  Mapterhorn 404s z13+ wherever only 30 m data exists (most of the interior).
- AWS (256 px, fallback): the terrain loads zN at view zoom N, so `overzoom: 0`, DEM capped at z13.
- On `style:dem-fallback` (or whenever `applyStyleOptions` sees the AWS provider) the contour source is
  replaced with the AWS one, in place, at the same layer position.

Measured in `tests/playwright/landscape.spec.ts` (synthetic DEM, Katoomba, z11.5, pitch 60°, bearing
−18°, 1280×800): the terrain + hillshade loaded **25 DEM tiles (23 URLs)** for the view; switching
contours on made **20 DEM fetches, 10 of them URLs the terrain had already loaded** (HTTP-cache hits in a
real browser) and **10 new URLs** (neighbours along the edges of the view). So contours add about
+40 % DEM traffic at that view, not +100 %. The spec asserts new URLs ≤ terrain URLs.

Frame rate with the style dev page at Blue Mountains (z12.6, pitch 66°, 1280×800, live tiles, Apple
M5 Max, headless Chromium on Metal), mean over a 6 s continuous pan: **59.9 fps** without contours,
**60.0 fps** with (the display cap).

Note: nation views arrive at z10.5 (WS2's `DEFAULT_VIEW`), so contours appear once you zoom in a step.

| On imagery | On relief |
|---|---|
| ![](style/ws7-bluemtns-contours-imagery.jpg) | ![](style/ws7-bluemtns-contours-relief.jpg) |

### Time-of-day light

`sunHour` (store, 5–19, local **apparent** solar time: 12:00 = sun due north/south) moves the
hillshade light to where the sun is at that hour, today (eastern Australian calendar date), over the
selected nation's point, or else the map centre — fixed when the slider moves, never re-computed on
pan (`src/map/style/lighting.ts`). `sunPosition(lat, lng, date, hour)` uses the NOAA solar-calculator
formulas (declination, equation of time, refraction) and is unit-tested against reference positions
for Sydney, Uluru, Hobart and Darwin.

| Paint | `sunHour: null` (default, unchanged) | `sunHour` set |
|---|---|---|
| `hillshade-illumination-direction` | 315 | sun azimuth (0.5° steps) |
| `hillshade-illumination-anchor` | `viewport` | `map` (the light stays with the land as the camera turns) |
| `hillshade-exaggeration` | 0.35 / 0.6 (imagery on/off) | × 1.5 at the horizon → × 1 at 45° → × 0.75 near the zenith |
| `hillshade-highlight-color` | `rgba(255,244,224,0.35)` / `#fff4e0` | towards golden `#ffc27a` as the sun drops below 45° |
| `hillshade-shadow-color` | `#3a2414` | towards a cool dusk `#2b1d2e` as the sun drops |

`hillshade-illumination-altitude` exists in MapLibre 6.17 but the `standard` hillshade method (ours)
ignores it; only `basic`/`combined`/`igor`/`multidirectional` read it, and switching method would change
today's default look. So altitude is expressed through strength and colour instead (table above). No
sky tint (optional in the brief; not done). The shadow colour now has a zero-length transition like
the other runtime-changed hillshade paint (see "No paint transitions" above).

UI: "Light (sun time)" slider (`sun-slider`, 15-minute steps, `aria-valuetext` "7:30 am") and a
"Default light" button (`sun-reset`) in the layer controls; URL `?t=14.5`, omitted for the default.

Grampians (Gariwerd), Halls Gap, 10 November, relief + hillshade (top) and imagery + hillshade:

| 07:00 | 12:00 | 18:00 | default |
|---|---|---|---|
| ![](style/ws7-grampians-0700-relief.jpg) | ![](style/ws7-grampians-1200-relief.jpg) | ![](style/ws7-grampians-1800-relief.jpg) | ![](style/ws7-grampians-default-relief.jpg) |
| ![](style/ws7-grampians-0700-imagery.jpg) | ![](style/ws7-grampians-1200-imagery.jpg) | ![](style/ws7-grampians-1800-imagery.jpg) | |
