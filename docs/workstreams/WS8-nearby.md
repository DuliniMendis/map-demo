# WS8 — Nearest town and landmark (Phase 3)

Read `PLAN.md` §8 (cultural & legal guardrails) and `docs/contracts.md` first. The contract already has
`Nation.nearby?: { town?: NearbyFeature; landmark?: NearbyFeature }` (branch `phase3-contracts`).

## Goal
For each of the 455 nations, at **build time**, find from OpenStreetMap:
- `town`: the nearest `place=city|town` within 100 km (not villages or hamlets);
- `landmark`: the nearest named natural feature within 50 km: `natural=peak`, `waterway=river`,
  `natural=water` + `water=lake`, `natural=ridge|mountain_range`.
Store them in `public/data/nations.json` and show them on the info card: "Near Alice Springs (town, 12 km NE)",
"Landmark: Mount Sonder (peak, 8 km W)".

## Data
- Overpass API, a **few big queries for all of Australia** (one per feature class), never one query per nation.
  Identify the client with a generic User-Agent naming the project (no personal email). Cache raw responses under
  `data/cache/osm/` with the fetch date; reruns must use the cache unless `--refresh`.
- Rivers are lines: distance = to the nearest point on the line (`out geom`), not to a centre point. Lakes/ranges:
  `out center` is fine.
- `distanceKm` great-circle from the nation's point, 1 decimal; `bearing` 8-point compass from the point to the
  feature. Names exactly as the OSM `name` tag (dual names like "Uluru / Ayers Rock" stay as published).
- New script `scripts/nearby.ts`, wired into `pnpm data:build` after the ABS lookup; schema/validation updated;
  `data/report.md` gets coverage numbers (how many nations have a town, a landmark, by state) and any oddities.

## Licence (do this properly)
OSM data is ODbL. Add an `attribution.json` item: "Nearby towns and landmarks © OpenStreetMap contributors, ODbL"
with the ODbL URL and `usedFor`. The bundled fallback in `src/app/attributionFallback.ts` must match (a unit test
checks they're equal). In the PR, state whether storing these extracts in `nations.json` makes it a derivative
database under ODbL and what that obliges us to do; don't decide it silently.

## Cultural guardrails
These are today's (mostly colonial) place names. Present them as orientation only, under "Country today"; never as a
name for the nation or its Country. No new wording that implies boundaries.

## UI
`src/ui/InfoCard.tsx`: in the "Country today" block, a `data-testid="info-nearby"` element with the town line and
the landmark line; omit each when absent. Keep the card's axe result clean and the existing tests passing.
Add `nearby` to a few entries in `src/data/mock-nations.json` so dev/test without real data shows it.

## Files you own
`scripts/**`, `data/**`, `public/data/**`, `src/ui/InfoCard.tsx` (+ its test and the card's part of `ui.css`),
`src/data/mock-nations.json`, `src/app/attributionFallback.ts` (data only), `tests/unit/nations-data.test.ts`.

## Done when
- Unit tests: distance, bearing, point-to-line distance, nearest search, the ≤ 100 km / ≤ 50 km cut-offs.
- `pnpm data:build` reproduces `nations.json` from the cache; `pnpm data:validate` passes.
- PR lists coverage numbers and 10 spot-checked nations (checked on a map) with screenshots of the card.
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` pass.
