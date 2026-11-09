import type { BackgroundLayerSpecification, RasterLayerSpecification } from 'maplibre-gl';
import { LAYER_BACKGROUND, LAYER_IMAGERY, SOURCE_IMAGERY } from '../ids';
import { visibility } from './visibility';

/** Deep ocean, close to the Sentinel-2 cloudless open-ocean colour so the source bounds don't show. */
export const OCEAN_COLOR = '#0f1f37';

export function backgroundLayer(): BackgroundLayerSpecification {
  return { id: LAYER_BACKGROUND, type: 'background', paint: { 'background-color': OCEAN_COLOR } };
}

export function imageryLayer(visible: boolean): RasterLayerSpecification {
  return {
    id: LAYER_IMAGERY,
    type: 'raster',
    source: SOURCE_IMAGERY,
    layout: { visibility: visibility(visible) },
    paint: {
      'raster-saturation': -0.1,
      'raster-contrast': 0.05,
      // Cross-fade tiles as zoom levels swap in, rather than popping.
      'raster-fade-duration': 250,
    },
  };
}
