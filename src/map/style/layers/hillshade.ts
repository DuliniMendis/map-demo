import type { HillshadeLayerSpecification } from 'maplibre-gl';
import { LAYER_HILLSHADE, SOURCE_DEM_SHADE } from '../ids';
import { NO_TRANSITION, visibility } from './visibility';

/** Subtle over imagery (which already has real shadows); stronger on its own or over colour relief. */
export const HILLSHADE_EXAGGERATION = { withImagery: 0.35, withoutImagery: 0.6 } as const;

/**
 * Warm highlight. Over imagery it is mostly transparent: the photo is already sunlit, and a full
 * highlight washes cliffs and ridgelines out to grey. Shadows do the work there.
 */
export const HILLSHADE_HIGHLIGHT = {
  withImagery: 'rgba(255, 244, 224, 0.35)',
  withoutImagery: '#fff4e0',
} as const;

export const hillshadeExaggeration = (imagery: boolean): number =>
  imagery ? HILLSHADE_EXAGGERATION.withImagery : HILLSHADE_EXAGGERATION.withoutImagery;

export const hillshadeHighlight = (imagery: boolean): string =>
  imagery ? HILLSHADE_HIGHLIGHT.withImagery : HILLSHADE_HIGHLIGHT.withoutImagery;

export function hillshadeLayer(visible: boolean, imagery: boolean): HillshadeLayerSpecification {
  return {
    id: LAYER_HILLSHADE,
    type: 'hillshade',
    source: SOURCE_DEM_SHADE,
    layout: { visibility: visibility(visible) },
    paint: {
      'hillshade-method': 'standard',
      'hillshade-exaggeration': hillshadeExaggeration(imagery),
      'hillshade-exaggeration-transition': NO_TRANSITION,
      // Light from the top-left of the screen (cartographic convention); viewport-anchored so the relief
      // never reads inverted when the camera bearing swings during flights.
      'hillshade-illumination-direction': 315,
      'hillshade-illumination-anchor': 'viewport',
      'hillshade-shadow-color': '#3a2414',
      'hillshade-highlight-color': hillshadeHighlight(imagery),
      'hillshade-highlight-color-transition': NO_TRANSITION,
      'hillshade-accent-color': '#2a1a0e',
    },
  };
}
