# Research notes & licences (2026‑11‑09)

Everything below was checked live today unless marked "from docs".

## Rendering stack

**MapLibre GL JS** — latest `6.17.0` (npm, published 2026‑11‑07). Package is **ESM‑only**: `dist/maplibre-gl.mjs`
and `dist/maplibre-gl-worker.mjs`; there is no `maplibre-gl.js` UMD (404 on unpkg). Import with
`import * as maplibregl from 'maplibre-gl'` (no default export). Style spec layer types: background, fill, line,
symbol, raster, circle, fill-extrusion, heatmap, **hillshade**, **color-relief**; root `terrain` and `sky`.
Recent terrain fixes: 6.15 fixed camera dropping to sea level during `flyTo` while terrain loads and DEM maxzoom
mismatches; 6.16 fixed flat terrain at low zoom. Pin ≥ 6.17.

Spike (`spikes/terrain-spike/`) rendered Uluru and the Blue Mountains at pitch 68° with imagery + hillshade + sky
in the desktop app's browser pane; see `docs/spike/*.jpg`. Startup to first interactive frame ≈ 3 s on this Mac.

## Elevation (DEM) sources

| Source | URL | Encoding / size | Zoom | Australia coverage | Licence | Status |
|---|---|---|---|---|---|---|
| **Mapterhorn** | `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` (TileJSON `/tilejson.json`) | terrarium, 512 px WebP | 0–17 | Geoscience Australia 5 m LiDAR DEM (9 regional sets), Tasmania 2 m (The LIST), Copernicus GLO‑30 elsewhere | Tiles: attribution `© Mapterhorn` with link; sources CC BY 4.0 / CC BY 3.0 / Copernicus open | 200 OK over Uluru (98 KB tile) |
| **AWS Terrain Tiles** (Mapzen/Tilezen) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | terrarium, 256 px PNG | 0–15 | SRTM 30 m + GA 5 m coastal patches (SA/VIC/NT) | Open; attribution required (see tilezen attribution.md) ; no SLA | 200 OK |
| Geoscience Australia 1 s SRTM DEM‑S/H | ELVIS portal / WCS `services.ga.gov.au/gis/services/DEM_SRTM_1Second_2024/MapServer/WCSServer` | GeoTIFF, ~25 GB | — | national | CC BY 4.0 | Phase 3 only (self‑hosted PMTiles) |

Terrarium decode: `(R*256 + G + B/256) − 32768` metres.

## Imagery and labels

| Source | URL | Licence / terms | Status |
|---|---|---|---|
| **EOX Sentinel‑2 cloudless 2024** | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` (note `{y}/{x}` order), z0–14 | CC BY 4.0 on eox.at; a separate demo‑data page cites an EOX restricted‑use licence. Attribution: "Sentinel‑2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)" | 200 OK |
| **OpenFreeMap** vector tiles | style `https://tiles.openfreemap.org/styles/liberty` (we will author a labels‑only style from its sources) | Free, no key; attribution "© OpenMapTiles © OpenStreetMap contributors" | 200 OK |
| Esri World Imagery | — | Esri staff: requires ArcGIS licence, not for commercial use | **Do not use** |
| MapTiler satellite / terrain | — | Key + quota | Not needed |

## Nations / language-group data

