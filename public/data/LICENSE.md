# Data licences

This notice covers the data files in `public/data/` (served by the site at `/data/`) and the
OpenStreetMap snapshots in the repository's `data/cache/osm/` folder. The application source code is
licensed separately.

## `nations.json`

`public/data/nations.json` combines data from several sources:

| Part of each record | Source | Licence |
|---|---|---|
| `id`, `name`, `peopleName`, `synonyms`, `lng`, `lat`, `links.austlang` | AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), via TLCMap | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `modern` ("Country today": suburb/locality and state) | © Australian Bureau of Statistics, ASGS Edition 3 (2021) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `links.wikipedia` | Wikidata | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `nearby` (nearest town or village, nearest named peak, river, lake or range) | Derived from © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |

The `nearby` data is made available under the **Open Database License (ODbL) 1.0**. Any rights in
the individual contents of that part are licensed under the
[Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/). Under the ODbL, if
you publicly use or redistribute the `nearby` data, or a database you build from it, you must:

- credit "© OpenStreetMap contributors"
- keep the derived data under the ODbL
- offer the derived data, or a way to recreate it

The AUSTLANG and ABS parts stay under CC BY 4.0 and need their own attribution.

The locations are approximate single points for each language variety. They are not boundaries,
and they are not suitable for native title or any land claim. The nearby place names are today's
(mostly colonial) names and are given for orientation only.

## OpenStreetMap snapshots (`data/cache/osm/*.json`)

The files `towns.json`, `villages.json`, `peaks.json`, `rivers.json`, `lakes.json` and
`ranges.json` in `data/cache/osm/` are trimmed extracts of OpenStreetMap. Each one holds only the
OSM id, name, kind and the coordinates needed for distance. Each file records the query, the date
it was run and the OSM data timestamp. The files are © OpenStreetMap contributors and available
under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The same applies to
`data/cache/osm/nearby.json`, the per-nation result computed from them.

## How to recreate the data

The repository contains everything needed to rebuild these files:

- `pnpm data:build` rebuilds `nations.json`, `attribution.json` and `data/report.md` from the
  committed snapshots without touching the network. It runs `scripts/fetch-austlang.ts`,
  `scripts/abs-lookup.ts`, `scripts/nearby.ts`, `scripts/wikidata.ts`, `scripts/build-nations.ts`
  and `scripts/validate.ts`.
- `node scripts/nearby.ts --refresh` re-runs the Australia-wide Overpass queries, one per feature
  class, and regenerates the OpenStreetMap snapshots. The exact queries are in that script and in
  each snapshot's `query` field.
- `data/report.md` lists the sources, snapshot dates, coverage and anything the build cleaned or
  excluded.
- `public/data/attribution.json` holds the full credit lines shown in the app.
