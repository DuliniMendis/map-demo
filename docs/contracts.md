# Contracts between workstreams

These are the interfaces workers code against *before* each other's PRs land. Change them only via a PR that
touches this file and pings every owner listed in `PLAN.md §4`.

## Repo layout & ownership

```
map-demo/
├─ index.html                     WS5
├─ package.json, vite.config.ts, tsconfig*.json, eslint/prettier   WS0 (then WS6 for CI tweaks)
├─ public/data/nations.json       WS3 (generated; committed)
├─ public/data/attribution.json   WS3 (generated)
├─ data/raw/austlang-tlcmap-YYYY-MM-DD.geojson   WS3 snapshot
├─ data/overrides.json            WS3 owns file; WS2 proposes `view` values via PR to WS3
├─ scripts/                       WS3  (build-nations.ts, fetch-austlang.ts, abs-lookup.ts, validate.ts)
├─ src/
│  ├─ main.tsx, app/              WS5  (App.tsx, layout, UrlSync.ts, About.tsx, Attribution.tsx)
│  ├─ types/nation.ts             WS0  (frozen after Phase 0)
│  ├─ store/useAppStore.ts        WS0 skeleton → WS5 maintains
│  ├─ data/mock-nations.json      WS0  (10 entries, real coordinates, same schema)
│  ├─ data/loadNations.ts         WS0
│  ├─ map/style/                  WS1  (buildStyle.ts, sources.ts, layers/*.ts, ids.ts)
│  ├─ map/controller/             WS2  (MapController.ts, choreography.ts)
│  ├─ map/markers/                WS2  (markersLayer.ts)
│  ├─ map/MapView.tsx             WS5  (thin React wrapper that instantiates Map, passes it to controller)
│  └─ ui/                         WS4  (SidePanel.tsx, NationList.tsx, SearchBox.tsx, InfoCard.tsx, Disclaimer.tsx, ui.css)
├─ tests/                         WS6  (playwright/, unit/ for pure functions)
└─ docs/                          shared
```

## `Nation` type (`src/types/nation.ts`)

```ts
export interface NationView { zoom?: number; pitch?: number; bearing?: number; }

export interface NearbyFeature {
  name: string;               // OSM name tag as published
  kind: 'city' | 'town' | 'peak' | 'river' | 'lake' | 'range';
  distanceKm: number;         // great-circle from the nation's point, 1 decimal place
  bearing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'; // from the nation's point to the feature
}

export interface Nation {
  id: string;                 // AUSTLANG code, e.g. "A103"  (stable key, used in URL ?n=)
  name: string;               // AUSTLANG language_name, trimmed
  peopleName?: string;        // from thesaurus_heading_people, e.g. "Waljen people"
  synonyms: string[];         // from language_synonym, split on ", "
  lng: number; lat: number;   // approximate_longitude/latitude_of_language_variety
  modern: {                   // from ABS SAL 2021 point-in-polygon
    locality: string;         // sal_name_2021, e.g. "Petermann"
    state: string;            // state_name_2021, e.g. "Northern Territory"
    stateCode: 'NSW'|'VIC'|'QLD'|'SA'|'WA'|'TAS'|'NT'|'ACT'|'OT';
  };
  links: { austlang: string; wikipedia?: string; };
  view?: NationView;          // per-nation camera override from data/overrides.json
  nearby?: {                  // Phase 3 (WS8): OpenStreetMap, computed at build time
    town?: NearbyFeature;     // nearest place=city|town within 100 km
    landmark?: NearbyFeature; // nearest named peak/river/lake/range within 50 km
  };
  source: 'austlang';
}

export interface NationsFile {
  generatedAt: string;        // ISO date
  count: number;
  nations: Nation[];          // sorted by name, locale 'en-AU'
}
```

JSON Schema for `nations.json` is generated from this type by WS3 (`scripts/validate.ts`) and run in CI.

## Store (`src/store/useAppStore.ts`, zustand)

```ts
interface AppState {
  nations: Nation[];               // loaded once
  selectedId: string | null;
  hoveredId: string | null;
  cameraState: 'idle' | 'flying';
  query: string;                   // search text
  stateFilter: Nation['modern']['stateCode'] | 'ALL';
  layers: { imagery: boolean; labels: boolean; hillshade: boolean; relief: boolean; contours: boolean; };
  exaggeration: number;            // 1.0–2.5, default 1.5
  reducedMotion: boolean;          // from matchMedia
  sunHour: number | null;          // Phase 3 (WS7): local solar hour 5–19; null = fixed default light
  tour: { status: 'off' | 'playing' | 'paused'; index: number }; // Phase 3 (WS9)
  select(id: string | null): void;
  setHovered(id: string | null): void;
  setCameraState(s: AppState['cameraState']): void;
  setQuery(q: string): void; setStateFilter(f: AppState['stateFilter']): void;
  toggleLayer(k: keyof AppState['layers']): void; setExaggeration(n: number): void;
  setSunHour(h: number | null): void;   // clamped to 5–19 (clampSunHour)
  setTour(t: Partial<AppState['tour']>): void;
}
```

