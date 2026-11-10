import type { StyleSpecification } from 'maplibre-gl';
import { SOURCE_DEM, SOURCE_DEM_SHADE, SOURCE_IMAGERY, SOURCE_LABELS } from './ids';
import { backgroundLayer, imageryLayer } from './layers/base';
import { hillshadeLayer } from './layers/hillshade';
import { labelLayers } from './layers/labels';
import { reliefLayer } from './layers/relief';
import { sky } from './sky';
import { demSource, GLYPHS_URL, imagerySource, labelsSource } from './sources';
import type { StyleOptions } from './types';

export type { DemFallbackEventData, StyleOptions } from './types';
export { applyStyleOptions } from './applyStyleOptions';
export { installDemFallback, onDemFallback, watchDemFallback } from './demFallback';

/** Matches the store defaults (`DEFAULT_LAYERS`, `EXAGGERATION_DEFAULT`) plus the primary DEM. */
export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  imagery: true,
  labels: true,
  hillshade: true,
  relief: false,
  exaggeration: 1.5,
  demProvider: 'mapterhorn',
};

/**
 * The whole basemap as one style object, for `new maplibregl.Map({ style: buildStyle(o) })`.
 * Pure: no network, no Map. After load, use `applyStyleOptions` — never `setStyle` (it would drop
 * WS2's marker layers).
 *
 * Layer order, bottom → top: background, imagery, relief, hillshade, river/border lines,
 * [WS2 markers go here, before LAYER_LABELS_FIRST], label symbols.
 */
export function buildStyle(o: StyleOptions): StyleSpecification {
  return {
    version: 8,
    name: 'Country Map basemap',
    glyphs: GLYPHS_URL,
    sources: {
      [SOURCE_DEM]: demSource(o.demProvider),
      [SOURCE_DEM_SHADE]: demSource(o.demProvider),
      [SOURCE_IMAGERY]: imagerySource(),
      [SOURCE_LABELS]: labelsSource(),
    },
    layers: [
      backgroundLayer(),
      imageryLayer(o.imagery),
      reliefLayer(o.relief, o.imagery),
      hillshadeLayer(o.hillshade, o.imagery),
      ...labelLayers(o.labels),
    ],
    terrain: { source: SOURCE_DEM, exaggeration: o.exaggeration },
    sky: sky(),
  };
}
