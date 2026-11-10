# WS9 — Globe view and guided tour (Phase 3)

Read `PLAN.md` §6 (camera) and §8 (guardrails) and `docs/contracts.md` first. The contract already has
`StyleOptions.globe` (the app always passes `true`) and the store's `tour` / `setTour` (branch `phase3-contracts`).

## 1. Globe view
- MapLibre 6.17 globe projection when zoomed out, flat (mercator) from z 4 in, with a smooth transition (check the
  6.17 docs for the zoom-interpolated `projection` and the atmosphere/sky settings). `globe: false` → today's style.
- Put it in a new `src/map/style/projection.ts`; one line in `buildStyle.ts` and `applyStyleOptions.ts` (WS7 edits
  those files too — keep your change to that call).
- Check everything that touches the camera or projection still works and say so in the PR:
  overview camera (z 3.7 is now globe), `maxBounds` (`src/app/mapSetup.ts` — relax or change it if globe needs it),
  terrain and sky at the overview, markers (`circle-pitch-alignment: 'viewport'`) and their hit testing, WS2's rise
  step (it crosses z 4) with no visible jump, the DEM fallback, and frame rate at the overview.

## 2. Guided tour
- 12 curated stops from `nations.json` ids: spread over every state and the NT, different landscapes (desert,
  rainforest, coast, islands incl. Torres Strait, alpine, rivers). Stop list in `src/app/tour/stops.ts`.
- **Narration may only use facts in our data** (name, people name, Country today locality/state) plus a short,
  neutral description of the landscape at that point (e.g. "sandstone escarpment above a river floodplain").
  No cultural claims, history, stories or language words. Every line is a draft: list all 12 in `docs/tour.md`
  for the owner's review, and say so in the PR.
- UI: `tour-button` ("Tour") next to About. `tour-panel` over the map: "Stop 3 of 12", nation name, narration,
  `tour-prev`, `tour-next`, `tour-pause` (play/pause), `tour-stop`. Narration in an `aria-live="polite"` region.
- Playing: `select(stop)` → wait until `cameraState` is `idle` (the flight landed) → dwell ~8 s → next. Stop 12 ends
  the tour (paused at the last stop). Any user action that takes over (selecting another nation, dragging the map,
  Esc, opening About) pauses it. `tour-stop` → `setTour({ status: 'off' })`, clear the selection, fly to overview.
- Reduced motion: no auto-advance (start paused; next/prev still work, with the jump transitions).
- The info card shows as usual at each stop; the tour panel must not cover it or the marker (mobile too).

## Files you own
`src/app/tour/**` (new), one mount line + the button in `src/app/App.tsx`, tour styles in `src/app/app.css`,
`src/map/style/projection.ts` (new) + the call in `buildStyle.ts` / `applyStyleOptions.ts`, `src/app/mapSetup.ts`,
`src/map/MapView.tsx` only if globe needs a constructor option, `tests/playwright/tour.spec.ts` (new), `docs/tour.md`.

## Done when
- Unit tests: stop list validity (12 unique ids that exist in `nations.json`, all states covered), the tour state
  machine (play → land → dwell → next, pause on interaction, end, stop).
- `tour.spec.ts`: start the tour, it flies to stop 1 and shows the panel and card; next/prev/pause/stop work;
  selecting another nation pauses it. A globe check: at the overview the projection is globe; at z ≥ 5 it is mercator.
- Visual baselines will change at the overview (globe): don't commit `-linux` baselines yourself; note it in the PR.
- Screenshots or a short clip: overview globe, the transition while zooming in, the tour panel on desktop and mobile.
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` pass.