| Source | What | Licence | Verdict |
|---|---|---|---|
| **AUSTLANG (AIATSIS)** via **TLCMap layer 81** — `https://tlcmap.org/layers/81/json/download` (also `/csv/download`, `/kml/download`) | 455 Point features. Properties: `language_code` (e.g. `A103`), `language_name`, `language_synonym` (comma list), `thesaurus_heading_language`, `thesaurus_heading_people`, `approximate_latitude/longitude_of_language_variety`, `uri` (AIATSIS Austlang page) | **CC BY 4.0**, creator AIATSIS, contact data@aiatsis.gov.au | **Primary dataset.** Note the AIATSIS canonical CSV (`collection.aiatsis.gov.au/datasets/austlang/001.csv`) 301‑redirects to `api.aiatsis.gov.au`, which did not resolve in DNS today. Commit a dated raw snapshot. |
| Wikidata (P1252 = AUSTLANG code, P625 coords) | 456 items with codes, 145 with coordinates | CC0 | Supplementary: Wikipedia links, alt names, images |
| AIATSIS Map of Indigenous Australia | the famous coloured map | © AIATSIS; licence per request; **no GIS data available** | Cannot use; link to it in About |
| Native Land Digital API | territory polygons incl. Australia | Free key; "Data Sovereignty Treaty": no storing/distributing, non‑commercial only, attribution, disclaimer | Phase 2 optional *runtime* overlay only, behind a user‑supplied key |
| Gambay (First Languages Australia) | 795 languages map | Licence unknown, no download | Link only |

Sensitivity: AUSTLANG points are *one approximate location per language variety*, "not suitable for native title
or any land claim" (Native Land wording, equally true here). Use "nations / language groups", "people", "Country".

## "What is it called today" lookup

ABS **ASGS Edition 3 (2021) Suburbs and Localities (SAL)**, 15,353 polygons, no gaps/overlaps, CC BY 4.0.
Feature service: `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/FeatureServer/0/query`
Fields: `sal_code_2021`, `sal_name_2021`, `state_code_2021`, `state_name_2021`, `area_albers_sqkm`. Max 2,000 records/request;
GeoJSON output supported. Verified point query:

```
…/query?geometry=131.0369,-25.3444&geometryType=esriGeometryPoint&inSR=4326
  &spatialRel=esriSpatialRelIntersects&outFields=sal_name_2021,state_name_2021&returnGeometry=false&f=json
→ {"sal_name_2021":"Petermann","state_name_2021":"Northern Territory"}
```

Bulk alternative: ASGS 2021 GeoPackage on data.gov.au; run point‑in‑polygon locally (turf/shapely) if the service
rate‑limits 455 queries. Also pull the nearest *named populated place* from OpenFreeMap/OSM (Phase 2) because a
remote SAL like "Petermann" means little to most users; show both.

## Attribution strings (copy exactly)

- `AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), CC BY 4.0, via TLCMap`
- `© Mapterhorn` (link https://mapterhorn.com/attribution) · `Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)`
- `Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)`
- `© OpenMapTiles © OpenStreetMap contributors` · `Suburb/state boundaries © Australian Bureau of Statistics, CC BY 4.0`
- `© MapLibre`

## Sources

- Native Land API docs: https://api-docs.native-land.ca/llms-full.txt · https://api-docs.native-land.ca/about-and-disclaimers
- AIATSIS permissions: https://aiatsis.gov.au/about/what-we-do/aboriginal-studies-press/permissions · https://shop.aiatsis.gov.au/pages/map-licensing
- AUSTLANG dataset: https://data.gov.au/data/dataset/austlang-dataset-001 · TLCMap layer: https://tlcmap.org/layers/81
- MapLibre releases: https://github.com/maplibre/maplibre-gl-js/releases · style spec: https://maplibre.org/maplibre-style-spec/layers/
- Mapterhorn: https://mapterhorn.com/ · https://mapterhorn.com/data-access · https://download.mapterhorn.com/attribution.json
- Tilezen data sources: https://github.com/tilezen/joerd/blob/master/docs/data-sources.md
- EOX: https://eox.at/2025/03/sentinel-2-cloudless-2024/ · https://s2maps.eu
- ABS SAL: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/non-abs-structures/suburbs-and-localities · https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/FeatureServer
- GA 1 s DEM: https://ecat.ga.gov.au/geonetwork/srv/api/records/22be4b55-24a9-4320-e053-10a3070a5236
- Esri imagery terms discussion: https://community.esri.com/t5/arcgis-location-platform-developers-ques/inquiry-about-world-imagery/m-p/1569266
- Gambay: https://gambay.com.au/about
