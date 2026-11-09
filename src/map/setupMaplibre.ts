import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 finds its worker via `new URL(<name>, import.meta.url)` with a computed name, which
// Vite can neither pre-bundle (dev: "Worker failed to load") nor detect at build time (prod: the
// worker file is never emitted). Importing it with `?url` makes Vite serve/emit it, and we hand
// MapLibre the resolved URL. Import this module once, before the first `new maplibregl.Map()`.
maplibregl.setWorkerUrl(workerUrl);