Selectors (pure, unit-tested by WS4): `filterNations(nations, query, stateFilter)` — case/diacritic-insensitive match on `name`, `synonyms`, `modern.locality`, `modern.state`.

## Map style (WS1 → everyone)

```ts
// src/map/style/buildStyle.ts
export interface StyleOptions { imagery: boolean; labels: boolean; hillshade: boolean; relief: boolean; exaggeration: number; demProvider: 'mapterhorn' | 'aws';
  contours: boolean;        // Phase 3 (WS7)
  sunHour: number | null;   // Phase 3 (WS7)
  globe: boolean;           // Phase 3 (WS9); the app always passes true
}
export function buildStyle(o: StyleOptions): maplibregl.StyleSpecification;
export function applyStyleOptions(map: maplibregl.Map, o: StyleOptions): void; // in-place toggles, no setStyle
// src/map/style/ids.ts  — exported constants
export const SOURCE_DEM = 'dem', SOURCE_IMAGERY = 'imagery', SOURCE_LABELS = 'labels';
export const LAYER_IMAGERY = 'imagery', LAYER_HILLSHADE = 'hillshade', LAYER_RELIEF = 'relief', LAYER_LABELS_FIRST = 'labels-water'; // WS2 inserts markers *before* LAYER_LABELS_FIRST
export const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [[112.5, -44.5], [154.5, -9.5]];
export const OVERVIEW_CAMERA = { center: [134.0, -26.5], zoom: 3.7, pitch: 0, bearing: 0 } as const;
```

## Camera & markers (WS2 → WS5)

```ts
// src/map/controller/MapController.ts
export class MapController {
  constructor(map: maplibregl.Map, opts: { reducedMotion: () => boolean; onCameraState: (s: 'idle'|'flying') => void });
  setNations(nations: Nation[]): void;            // (re)builds the GeoJSON source
  flyToNation(n: Nation, from: Nation | null): Promise<void>;  // implements PLAN.md §6; resolves on moveend
  flyToOverview(): Promise<void>;
  setSelected(id: string | null): void;           // feature-state 'selected'
  setHovered(id: string | null): void;            // feature-state 'hover'
  onMarkerClick(cb: (id: string) => void): () => void;   // returns unsubscribe
  destroy(): void;
}
// src/map/controller/choreography.ts — pure, unit-tested
export function planFlight(from: CameraPose | null, to: Nation, reducedMotion: boolean): FlightStep[];
```

Marker layers: source `nations`, layers `nations-circle`, `nations-label`, `nations-selected-ring`. Feature `id` = numeric index; properties carry `code` (= Nation.id) and `name`.

## UI (WS4 → WS5) — props only, no store access inside leaf components

```tsx
<SidePanel />                                   // reads store itself (container)
<NationList nations items selectedId onSelect onHover />  // virtualised when > 100 items
<SearchBox value onChange stateFilter onStateFilter />
<InfoCard nation onClose />                     // shows name, peopleName, synonyms, "Country today: {locality}, {state}", links, disclaimer line
<Disclaimer variant="banner" | "inline" />
```

`data-testid`s (WS6 tests rely on these): `side-panel`, `search-input`, `state-filter`, `nation-item-<id>`, `info-card`, `info-locality`, `info-state`, `map-canvas`, `layer-toggle-<key>`, `exaggeration-slider`, `about-button`, `attribution`.
Phase 3: `sun-slider`, `sun-reset` (WS7); `info-nearby` (WS8); `tour-button`, `tour-panel`, `tour-next`, `tour-prev`, `tour-pause`, `tour-stop` (WS9).

## URL state (WS5)

`?n=<Nation.id>` selected nation; `?l=imagery,labels` enabled layers incl. `contours` (omit = defaults); `?x=1.5` exaggeration; `?t=14.5` sun hour (Phase 3, WS7; omit = default light). The tour is not in the URL. Read on boot, write with `history.replaceState` (debounced 300 ms). Unknown id → ignore, show overview.

## Events / timing budget

- First render of terrain overview ≤ 3 s on broadband; nations.json (≈ 120 KB) loads in parallel with style.
- Flight total 2.5–4.5 s; never longer than 6 s. Reduced motion: ≤ 0.4 s.
- Keep JS bundle ≤ 400 KB gz excluding MapLibre (MapLibre 6.17 measures ≈ 283 KB gz).
