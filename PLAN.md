# Country Map — 3D terrain map of Australia with First Nations locations

Master plan. Read this first, then `docs/contracts.md`, then your workstream brief in `docs/workstreams/`.
Research, licences and the spike results are in `docs/research.md`.

## 1. What we are building

A browser app showing Australia as a 3D terrain map (satellite imagery draped over elevation, hillshading,
sky/atmosphere). A side panel lists Aboriginal and Torres Strait Islander nations / language groups.
Clicking one flies the camera to that group's Country: zoom out from the current focus, glide across,
then descend and tilt into the landscape. An info card shows the group's name(s), and what that place is
called today (suburb/locality and state), with attribution and a clear "approximate, not legal boundaries"
disclaimer.

Non-goals for v1: user accounts, editing data, native title or legal boundaries, mobile-native apps.

## 2. Decisions already made (do not re-litigate; raise in PLAN review if you have a blocker)

| Area | Decision | Why |
|---|---|---|
| Renderer | **MapLibre GL JS 6.17** (ESM-only, `import * as maplibregl`) | Free, open, has `terrain`, `hillshade`, `color-relief`, `sky`, `flyTo`. Spike proved it (see `docs/spike/`). |
| App stack | **Vite + React 19 + TypeScript**, `pnpm`, zustand store | Clear component boundaries so workers can own files without conflicts. |
| Terrain | **Mapterhorn** terrarium WebP tiles (512px, z0–17) primary; **AWS Terrain Tiles** (terrarium PNG, 256px, z0–15) fallback | Mapterhorn blends Geoscience Australia 5 m LiDAR, Tasmania 2 m and Copernicus GLO‑30; free, no key. Both verified live over Australia. |
| Imagery | **EOX Sentinel‑2 cloudless 2024** raster tiles | Free, no key, CC BY 4.0 for our use; verified live. Esri World Imagery is NOT freely licensed — do not use. |
| Labels | **OpenFreeMap** vector tiles (OpenMapTiles schema), labels-only style layers over the imagery | Free, no key. Gives place names, roads, water labels at high zoom = "what the area is called today". |
| Nations data | **AUSTLANG** (AIATSIS, CC BY 4.0) via the TLCMap GeoJSON mirror: 455 language varieties with one approximate point each | The only openly licensed, authoritative point set. AIATSIS "Map of Indigenous Australia" is copyright, no GIS data, cannot be used. |
| Polygons | **Not in v1.** Optional phase‑2 runtime overlay from Native Land Digital (API key, non-commercial, may not be stored/redistributed) | Their treaty forbids bundling the data. |
| Modern place names | **Precomputed at build time** from ABS ASGS 2021 Suburbs & Localities (SAL) point-in-polygon + state; shipped inside `nations.json` | No runtime geocoding, no keys, no rate limits. Verified: Uluru → "Petermann, Northern Territory". |
| Terminology | UI says **"Nations & language groups"**, "Country", "people"; never "tribes" | Standard respectful usage in Australia; see research notes. |
| Hosting | Static site (Vercel or GitHub Pages). No backend. | Everything is static JSON + third‑party tiles. |

## 3. Architecture

```
┌──────────────────────────────── browser ────────────────────────────────┐
│  <App>                                                                  │
│  ├─ <SidePanel>  list/search/filter  ── select(id) ──▶ store.selectedId │
│  ├─ <InfoCard>   name, alt names, Country today (SAL, state), links     │
│  └─ <MapView>    owns MapLibre Map; subscribes to store                 │
│       ├─ style: terrain + hillshade + imagery + labels + sky  (WS1)     │
│       ├─ MapController.flyToNation(id)  zoom-out → pan → zoom-in (WS2)  │
│       └─ markers layer (GeoJSON source from nations.json)      (WS2)    │
│  data: /public/data/nations.json  (built by scripts/, WS3)              │
└─────────────────────────────────────────────────────────────────────────┘
  tiles: tiles.mapterhorn.com | s3 elevation-tiles-prod | tiles.maps.eox.at | tiles.openfreemap.org
```

State (zustand): `selectedId`, `hoveredId`, `cameraState ('idle'|'flying')`, `layers {imagery, labels, hillshade, relief}`, `exaggeration`, `query`, `stateFilter`.
URL sync: `?n=<austlangCode>` so a selection is shareable.

## 4. Workstreams (parallel)

Phase 0 is one worker for ~1 hour. Everything in Phase 1 runs in parallel against the contracts in
`docs/contracts.md`; each worker owns the files listed in its brief and touches nothing else.
Phase 2 is integration and polish; Phase 3 is optional extras.

| ID | Workstream | Owns | Brief |
|---|---|---|---|
| WS0 | Scaffold & contracts (sequential, first) | repo root, `src/types`, `src/store`, mock data, CI skeleton | `docs/workstreams/WS0-scaffold.md` |
| WS1 | Terrain & basemap style | `src/map/style/**` | `docs/workstreams/WS1-terrain-style.md` |
| WS2 | Camera choreography & markers | `src/map/controller/**`, `src/map/markers/**` | `docs/workstreams/WS2-camera-markers.md` |
| WS3 | Data pipeline (AUSTLANG → nations.json, ABS reverse lookup) | `scripts/**`, `data/**`, `public/data/**` | `docs/workstreams/WS3-data-pipeline.md` |
| WS4 | Side panel & info card UI | `src/ui/**` | `docs/workstreams/WS4-side-panel.md` |
| WS5 | App shell, integration, URL state, about/acknowledgement | `src/app/**`, `src/main.tsx`, `index.html` | `docs/workstreams/WS5-app-shell.md` |
| WS6 | QA, performance, accessibility, deploy | `tests/**`, `.github/**`, `vercel.json`, `docs/qa.md` | `docs/workstreams/WS6-qa-deploy.md` |

