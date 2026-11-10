# WS7 — Landscape detail: contour lines and time-of-day light (Phase 3)

Read `PLAN.md` §7 and `docs/contracts.md` first. The contract fields already exist (branch `phase3-contracts`):
`layers.contours`, `sunHour` / `setSunHour` / `clampSunHour` in the store, `contours` and `sunHour` in `StyleOptions`,
the `contours` layer toggle in `LayerControls` and in `?l=`. They do nothing yet; you make them work.

## Goal
1. **Contour lines** generated in the browser from the terrain DEM we already load (no new hosting), visible at
   z ≥ 10 (fully drawn by 10.5, where flights land; first specified as 11), toggle default off (`layer-toggle-contours`).
2. **Time-of-day light**: a sun slider (local solar time 05:00–19:00) that moves the hillshade light to where the sun
   would be at that hour over the place you're looking at. `null` keeps today's fixed light exactly as it is.

## Contours
- Evaluate `maplibre-contour` (onthegomap) first: it builds vector contour tiles in a worker from a raster-dem
  source. Check it works with MapLibre 6.17, Mapterhorn's terrarium **webp** tiles, the AWS fallback (terrarium png),
  and our worker setup (`src/map/setupMaplibre.ts`). If it can't, say why in the PR and propose the alternative
  before building one.
- When the DEM falls back to AWS (`style:dem-fallback`, `demProvider: 'aws'`), contours must follow the same provider.
- Intervals by zoom (e.g. 50 m / major 250 m at z 11–12, 20 m / major 100 m at z 13+); label major lines in metres
  ("450 m"), `Noto Sans Regular` from the existing glyphs. Thin, low-contrast lines that read on imagery and relief.
- Layer order: above imagery / hillshade / relief, **below** `LAYER_LABELS_FIRST` (markers go just under labels).
- Watch the request count: the contour DEM fetches must not double the tile traffic of the terrain itself. Measure
  it at a typical nation view and put the numbers in the PR.

## Time-of-day light
- Pure function `sunPosition(lat, lng, date, hour)` → `{ azimuthDeg, altitudeDeg }` (NOAA formulas or `suncalc`;
  unit-test against a few published values). Location = the selected nation's point, else the map centre at the
  moment the slider moves (no re-computation on every pan). Date = today in Australia.
- Map it to `hillshade-illumination-direction` (sun azimuth, **`hillshade-illumination-anchor: 'map'`** while a sun
  hour is set) and, if MapLibre 6.17 supports it with our hillshade method, `hillshade-illumination-altitude`.
  Low sun → warmer highlight / longer shadow tones. Optionally a subtle sky/horizon tint. `sunHour: null` →
  every paint value back to today's exact defaults (`anchor: 'viewport'`, direction 315).
- UI in `LayerControls`: a "Light" row with `sun-slider` (step 0.25 h, `aria-valuetext` "7:30 am") and a
  `sun-reset` button ("Default light"). URL: `?t=14.5` (omit when null), read on boot and written with the others.
- No `setStyle`; everything through `applyStyleOptions` (wiring already re-applies when `sunHour` changes).

## Files you own
`src/map/style/**` (new `layers/contours.ts`, `lighting.ts`, edits to `buildStyle.ts`, `applyStyleOptions.ts`,
`sources.ts`, `ids.ts`, the style dev page), `src/app/LayerControls.tsx`, `src/app/UrlSync.ts` (+ tests),
`package.json` / `pnpm-lock.yaml` for new deps, `tests/playwright/landscape.spec.ts` (new), `docs/style.md` (append).
WS9 also makes a small edit in `buildStyle.ts` / `applyStyleOptions.ts` (globe projection) — keep yours in your own
files and leave a one-line call in those two.

## Done when
- Unit tests: sun position, contour intervals, `applyStyleOptions` for both new options (incl. null → defaults).
- `landscape.spec.ts`: toggling contours adds visible contour features at z ≥ 11 with tile fixtures; moving the sun
  slider changes `hillshade-illumination-direction` and writes `?t=`; reset restores the defaults and drops `?t=`.
  Mapterhorn fixtures may not cover your test view — use `tests/fixtures/tiles` helpers (see `docs/qa.md`).
- Screenshots in the PR: contours on imagery and on relief; the same valley at 07:00, 12:00 and 18:00.
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` pass; app JS stays under the 150 KB gz budget.
