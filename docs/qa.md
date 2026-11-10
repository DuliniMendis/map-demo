# QA, performance, accessibility and deploy (WS6)

How we test Country Map, what the budgets are, how we deploy, and the manual checks before a release.
Owner: WS6. Brief: [`docs/workstreams/WS6-qa-deploy.md`](workstreams/WS6-qa-deploy.md).

## Running the checks

On CI, `check`, `size` and `lighthouse` run on every PR and push to `main`. The `e2e` job runs **only on demand**
(Actions → CI → Run workflow, optionally with `update_snapshots`): without a GPU the runner renders WebGL in
software and the suite takes 20+ minutes. Run `pnpm test:e2e` locally before merging map, camera or UI changes.

| Command | What it does | Where outputs go |
|---|---|---|
| `pnpm test` | Vitest unit tests (`src/**/*.test.ts`, `tests/unit/**/*.test.ts`) | terminal |
| `pnpm test:e2e` | `pnpm build:e2e` (production build with `VITE_E2E=1`), then Playwright against `vite preview` on **127.0.0.1:4206** | `node_modules/.cache/playwright/{report,test-results}` |
| `pnpm exec playwright test boot` | One spec file, reusing an existing `dist/` (rebuild with `pnpm build:e2e` after source changes) | same |
| `pnpm exec playwright show-report node_modules/.cache/playwright/report` | Open the HTML report | |
| `pnpm test:e2e:ui` | Playwright UI mode | |
| `pnpm size` | Production build, a second build with MapLibre split into its own chunk, then `size-limit` (`.size-limit.json`) | terminal |
| `pnpm lhci` | Production build, Lighthouse CI x3 on `dist/` (`lighthouserc.json`) | `node_modules/.cache/lhci/*.report.html` |

First time on a machine: `pnpm exec playwright install chromium`. Lighthouse uses your installed Chrome
(set `CHROME_PATH` to point elsewhere).

Notes:
- Test and Lighthouse outputs live under `node_modules/.cache/` so git, Prettier and ESLint never see them.
  `lhci` also writes a scratch `.lighthouseci/` folder at the repo root; `pnpm lhci` deletes it on success.
  If a run fails, delete it yourself before `pnpm format:check`.
- Playwright reuses a server already listening on port 4206 when not on CI. Override with
  `E2E_PORT=…`, or point at a deployed site with `E2E_BASE_URL=https://…` (then no server is started).
- WebGL: Chromium runs with ANGLE on Metal on macOS, and on SwiftShader (software, `--enable-unsafe-swiftshader`)
  on Linux. See `playwright.config.ts`.
- Vitest only collects `*.test.ts`; Playwright only collects `tests/playwright/**/*.spec.ts`. Keep it that way.
- Test code is type-checked by `pnpm typecheck` through `tsconfig.tests.json` (referenced from `tsconfig.json`).

## Test inventory

Every test below runs. A test for a feature that is not on `main` yet is marked `test.fixme(true, '<reason>')` until it lands.
When the feature lands, delete that one line in the same PR. Status as of WS6's Phase 1 PR:

| Spec | Test | Status | Lights up when |
|---|---|---|---|
| `boot` | shell renders: `side-panel`, `map-canvas`, live WebGL context, no console errors, no unmatched external requests | **runs** | |
| `boot` | starts at `OVERVIEW_CAMERA` | **runs** | |
| `boot` | terrain/imagery/labels tiles all come from fixtures | **runs** | |
| `selection` | list click → `info-card` shows `info-locality` "Calomba", `info-state` "South Australia", URL `?n=L3` | **runs** | |
| `selection` | re-select L3 → A43: zoom dips (rise) then rises, flight ≤ 6 s | **runs** | |
| `selection` | marker click (position from `map.project`, not pixels) selects S64 | **runs** | |
| `selection` | keyboard: ArrowDown from search into the list, Enter selects, Escape closes card and keeps focus on the row | **runs** | |
| `selection` | reduced motion: jump ≤ 0.4 s, no rise | **runs** | |
| `selection` | search by name / synonym / locality, state filter | **runs** | |
| `selection` | deep link `?n=A43` restores; unknown `?n=` ignored | **runs** | |
| `layers` | each `layer-toggle-<key>` flips layout `visibility` and writes `?l=` | **runs** | |
| `layers` | `exaggeration-slider` sets `getTerrain().exaggeration` and `?x=`; `?l=`/`?x=` restored on load | **runs** | |
| `fallback` | Mapterhorn → HTTP 500: `style:dem-fallback` fires, "backup terrain" toast (`role=status`), AWS tiles requested | **runs** | |
| `a11y` | axe (WCAG 2.2 AA + best practice) on the whole page at the overview | **runs** | |
| `a11y` | axe on side panel, info card, About dialog (+ focus return); attribution names every source | **runs** | |
| `visual` | `overview.png` (Linux baseline) | **runs on Linux/CI**, skipped elsewhere | |
| `visual` | Uluru, Blue Mountains, Kakadu, Tasmania at fixed `jumpTo` cameras; mobile panel 390×844 | **runs on Linux/CI**, skipped elsewhere | |
| `perf` | median FPS during a flight ≥ 30 (advisory on Linux: logged as an annotation) | **runs** | |
| `tile-fixtures` | page and **web worker** fetches to every tile host are served from fixtures; unknown hosts are blocked | **runs** | |
| `static` | `robots.txt` served; `404.html` renders and links home | **runs** | |
| unit `tileRoutes` | URL → fixture mapping for Mapterhorn, AWS, EOX (`{z}/{y}/{x}`), OpenFreeMap | **runs** | |
| unit `vercelConfig` | `vercel.json` cache headers, clean URLs, no catch-all rewrite, 404 + robots present | **runs** | |

