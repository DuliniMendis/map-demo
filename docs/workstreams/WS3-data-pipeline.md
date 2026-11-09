# WS3 — Data pipeline: AUSTLANG → `nations.json` with "Country today"

**Goal:** a reproducible, licence-clean build script producing `public/data/nations.json` (455 nations) and
`public/data/attribution.json`, plus a committed raw snapshot. No runtime API calls in the app.

**Owns:** `scripts/**`, `data/**`, `public/data/**`. Reference: `docs/research.md` (data sources, ABS query), `docs/contracts.md` (`Nation` type).

## Deliverables

1. `scripts/fetch-austlang.ts` — downloads `https://tlcmap.org/layers/81/json/download` to `data/raw/austlang-tlcmap-<date>.geojson` (≈1 MB, 455 Point features). Also try the canonical AIATSIS CSV (`collection.aiatsis.gov.au/datasets/austlang/001.csv` → redirects to `api.aiatsis.gov.au`, which did not resolve on 2026‑11‑09); if it works, store it too and diff counts. Never overwrite a snapshot; the build reads the newest.
2. `scripts/build-nations.ts`
   - Map properties → `Nation`: `id = language_code`, `name = language_name.trim()`, `peopleName = thesaurus_heading_people` (strip trailing code), `synonyms = split(language_synonym, ', ')` de-duplicated, coords from `approximate_*_of_language_variety` (fallback `latitude/longitude`), `links.austlang` = the href inside `uri` (it's an `<a>` tag string — extract).
   - Drop features with missing/zero coordinates or outside `AUSTRALIA_BOUNDS` (log them to `data/report.md`).
   - Sort by `name` with `localeCompare('en-AU')`; `generatedAt`, `count`.
3. `scripts/abs-lookup.ts` — for each nation, point-in-polygon against ABS ASGS 2021 SAL:
   - Default: the ArcGIS FeatureServer query from research.md, 5 concurrent, retry/backoff, cache to `data/cache/sal/<id>.json`.
   - Offline mode (`--gpkg path`): read the ASGS 2021 GeoPackage with `better-sqlite3` + `@turf/boolean-point-in-polygon` (or a Python 3 helper with `shapely` if easier — Python 3.9 is on the machine).
   - Also fetch state via `state_name_2021`; map to `stateCode`. Points in the sea (Torres Strait islands can fall outside SAL polygons): nearest SAL within 25 km (`--nearest` flag), else `locality: 'Offshore'` and the state from the ABS STE layer.
4. `scripts/wikidata.ts` (optional, same PR or follow-up): SPARQL `?item wdt:P1251 ?code` → `links.wikipedia` (en sitelink) for the 456 matched items; cache responses.
5. `data/overrides.json` — `{ "<id>": { "view": {zoom,pitch,bearing}, "name"?: string } }` merged last. Seed with ~15 obvious ones (coastal: bearing toward land; alpine: zoom 11, pitch 70; flat interior: zoom 9.5).
6. `scripts/validate.ts` — JSON Schema generated from `src/types/nation.ts` via `ts-json-schema-generator`; fails on duplicates, bad coords, empty `modern.locality`; prints stats (per-state counts).
7. `public/data/attribution.json` — the exact strings from research.md with URLs and licences, consumed by WS5's footer/About.
8. `data/report.md` — generated: counts, dropped rows, nations sharing an identical point (AUSTLANG has some), lookup failures.
9. `package.json` script `data:build` = fetch → build → abs → validate. Document runtime (~2 min online).

## Done when
- `pnpm data:build` produces `nations.json` with 455 (±dropped, documented) entries; every entry has `modern.locality` and `modern.state`; validation passes in CI (validate only, no network).
- Spot checks match: Uluru-area nation (Pitjantjatjara C6) → Petermann, Northern Territory; Gadigal → Sydney, New South Wales.
- Licence/attribution file present; raw snapshot committed with date.

## Don't
- Don't fetch Native Land Digital or any AIATSIS map imagery. Don't rename AUSTLANG spellings (synonyms are the place for variants). Don't add polygons.
