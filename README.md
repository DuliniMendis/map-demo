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

Research, licences and attribution strings: [`docs/research.md`](docs/research.md).

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

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

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check and unit tests on every PR.

## Data

Until WS3 lands `public/data/nations.json`, the dev server falls back to
[`src/data/mock-nations.json`](src/data/mock-nations.json): 10 real AUSTLANG entries, one per state and
territory, same schema. Production builds require the real file.

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
