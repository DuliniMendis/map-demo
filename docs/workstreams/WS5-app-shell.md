# WS5 — App shell, integration, URL state, About & attribution

**Goal:** glue. Load data, create the map, wire store ↔ MapController ↔ UI, URL state, layer toggles,
exaggeration slider, attribution footer, About/Acknowledgement panel, loading and error states. You are the only
workstream that imports from all the others; start with stubs and swap modules as PRs land.

**Owns:** `src/app/**`, `src/main.tsx`, `index.html`, `src/map/MapView.tsx`, `src/store/useAppStore.ts` (after WS0).

## Deliverables

1. `App.tsx` layout: `aside` (SidePanel) + `main` (MapView, InfoCard overlay, `LayerControls`, `Attribution`). Responsive breakpoints at 900 px.
2. `MapView.tsx`: creates `maplibregl.Map({ style: buildStyle(opts), ...OVERVIEW_CAMERA, maxBounds: padded AUSTRALIA_BOUNDS, maxPitch: 85, attributionControl: false })`, adds `NavigationControl({visualizePitch:true})`, instantiates `MapController` on `load`, calls `controller.setNations` when data arrives. Cleans up on unmount.
3. Wiring (`src/app/wiring.ts`): subscribe to store `selectedId` → `controller.flyToNation(next, prev)`; `controller.onMarkerClick` → `store.select`; hover both ways; `layers`/`exaggeration` → `applyStyleOptions`; `cameraState` → disable list clicks while flying? (No — allow re-targeting; controller cancels.) Listen for `style:dem-fallback` → toast "Using backup terrain".
4. `UrlSync.ts`: per contracts (`?n=`, `?l=`, `?x=`); boot order: parse URL → load nations → select if valid → fly after `idle`.
5. `LayerControls.tsx`: toggles Imagery / Labels / Hillshade / Relief, exaggeration slider 1.0–2.5 step 0.1, "Overview" button. Compact, top-right, collapsible.
6. `About.tsx` (modal): purpose, Acknowledgement of Country, how locations were derived (AUSTLANG single points, ABS 2021 localities), what it is not (boundaries, native title), links to AIATSIS map, AUSTLANG, Gambay, "Suggest a correction" mailto, full attribution list from `public/data/attribution.json`.
7. `Attribution.tsx`: always-visible compact line bottom-right built from `attribution.json` + MapLibre; expands on click.
8. Loading state (skeleton list + "Loading terrain…"), error state if `nations.json` fails (retry button), WebGL-unsupported message.
9. Analytics: none. No cookies. `localStorage` only for the disclaimer dismissal.
10. `index.html`: title "Country — First Nations of Australia in 3D", meta description, OG image (screenshot), `theme-color`, preconnect to tile hosts.

## Done when
- `pnpm build && pnpm preview` runs the full flow with real data: boot → overview → search → select → fly → info card → URL updates → reload restores selection.
- No console errors/warnings; bundle budget in contracts met (`vite-bundle-visualizer` screenshot in PR).

## Don't
- Don't re-implement style/camera/UI pieces; file issues against their owners instead. Don't add a backend or env secrets.