Dependency notes:
- WS2 and WS4 develop against `src/data/mock-nations.json` (created by WS0) until WS3 lands the real file; same schema.
- WS1 and WS2 both touch the Map instance: WS1 exports a *style factory* and layer ids; WS2 only calls `map.flyTo/easeTo` and adds its own `nations-*` sources/layers. No shared files.
- WS5 is the only one that imports from everyone. It starts with stubs and swaps in real modules as PRs merge.
- WS6 writes Playwright tests against `data-testid`s defined in the contracts, so it can start day one.

## 5. Milestones & acceptance

M1 "It renders" (end of Phase 0 + WS1 skeleton): Australia in 3D with terrain + imagery + sky, FPS ≥ 45 on an M‑series Mac.
M2 "It flies" (WS2 + mock data): click any of 10 mock nations → zoom-out/pan/zoom-in, marker highlighted, no camera dropping to sea level.
M3 "Real data" (WS3): `nations.json` has 455 entries, each with coordinates, SAL name and state; schema validation passes; attribution file generated.
M4 "Usable" (WS4 + WS5): searchable list, info card, URL state, keyboard navigation, acknowledgement modal, attribution footer.
M5 "Shippable" (WS6): Playwright smoke suite green, Lighthouse a11y ≥ 95, deployed preview URL, tile-fallback works when Mapterhorn is unreachable.

Definition of done for every PR: typecheck + lint pass, unit tests for pure logic, screenshot or short clip in the PR for visual work, no new runtime keys/secrets, attribution kept correct.

## 6. Camera choreography spec (the core interaction)

On `select(id)` where a different nation is already focused:
1. Cancel any in-flight animation (`map.stop()`).
2. **Rise**: `easeTo({ zoom: max(4.2, currentZoom − 5), pitch: 0, bearing: 0, duration: 900 })`.
3. **Travel + descend**: `flyTo({ center, zoom: nation.view.zoom ?? 10.5, pitch: nation.view.pitch ?? 62, bearing: nation.view.bearing ?? −18, duration: <computed>, curve: 1.42, essential: true })`. Durations are explicit (see `docs/camera.md`): `speed: 0.6` took 6–7 s on long flights and broke the 2.5–4.5 s budget.
4. On `moveend`: set `cameraState='idle'`, pulse the marker, show the info card.
From the national overview (first click) skip step 2. Respect `prefers-reduced-motion` → single `jumpTo` with a 300 ms fade.
Per-nation `view` overrides live in `data/overrides.json` (e.g. coastal nations look inland; desert nations zoom to ~9.5 so relief reads).

## 7. "Landscape detail" ladder (do in order, each is a toggle)

1. Terrain + hillshade + Sentinel‑2 imagery (v1 baseline, spiked).
2. Sky + fog for depth; exaggeration slider (1.0–2.5).
3. `color-relief` hypsometric tint as an alternative to imagery (reads better in flat interior).
4. Vector overlays from OpenFreeMap: water bodies, rivers, place labels (what it's called today), roads at z≥10.
5. Phase 3: contour lines from the DEM, time-of-day hillshade illumination, nearby named landforms.

## 8. Cultural & legal guardrails (binding for all workers)

- Locations are *approximate* single points from AUSTLANG; show the disclaimer on first load and in the info card.
- Credit: "AUSTLANG © AIATSIS, CC BY 4.0", plus terrain, imagery and label attributions (exact strings in `docs/research.md`).
- Do not reproduce or trace the AIATSIS Map of Indigenous Australia, and do not bundle Native Land Digital data.
- Use "nation", "people", "language group", "Country"; avoid "tribe". Keep AUSTLANG spellings; show synonyms.
- Add an Acknowledgement of Country in the About panel. Offer a "report a correction" mailto to the maintainer.

## 9. Environment

Installed 2026‑11‑09 via Homebrew 7.0.12 (`/opt/homebrew`, wired into `~/.zprofile`): Node 26.13, npm 11.20,
pnpm 12.18, Python 3.15.2, git 2.56, GitHub CLI 2.103. Apple M5 Max + Metal 4: WebGL2 fine.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Free tile hosts have no SLA (Mapterhorn, AWS S3, EOX) | Fallback DEM source; imagery → `color-relief` fallback; cache headers; consider self-hosting PMTiles for Australia in Phase 3 |
| EOX licence text differs between pages (CC BY 4.0 vs "restricted") | Non-commercial project; attribute exactly; re-check before commercial use |
| `api.aiatsis.gov.au` did not resolve during research | Pipeline fetches from TLCMap mirror; also commit the raw GeoJSON snapshot under `data/raw/` with date |
| One point per language misleads | Show as "approximate centre"; no polygons; disclaimer |
| MapLibre 6 is ESM-only | Vite handles it; never `<script src>` a UMD build |
| Camera glitches with terrain (seen in <6.15) | Pin 6.17+, test `flyTo` while tiles load |
