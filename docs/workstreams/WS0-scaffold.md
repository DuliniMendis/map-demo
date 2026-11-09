# WS0 — Scaffold & contracts (sequential, ~1 hour, runs first)

**Goal:** a repo everyone can clone and run in 2 minutes, with the shared types, store skeleton and mock data
that WS1–WS6 build against. Nothing map-specific beyond a blank `MapView` that proves MapLibre loads.

**Owns:** repo root config, `src/types/`, `src/store/`, `src/data/`, `src/map/MapView.tsx` (stub), `.github/workflows/ci.yml` (typecheck+lint+unit only).

## Steps

1. Toolchain is already on this Mac via Homebrew: Node 26.13, pnpm 12.18, Python 3.15, git 2.56, gh 2.103. Record versions in `README.md`. Add `.node-version` (`26`) and `packageManager` in `package.json`.
2. `git init`, `main` branch, `.gitignore` (node, dist, .env, .DS_Store), `.editorconfig`.
3. `pnpm create vite@latest . --template react-ts`; add deps: `maplibre-gl@^6.17`, `zustand`, dev: `eslint` (typescript-eslint, react-hooks), `prettier`, `vitest`, `@types/geojson`.
   MapLibre 6 is ESM-only; Vite handles the worker automatically. Do **not** add any `<script src>` for it.
4. Create `src/types/nation.ts` exactly as in `docs/contracts.md`. Export `STATE_CODES` and `STATE_NAMES` maps.
5. Create `src/store/useAppStore.ts` with the full `AppState` shape and trivial actions; `reducedMotion` initialised from `matchMedia('(prefers-reduced-motion: reduce)')`.
6. Create `src/data/mock-nations.json` with 10 real entries hand-filled from AUSTLANG (ids, names, coords) covering every state: e.g. Pitjantjatjara C6 (NT/SA), Noongar W41 (WA), Wurundjeri/Woiwurrung S36 (VIC), Gadigal/Dharug (NSW), Yolŋu Matha N230 (NT), Turrbal E86 (QLD), Palawa kani (TAS), Ngunnawal D3 (ACT), Kaurna L3 (SA), Meriam Mir Y3 (Torres Strait). Fill `modern.locality/state` by hand from the ABS query in `docs/research.md`. Mark the file "MOCK — replaced by WS3".
7. `src/data/loadNations.ts`: `fetch('/data/nations.json')`, falls back to the mock in dev when the file is missing; validates `count === nations.length`.
8. `src/map/MapView.tsx` stub: creates a `maplibregl.Map` with an empty style + `OVERVIEW_CAMERA` from a temporary `src/map/style/ids.ts` (WS1 will replace the file; keep the exported names identical to contracts).
9. `index.html`/`App.tsx`: two-column grid (`aside` 360 px + `main`), placeholder text in the aside. Fonts: system stack.
10. Scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `format`. CI runs typecheck/lint/test on PR.
11. `README.md`: setup, scripts, links to `PLAN.md`, `docs/contracts.md`, workstream briefs; PR rules (owner files only, screenshot for visual PRs).
12. Open one PR per later workstream as a *draft* with the brief pasted in, so workers claim them.

## Done when
- `pnpm i && pnpm dev` shows the two-column shell with a blank map canvas and no console errors.
- `pnpm typecheck && pnpm lint && pnpm test` pass in CI.
- `docs/contracts.md` types compile unchanged.

## Don't
- Don't implement style, camera, UI or data — stubs only. Don't add a UI framework beyond React.