`camera.spec.ts` (WS2's controller test) drives `src/map/controller/dev.html`, so it runs in its own Playwright
project (`camera-dev`) against the Vite dev server on port 4207; the rest run against `vite preview` of the
`build:e2e` output on port 4206.

### What the e2e suite expects from other workstreams

- **Test ids** exactly as in `docs/contracts.md`: `side-panel`, `search-input`, `state-filter` (a `<select>`
  whose option values are the `stateCode`s), `nation-item-<id>`, `info-card`, `info-locality`, `info-state`,
  `map-canvas`, `layer-toggle-<imagery|labels|hillshade|relief>`, `exaggeration-slider` (`<input type=range>`),
  `about-button`, `attribution`.
- **`window.__map`** (WS5): the `maplibregl.Map`, set only when
  `import.meta.env.DEV || import.meta.env.VITE_E2E === '1'`. `pnpm build:e2e` sets `VITE_E2E=1`; normal
  production builds (and Vercel) must not expose it. Add `VITE_E2E` to `ImportMetaEnv` in `src/vite-env.d.ts`.
- **Markers** (WS2): source `nations`, features with property `code` = `Nation.id`.
- **DEM fallback** (WS1 → WS5): the map fires `style:dem-fallback`; the toast is a `role="status"` region
  whose text contains "backup terrain".
- **About** (WS5): a `role="dialog"`; Escape closes it and returns focus to `about-button`.
- **Info card** (WS4): Escape closes it and returns focus to the list item.
- Test nations (real AUSTLANG ids, present in mock and real data): L3 Kaurna → Calomba, South Australia;
  A43 Ngaatjatjarra → Ngaanyatjarra-Giles, Western Australia; S64 Dharug → Jenolan, New South Wales.
  (The brief's Pitjantjatjara `C6` is not in AUSTLANG.)

### "Red when a test id is removed" (proved once)

On 2026-11-09, `data-testid="side-panel"` in `src/app/App.tsx` was changed locally to `side-panel-broken`,
`pnpm build:e2e && pnpm exec playwright test boot` failed with
`expect(locator).toBeVisible() failed … getByTestId('side-panel') … element(s) not found`, and the change was
reverted (never committed).

## Tile fixtures

`tests/playwright/support/fixtures.ts` installs `mockTiles()` automatically for every test. It routes every
non-local request in the browser context, including those from MapLibre's web worker:

| Host | Fixture (committed, real tiles) | Anything else |
|---|---|---|
| `tiles.mapterhorn.com/{z}/{x}/{y}.webp` | z3 + z4 over Australia (`mapterhorn/`) | flat 0 m terrarium PNG, 512 px |
| `s3.amazonaws.com/elevation-tiles-prod/terrarium/…` | z3 over Australia (`aws/`) | flat 0 m terrarium PNG, 256 px |
| `tiles.maps.eox.at/wmts/…/{z}/{y}/{x}.jpg` | z4 + z5 over Australia (`eox/`, stored as z/x/y) | solid earth-tone PNG |
| `tiles.openfreemap.org` | TileJSON, z3 vector tiles, `Noto Sans Regular` 0–255 glyphs | empty `.pbf`; sprites `{}` + 1 px PNG |
| any other external URL | | **aborted** and listed in `tiles.blocked` (the boot test asserts it is empty) |

Policy:
- Keep the committed set small (currently ~2.4 MB, budget < 3 MB). Add a real tile only when a visual
  baseline needs it; otherwise rely on the fallbacks.
- Refresh with `bash tests/fixtures/tiles/fetch-fixtures.sh` (sequential, 0.5 s apart, identifying
  User-Agent; skips files already present). Regenerate fallbacks with `node tests/fixtures/tiles/make-fallbacks.ts`.
- New tile URL patterns go in `tests/playwright/support/tileRoutes.ts` with a unit test in `tests/unit/tileRoutes.test.ts`.
- Use `test.use({ tileOptions: { failHosts: ['mapterhorn'] } })` to inject failures.
- Licences of fixture tiles are the same as the live sources (`docs/research.md`); they are used only for tests.

## Rate-limit etiquette

Mapterhorn, AWS Terrain Tiles, EOX and OpenFreeMap are free services run without an SLA. Be a good guest:
- **Never** point CI, load tests, benchmarks or loops at the live hosts. Playwright blocks them; Lighthouse
  blocks them via `blockedUrlPatterns` in `lighthouserc.json`.
- Don't load-test or "warm" tiles. Don't script bulk downloads. A fixture refresh is a few dozen requests,
  done by hand, rarely.
- Manual testing in a real browser is fine; the browser cache does the right thing.
- If we ever need heavy traffic (e.g. a public launch), self-host PMTiles for Australia (PLAN.md §10, Phase 3).

## Visual baselines

Screenshots differ between operating systems (fonts, WebGL rasteriser), so baselines are committed for
**Linux only** (`tests/playwright/__screenshots__/…-chromium-linux.png`) and `visual.spec.ts` is skipped on
other platforms. On CI a missing or changed baseline fails the `e2e` job; the actual image is in the
`playwright-report` artifact.

To create or update baselines after an intended visual change:
1. **From CI (preferred):** Actions → CI → Run workflow → pick the branch, tick `update_snapshots`. Download
   the `visual-baselines` artifact and commit its contents into `tests/playwright/__screenshots__/`.
   (Needs this workflow on `main`. Before that, use a failed run's `playwright-report` artifact: for a
   changed baseline copy `*-actual.png`; for a missing one copy `test-results/<test>/test-failed-1.png`, to
   the baseline path printed in the failure. The first `overview` baseline was made this way.)
2. **Locally with Docker** (untested so far: no Docker on the dev machine; the image's Node may be older
   than `.node-version`, which is fine for building and testing):
   `docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble bash -c "corepack enable && pnpm install --frozen-lockfile && pnpm build:e2e && pnpm exec playwright test visual --update-snapshots"`

Never commit `-darwin` or `-win32` baselines. `maxDiffPixelRatio` is 0.02.

## Budgets

Measured 2026-11-09 on the WS0 scaffold (MapLibre 6.17, React 19, no UI yet). Limits leave headroom for
Phase 2; the contract ceiling is in brackets.

| Budget | Today | Limit | Enforced by |
|---|---|---|---|
| App JS excluding MapLibre, gzip | 72.5 KB | 150 KB (contract: ≤ 400 KB) | `size` job, error |
| MapLibre GL main chunk, gzip | 282.9 KB | 300 KB (contract said ≈ 250 KB; 6.17 is 283 KB) | `size` job, error |
| MapLibre GL worker, gzip (off main thread) | 147.4 KB | 160 KB | `size` job, error |
| CSS, gzip | 10.6 KB | 16 KB | `size` job, error |
| All JS shipped in `dist/`, gzip | 502.7 KB | 650 KB (400 + 250) | `size` job, error |
| Lighthouse accessibility (desktop, median of 3) | 100 | ≥ 95 | `lighthouse` job, **error** |
| Lighthouse performance (desktop, median of 3) | 100 locally | ≥ 80 | `lighthouse` job, **warn** (advisory) |
| Lighthouse best practices / SEO | 96 / 100 | ≥ 90 | warn |
| Flight median FPS | n/a | ≥ 30 | `perf.spec.ts`, advisory on Linux |

Why the split build: Vite emits MapLibre and the app in one chunk, so `pnpm size` runs a second build
(`tests/size/split-build.ts`) with MapLibre in its own chunk purely to measure "app excluding MapLibre".
`dist/` itself is not changed. If WS5 adds real code-splitting, point `.size-limit.json` at `dist/` directly.

Why performance is advisory: CI runners have no GPU, so MapLibre renders through SwiftShader and
main-thread time varies run to run. Tiles are blocked in Lighthouse, so the score measures our bundle and
boot, not tile hosts. Re-check perf on a real machine before release.

## Deploy

- Vercel project `map-demo` (team `dulini-mendis-projects`), Git-connected. Production
  <https://map-demo-orpin.vercel.app> deploys from `main`; every PR gets a preview deployment (behind Vercel
  Deployment Protection, so previews need a Vercel login; only production is public).
- Vercel deploys a commit only when its author email is `dulini.mendis@gmail.com` (repo-local git config).
- `vercel.json`: framework `vite`, output `dist`, `cleanUrls`. Cache: `/assets/*` (hashed) one year
  `immutable`; `/data/*.json` `max-age=0, s-maxage=86400, stale-while-revalidate=604800` (browsers revalidate,
  the edge serves for a day). HTML keeps Vercel's default (revalidate). Security headers: `nosniff`,
  `strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`.
- 404: `public/404.html` is served by Vercel for unknown paths with status 404. There is deliberately no
  catch-all rewrite to `index.html`: the app has one route and keeps its state in the query string
  (`/?n=L3`), so a rewrite would only hide missing files (e.g. `/data/nations.json` returning HTML).
- `public/robots.txt` allows everything (previews are protected anyway).

## Manual VoiceOver pass (macOS Safari + VoiceOver)

**Status: not yet performed.** Do this once WS4 and WS5 have landed, before the first public release, and
record the date, macOS/Safari versions and findings here.

- [ ] Page title and `lang="en-AU"` announced; landmarks (rotor → Landmarks) list the side panel region, main, and footer/attribution.
- [ ] Disclaimer banner on first visit is announced and dismissable by keyboard; dismissal remembered.
- [ ] Search field has a label; typing announces the number of results (live region, polite).
- [ ] State filter is a labelled control; changing it announces the new count.
- [ ] Nation list: each item reads name (and people name), position in set; arrow keys move; Enter selects.
- [ ] After selecting: the flight does not steal focus; the info card is announced (name, "Country today: locality, state") when the camera arrives.
- [ ] Info card links (AUSTLANG, Wikipedia) have descriptive names; Escape closes the card and focus returns to the list.
- [ ] Map canvas has an accessible name and is not a keyboard trap; map keyboard shortcuts don't hijack screen-reader keys.
- [ ] Layer toggles and exaggeration slider: labelled, state (on/off, value) announced.
- [ ] About dialog: announced as a dialog with its title, focus trapped inside, Escape closes, focus returns to the About button. Acknowledgement of Country reads in full.
- [ ] Attribution expands by keyboard and every source is read.
- [ ] Reduced motion (System Settings → Accessibility → Display → Reduce motion): selection jumps instead of flying.
- [ ] Zoom to 200 % (browser) and increase text size: panel stays usable, nothing clipped.

## Release checklist

Before promoting a build to production (merging to `main`):

- [ ] CI green: `check`, `size`, `lighthouse`, and a manual `e2e` run (Run workflow) on the release commit. No new `test.fixme` without a reason; none left for features that have shipped.
- [ ] Attribution visible on the map at all times and complete (AUSTLANG/AIATSIS, Mapterhorn, AWS Terrain Tiles, EOX Sentinel‑2 cloudless, OpenMapTiles/OpenStreetMap, ABS, MapLibre), strings exactly as in `docs/research.md`.
- [ ] Disclaimer ("approximate locations, not boundaries") shows on first visit (clear `localStorage`) and in the info card.
- [ ] Data report from WS3 reviewed: 455 entries, every entry has coordinates, locality and state; schema validation passes; spot-check 5 random entries against AUSTLANG.
- [ ] Licences listed in About and in `public/data/attribution.json`; nothing from the AIATSIS map or Native Land bundled.
- [ ] Language check: "nations", "language groups", "people", "Country"; no "tribe" in UI copy (`grep -ri tribe src/ui src/app`; data synonyms are AUSTLANG's own and stay).
- [ ] Acknowledgement of Country present in About; "Suggest a correction" mailto works.
- [ ] Screenshots updated: visual baselines (if visuals changed), `docs/style.md`, README/OG image.
- [ ] Lighthouse report from the `lighthouse` artifact attached to the release PR; perf re-checked on a real machine (≥ 80 desktop).
- [ ] Manual VoiceOver pass above done for this release, or the changes since the last pass are UI-neutral.
- [ ] Tile hosts: spot-check each is up and attribution still matches their terms (EOX licence wording, PLAN.md §10).
- [ ] After deploy: production URL loads, `/?n=L3` deep link works, `/does-not-exist` shows the 404 page, `/data/nations.json` has the `s-maxage` header, `/assets/*` has `immutable`.
