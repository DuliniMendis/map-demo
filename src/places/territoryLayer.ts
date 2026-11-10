// Map layers for Native Land territories (filled shapes with outlines and names) and the pin for a
// searched place. Added on demand at runtime; nothing here is part of the base style.
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { LAYER_LABELS_FIRST } from '../map/style/ids';
import type { Territory } from './nativeLand';

export const SOURCE_TERRITORIES = 'native-land-territories';
export const LAYER_TERRITORY_FILL = 'native-land-fill';
export const LAYER_TERRITORY_LINE = 'native-land-line';
export const LAYER_TERRITORY_LABEL = 'native-land-label';

/** Pure: territories → GeoJSON for the source. */
export function territoriesToGeoJSON(territories: Territory[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: territories.map((t, i) => ({
      type: 'Feature',
      id: i,
      properties: { name: t.name, slug: t.slug, color: t.color },
      geometry: t.geometry,
    })),
  };
}

/** Below the nation pins (and the base labels), so the pins stay on top. */
function beforeId(map: maplibregl.Map): string | undefined {
  const first = map.getStyle().layers.find((l) => l.id.startsWith('nations'));
  if (first) return first.id;
  return map.getLayer(LAYER_LABELS_FIRST) ? LAYER_LABELS_FIRST : undefined;
}

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource(SOURCE_TERRITORIES)) return;
  map.addSource(SOURCE_TERRITORIES, { type: 'geojson', data: territoriesToGeoJSON([]) });
  const before = beforeId(map);
  map.addLayer(
    {
      id: LAYER_TERRITORY_FILL,
      type: 'fill',
      source: SOURCE_TERRITORIES,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
    },
    before,
  );
  map.addLayer(
    {
      id: LAYER_TERRITORY_LINE,
      type: 'line',
      source: SOURCE_TERRITORIES,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 14, 3],
        'line-opacity': 0.9,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: LAYER_TERRITORY_LABEL,
      type: 'symbol',
      source: SOURCE_TERRITORIES,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 14,
        'text-max-width': 10,
      },
      paint: {
        'text-color': '#141414',
        'text-halo-color': 'rgba(255,255,255,0.9)',
        'text-halo-width': 1.6,
      },
    },
    before,
  );
}

/** Shows exactly these territories (an empty list hides the overlay). */
export function setTerritories(map: maplibregl.Map, territories: Territory[]) {
  if (!map.isStyleLoaded() && !map.getSource(SOURCE_TERRITORIES)) {
    void map.once('load').then(() => setTerritories(map, territories));
    return;
  }
  ensureLayers(map);
  (map.getSource(SOURCE_TERRITORIES) as maplibregl.GeoJSONSource).setData(
    territoriesToGeoJSON(territories),
  );
}

/** A DOM pin for the searched place (follows the terrain). */
export function createPlacePin(): maplibregl.Marker {
  const el = document.createElement('div');
  el.className = 'place-pin';
  el.setAttribute('aria-hidden', 'true');
  return new maplibregl.Marker({ element: el });
}
