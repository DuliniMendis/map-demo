// TEMPORARY STUB (WS5) for WS1's `src/map/style/buildStyle.ts`. Delete when WS1 lands; see ./README.md.
// Signatures match docs/contracts.md exactly. The style is the terrain spike's inline style, plus a
// minimal relief ramp and two OpenFreeMap label layers so every layer toggle has something to act on.
import type * as maplibregl from 'maplibre-gl';
import {
  AUSTRALIA_BOUNDS,
  LAYER_HILLSHADE,
  LAYER_IMAGERY,
  LAYER_LABELS_FIRST,
  LAYER_RELIEF,
  SOURCE_DEM,
  SOURCE_IMAGERY,
  SOURCE_LABELS,
} from '../../map/style/ids';

export interface StyleOptions {
  imagery: boolean;
  labels: boolean;
  hillshade: boolean;
  relief: boolean;
  exaggeration: number;
  demProvider: 'mapterhorn' | 'aws';
}

/** Hillshade and relief read a second copy of the DEM: MapLibre warns when they share terrain's source. */
const SOURCE_DEM_SHADE = 'dem-shade';
const LAYER_LABELS_PLACE = 'labels-place';
const LABEL_LAYERS = [LAYER_LABELS_FIRST, LAYER_LABELS_PLACE];

const BOUNDS: [number, number, number, number] = [
  AUSTRALIA_BOUNDS[0][0],
  AUSTRALIA_BOUNDS[0][1],
  AUSTRALIA_BOUNDS[1][0],
  AUSTRALIA_BOUNDS[1][1],
];

function demSource(provider: StyleOptions['demProvider']): maplibregl.RasterDEMSourceSpecification {
  return provider === 'mapterhorn'
    ? {
        type: 'raster-dem',
        tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
        encoding: 'terrarium',
        tileSize: 512,
        maxzoom: 17,
        bounds: BOUNDS,
        attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
      }
    : {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
        bounds: BOUNDS,
        attribution: 'Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)',
      };
}

const vis = (on: boolean) => (on ? 'visible' : 'none');

function demLayers(o: StyleOptions): maplibregl.LayerSpecification[] {
  return [
    {
      id: LAYER_RELIEF,
      type: 'color-relief',
      source: SOURCE_DEM_SHADE,
      layout: { visibility: vis(o.relief) },
      paint: {
        'color-relief-opacity': o.imagery ? 0.25 : 0.85,
        'color-relief-color': [
          'interpolate',
          ['linear'],
          ['elevation'],
          0,
          '#4f6b3a',
          300,
          '#d9c08a',
          800,
          '#a8502a',
          1500,
          '#8a8a8a',
          2200,
          '#ffffff',
        ],
      },
    },
    {
      id: LAYER_HILLSHADE,
      type: 'hillshade',
      source: SOURCE_DEM_SHADE,
      layout: { visibility: vis(o.hillshade) },
      paint: { 'hillshade-exaggeration': o.imagery ? 0.35 : 0.6 },
    },
  ];
}

export function buildStyle(o: StyleOptions): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [SOURCE_IMAGERY]: {
        type: 'raster',
        tiles: [
          'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
        ],
        tileSize: 256,
        maxzoom: 14,
        bounds: BOUNDS,
        attribution:
          'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
      },
      [SOURCE_DEM]: demSource(o.demProvider),
      [SOURCE_DEM_SHADE]: demSource(o.demProvider),
      [SOURCE_LABELS]: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '© OpenMapTiles © OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1a2a' } },
      {
        id: LAYER_IMAGERY,
        type: 'raster',
        source: SOURCE_IMAGERY,
        layout: { visibility: vis(o.imagery) },
      },
      ...demLayers(o),
      {
        id: LAYER_LABELS_FIRST,
        type: 'symbol',
        source: SOURCE_LABELS,
        'source-layer': 'water_name',
        layout: {
          visibility: vis(o.labels),
          'text-field': ['get', 'name:latin'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
        },
        paint: { 'text-color': '#bfe3ff', 'text-halo-color': '#0b1a2a', 'text-halo-width': 1.2 },
      },
      {
        id: LAYER_LABELS_PLACE,
        type: 'symbol',
        source: SOURCE_LABELS,
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['state', 'city', 'town', 'village']]],
        layout: {
          visibility: vis(o.labels),
          'text-field': ['get', 'name:latin'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['match', ['get', 'class'], 'state', 13, 'city', 13, 11],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#1b1f24', 'text-halo-width': 1.4 },
      },
    ],
    terrain: { source: SOURCE_DEM, exaggeration: o.exaggeration },
    sky: {
      'sky-color': '#88bbee',
      'horizon-color': '#ffffff',
      'fog-color': '#ffffff',
      'fog-ground-blend': 0.6,
      'horizon-fog-blend': 0.8,
      'sky-horizon-blend': 0.6,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
    },
  };
}

