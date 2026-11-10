# Country Map

A browser app showing Australia as a 3D terrain map, with a side panel of Aboriginal and Torres Strait
Islander nations and language groups. Selecting one flies the camera to that group's Country and shows
what the place is called today. Locations are approximate single points from AUSTLANG (AIATSIS), not
boundaries.

Start with [`PLAN.md`](PLAN.md), then [`docs/contracts.md`](docs/contracts.md), then your workstream brief:

| ID | Workstream | Brief |
|---|---|---|
| WS0 | Scaffold & contracts | [`docs/workstreams/WS0-scaffold.md`](docs/workstreams/WS0-scaffold.md) |
| WS1 | Terrain & basemap style | [`docs/workstreams/WS1-terrain-style.md`](docs/workstreams/WS1-terrain-style.md) |
| WS2 | Camera choreography & markers | [`docs/workstreams/WS2-camera-markers.md`](docs/workstreams/WS2-camera-markers.md) |
| WS3 | Data pipeline | [`docs/workstreams/WS3-data-pipeline.md`](docs/workstreams/WS3-data-pipeline.md) |
| WS4 | Side panel & info card | [`docs/workstreams/WS4-side-panel.md`](docs/workstreams/WS4-side-panel.md) |
| WS5 | App shell & integration | [`docs/workstreams/WS5-app-shell.md`](docs/workstreams/WS5-app-shell.md) |
| WS6 | QA, performance, deploy | [`docs/workstreams/WS6-qa-deploy.md`](docs/workstreams/WS6-qa-deploy.md) |
| WS7 | Phase 3: contours, time-of-day light | [`docs/workstreams/WS7-landscape-detail.md`](docs/workstreams/WS7-landscape-detail.md) |
| WS8 | Phase 3: nearest town & landmark | [`docs/workstreams/WS8-nearby.md`](docs/workstreams/WS8-nearby.md) |
| WS9 | Phase 3: globe view, guided tour | [`docs/workstreams/WS9-globe-tour.md`](docs/workstreams/WS9-globe-tour.md) |

Research, licences and attribution strings: [`docs/research.md`](docs/research.md).

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Optional: the "Whose Country?" territory overlay needs a Native Land Digital API key. Copy `.env.example`
to `.env.local` and set `VITE_NATIVE_LAND_KEY`. Place search works without it. See `docs/places.md`.

Toolchain (installed 2026-11-09 via Homebrew under `/opt/homebrew`):

| Tool | Version |
|---|---|
| Node | 26.13.0 (`.node-version`: 26) |
| pnpm | 12.18.0 (pinned in `package.json` `packageManager`) |
| Python | 3.15.2 |
| git | 2.56.0 |
| GitHub CLI | 2.103.3 |

macOS also ships `/usr/bin/git` (2.50) and `/usr/bin/python3` (3.9). If `git --version` or `python3 --version`
shows those, put `/opt/homebrew/bin` first on your `PATH` (`~/.zprofile` does this for login shells).

Key libraries: MapLibre GL JS 6.17, React 19, zustand 5, Vite 8, Vitest 5, TypeScript 6.0, ESLint 10.
TypeScript is pinned to 6.0 because typescript-eslint does not support TypeScript 7 yet.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `pnpm preview` | Serve `dist/` locally (http://localhost:4173) |
| `pnpm typecheck` | `tsc -b` over app and config tsconfigs |
| `pnpm lint` | ESLint (typescript-eslint + react-hooks) |
| `pnpm test` | Vitest unit tests (`src/**/*.test.ts`, `tests/unit/**`) |
| `pnpm format` / `format:check` | Prettier write / check |
| `pnpm data:build` | Rebuild `public/data/nations.json` and `attribution.json` from AUSTLANG, ABS and Wikidata (WS3; see `data/report.md`) |
| `pnpm data:validate` | Validate the committed data files against the schema |
| `pnpm images:draft` | Draft a landscape prompt and alt text per nation for info-card pictures (`data/image-prompts.json`; see `docs/images.md`) |
| `pnpm images:generate` | Estimate cost, or with `--yes` generate the pictures through Vercel AI Gateway (needs `AI_GATEWAY_API_KEY`) |
| `pnpm build:e2e` | Production build with `VITE_E2E=1` (exposes `window.__map` for Playwright) |
| `pnpm test:e2e` | `build:e2e`, then the Playwright suite (`tests/playwright`, see `docs/qa.md`) |
| `pnpm size` | Bundle size budgets (`.size-limit.json`) |
| `pnpm lhci` | Lighthouse CI against the production build |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, unit tests, bundle size and Lighthouse on
every PR and on `main`. The Playwright e2e suite runs only on demand (Actions → CI → Run workflow): GitHub's
runners have no GPU, so the 3D map renders in software and the suite takes 20+ minutes. Run `pnpm test:e2e`
locally before merging changes to the map, camera or UI.

## Data

`public/data/nations.json` holds 455 nations and language groups built by `pnpm data:build` from AUSTLANG
(AIATSIS, via TLCMap), ABS 2021 suburbs and localities, Wikidata, and OpenStreetMap for the nearest town and
landmark (`nearby`). `public/data/attribution.json` holds the credits the app shows. What the build cleaned or
excluded is listed in `data/report.md` and `data/cleaning.json`.

**Data licences:** see [`public/data/LICENSE.md`](public/data/LICENSE.md). In short, the AUSTLANG and ABS parts of
`nations.json` are CC BY 4.0. The OpenStreetMap-derived `nearby` part and the OSM snapshots in `data/cache/osm/` are
© OpenStreetMap contributors and available under the Open Database License (ODbL 1.0). `pnpm data:build`
recreates the files from the committed snapshots.

The dev server falls back to [`src/data/mock-nations.json`](src/data/mock-nations.json) (10 entries, same
schema) if `nations.json` is missing; production builds treat a missing file as an error.

## Deploy

`main` deploys to production on Vercel (https://map-demo-orpin.vercel.app); every PR gets a preview. Commits
must be authored with the email on the Vercel account, or the Hobby plan skips the build.

## Notes for workers

- **MapLibre worker:** MapLibre 6 locates its web worker with a computed `import.meta.url` path that Vite
  can't follow. [`src/map/setupMaplibre.ts`](src/map/setupMaplibre.ts) imports the worker with `?url` and
  calls `maplibregl.setWorkerUrl()`. Import it before creating any `Map` (`MapView.tsx` already does).
  Never load MapLibre with `<script src>`.
- `src/types/nation.ts` and `src/map/style/ids.ts` are kept verbatim from `docs/contracts.md` and are
  excluded from Prettier so diffs against the contract stay clean.

## PR rules

1. Touch only the files your workstream owns (see `docs/contracts.md` → Repo layout & ownership).
   Contract changes go through a PR to `docs/contracts.md` that pings every owner.
2. `pnpm typecheck && pnpm lint && pnpm test` must pass; add unit tests for pure logic.
3. Visual changes need a screenshot or short clip in the PR description.
4. No runtime keys or secrets. Keep attribution correct (exact strings in `docs/research.md`).
5. Use "nations", "language groups", "people", "Country". Never "tribes".
