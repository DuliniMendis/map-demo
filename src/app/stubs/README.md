# Temporary stubs (WS5) — Phase 2 swap points

Everything in this folder is a **placeholder** for modules owned by other workstreams, written against
`docs/contracts.md` so the app shell could be built and tested before WS1–WS4 merged. Nothing here is meant to
ship. The app imports these stubs **only** through `src/app/integration.ts` (plus one fallback list in
`src/app/attributionData.ts`), so integrating a workstream is a one-line import change.

## Swap list

| Workstream | Line in `src/app/integration.ts` (now) | Replace with | Then delete |
|---|---|---|---|
| WS1 style | `export { applyStyleOptions, buildStyle, watchDemFallback } from './stubs/buildStyle';` | `export { applyStyleOptions, buildStyle } from '../map/style/buildStyle';` + WS1's fallback hook (see note 1) | `stubs/buildStyle.ts` |
| WS1 style | `export type { StyleOptions } from './stubs/buildStyle';` | `export type { StyleOptions } from '../map/style/buildStyle';` | — |
| WS2 camera | `export { MapController } from './stubs/MapController';` | `export { MapController } from '../map/controller/MapController';` | `stubs/MapController.ts` |
| WS4 UI | `export { SidePanel } from './stubs/ui';` | `export { SidePanel } from '../ui/SidePanel';` | — |
| WS4 UI | `export { InfoCard } from './stubs/ui';` | `export { InfoCard } from '../ui/InfoCard';` | — |
| WS4 UI | `export { Disclaimer } from './stubs/ui';` | `export { Disclaimer } from '../ui/Disclaimer';` | `stubs/ui.tsx`, `stubs/stubs.css` (after all three) |
| WS3 data | `src/app/attributionData.ts`: `import { FALLBACK_ATTRIBUTION } from './stubs/attributionFallback';` | Keep as an offline fallback **or** drop it once `public/data/attribution.json` ships (see note 3) | `stubs/attributionFallback.ts` (optional) |

When the folder is empty, delete it and this README.

## Notes / assumptions beyond the contracts

1. **DEM fallback hook (WS1).** The contract has no function that installs WS1's "3 consecutive DEM tile errors →
   AWS" watcher, so the stub exports `watchDemFallback(map): () => void` and `src/app/wiring.ts` (`watchDem`) calls it
   right after `new Map()` (errors can happen before `load`). If WS1 installs its watcher some other way (e.g. inside
   `buildStyle`/`applyStyleOptions`, or via a differently named export), change that one call. The shell listens for
   the `style:dem-fallback` map event either way, then re-applies options with `demProvider: 'aws'` so later toggles
   never undo the fallback. Mapterhorn answers **404 for open-ocean tiles**; those must not count as failures.
2. **`StyleOptions` vs MapLibre's own `StyleOptions` type.** Import ours from `integration.ts`, not from `maplibre-gl`.
3. **`attribution.json` (WS3)** has the shape `{ generatedAt, disclaimer, items: [{ id, text, url, licence?,
   licenceUrl?, usedFor, kind }] }`; `parseAttribution()` reads it (and tolerates a bare array / `entries` / string
   items). The always-visible footer line uses `compactLabel()` (keyword → short label); About shows the full `text`,
   licence and `usedFor`. MapLibre's credit is appended unless already present. The file's `disclaimer` is not used
   yet (WS4's `Disclaimer` owns that copy). `stubs/attributionFallback.ts` mirrors the item shape; its `usedFor`/`kind`
   values are guesses.
4. **InfoCard "Back to overview" (WS4).** The contract gives `InfoCard` only `nation` and `onClose`; the shell passes
   `onClose = () => select(null)`, which keeps the camera where it is. The "Overview" button in `LayerControls`
   flies out. If WS4 adds an `onOverview` prop, wire it to `goToOverview(controller, useAppStore)` in `App.tsx`.
5. **Marker hover map → store.** The contract's `MapController` has no hover callback, so `wiring.ts` listens to
   `mousemove`/`mouseleave` on the contract layer `nations-circle` and reads the `code` property.
6. **SidePanel root.** WS4's `SidePanel` renders its own `<aside data-testid="side-panel">` with an `<h2>`
   heading, so `App.tsx` wraps it in a plain layout `<div class="app__side">` and provides the page's only `<h1>`
   (visually hidden). The stub matches.
7. **`window.__map`** is exposed when `import.meta.env.DEV || import.meta.env.VITE_E2E === '1'` (WS6's `build:e2e`).