const currentProvider = new WeakMap<maplibregl.Map, StyleOptions['demProvider']>();

function swapDemProvider(map: maplibregl.Map, o: StyleOptions): void {
  for (const id of [LAYER_HILLSHADE, LAYER_RELIEF]) if (map.getLayer(id)) map.removeLayer(id);
  map.setTerrain(null);
  for (const id of [SOURCE_DEM, SOURCE_DEM_SHADE]) if (map.getSource(id)) map.removeSource(id);
  map.addSource(SOURCE_DEM, demSource(o.demProvider));
  map.addSource(SOURCE_DEM_SHADE, demSource(o.demProvider));
  const before = map.getLayer(LAYER_LABELS_FIRST) ? LAYER_LABELS_FIRST : undefined;
  for (const layer of demLayers(o)) map.addLayer(layer, before);
  map.setTerrain({ source: SOURCE_DEM, exaggeration: o.exaggeration });
}

/** Call after the map's `load` event (the app shell's wiring only runs from then on). */
export function applyStyleOptions(map: maplibregl.Map, o: StyleOptions): void {
  const prev = currentProvider.get(map) ?? 'mapterhorn';
  if (prev !== o.demProvider) {
    currentProvider.set(map, o.demProvider);
    swapDemProvider(map, o);
  }
  map.setLayoutProperty(LAYER_IMAGERY, 'visibility', vis(o.imagery));
  map.setLayoutProperty(LAYER_HILLSHADE, 'visibility', vis(o.hillshade));
  map.setLayoutProperty(LAYER_RELIEF, 'visibility', vis(o.relief));
  map.setPaintProperty(LAYER_RELIEF, 'color-relief-opacity', o.imagery ? 0.25 : 0.85);
  map.setPaintProperty(LAYER_HILLSHADE, 'hillshade-exaggeration', o.imagery ? 0.35 : 0.6);
  for (const id of LABEL_LAYERS) map.setLayoutProperty(id, 'visibility', vis(o.labels));
  const terrain = map.getTerrain();
  if (!terrain || terrain.exaggeration !== o.exaggeration) {
    map.setTerrain({ source: SOURCE_DEM, exaggeration: o.exaggeration });
  }
}

/**
 * Not in the contract (WS1 brief deliverable 5): after 3 consecutive DEM tile errors (404s excluded), fire
 * `style:dem-fallback` on the map. The app shell then re-applies options with `demProvider: 'aws'`.
 * Returns an unsubscribe function.
 */
export function watchDemFallback(map: maplibregl.Map): () => void {
  let failures = 0;
  let fired = false;
  const onError = (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
    if (fired || (e.sourceId !== SOURCE_DEM && e.sourceId !== SOURCE_DEM_SHADE)) return;
    // Mapterhorn answers 404 for tiles with no land (open ocean): "no data", not an outage.
    if ((e.error as { status?: number } | undefined)?.status === 404) return;
    failures += 1;
    if (failures >= 3) {
      fired = true;
      map.fire('style:dem-fallback' as keyof maplibregl.MapEventType);
    }
  };
  const onData = (e: maplibregl.MapSourceDataEvent) => {
    if (e.sourceId === SOURCE_DEM && e.tile && !fired) failures = 0;
  };
  map.on('error', onError);
  map.on('sourcedata', onData);
  return () => {
    map.off('error', onError);
    map.off('sourcedata', onData);
  };
}
