import type {
  BackgroundLayerSpecification,
  FillLayerSpecification,
  RasterLayerSpecification,
} from 'maplibre-gl';
import {
  LAYER_BACKGROUND,
  LAYER_IMAGERY,
  LAYER_WATER,
  SOURCE_IMAGERY,
  SOURCE_LABELS,
} from '../ids';
import { NO_TRANSITION, visibility } from './visibility';

/** Deep ocean, close to the Sentinel-2 cloudless open-ocean colour so the source bounds don't show. */
export const OCEAN_COLOR = '#0f1f37';
/**
 * Land without the photo: a light paper tone, so hillshade shadows and colour relief read the way
 * they do on a printed map (on the dark ocean colour they all but vanished).
 */
export const PAPER_COLOR = '#ece3d2';
/** Sea, lakes and rivers drawn from the label tiles' water polygons while the photo is off. */
export const WATER_COLOR = '#a9bfcf';

export const backgroundColor = (imagery: boolean): string => (imagery ? OCEAN_COLOR : PAPER_COLOR);

export function backgroundLayer(imagery = true): BackgroundLayerSpecification {
  return {
    id: LAYER_BACKGROUND,
    type: 'background',
    paint: {
      'background-color': backgroundColor(imagery),
      'background-color-transition': NO_TRANSITION,
    },
  };
}

/** Water polygons (OpenMapTiles `water`), shown only while imagery is off. */
export function waterLayer(imagery: boolean): FillLayerSpecification {
  return {
    id: LAYER_WATER,
    type: 'fill',
    source: SOURCE_LABELS,
    'source-layer': 'water',
    layout: { visibility: visibility(!imagery) },
    paint: { 'fill-color': WATER_COLOR, 'fill-antialias': false },
  };
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
