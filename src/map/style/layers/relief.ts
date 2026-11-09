import type { ColorReliefLayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import { LAYER_RELIEF, SOURCE_DEM_SHADE } from '../ids';
import { NO_TRANSITION, visibility } from './visibility';

/**
 * Hypsometric ramp tuned for Australia, where most land sits below 600 m: greens/ochres spend the
 * first 300 m, rust marks the ranges, and only the Australian Alps (Kosciuszko 2228 m) reach white.
 *
 * Sea level and below stay transparent so the ocean background shows through: Mapterhorn has no
 * bathymetry and encodes the sea as exactly 0 m (AWS has negative bathymetry). The cost is that the
 * few below-sea-level land areas (Kati Thanda–Lake Eyre, −15 m) also show the background colour.
 */
export const RELIEF_RAMP: ReadonlyArray<
  readonly [elevationM: number, color: string, label: string]
> = [
  [0, 'rgba(91, 99, 50, 0)', 'sea level and below (transparent)'],
  [1, '#5b6332', 'deep green-ochre'],
  [300, '#d4b97e', 'sand'],
  [800, '#a4502c', 'rust'],
  [1500, '#8f8b87', 'grey'],
  [2200, '#f7f5f2', 'white'],
];

export const RELIEF_OPACITY = { withImagery: 0.25, withoutImagery: 0.85 } as const;

export const reliefOpacity = (imagery: boolean): number =>
  imagery ? RELIEF_OPACITY.withImagery : RELIEF_OPACITY.withoutImagery;

export function reliefColorExpression(): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['elevation'],
    ...RELIEF_RAMP.flatMap(([m, color]) => [m, color]),
  ] as ExpressionSpecification;
}

export function reliefLayer(visible: boolean, imagery: boolean): ColorReliefLayerSpecification {
  return {
    id: LAYER_RELIEF,
    type: 'color-relief',
    source: SOURCE_DEM_SHADE,
    layout: { visibility: visibility(visible) },
    paint: {
      'color-relief-color': reliefColorExpression(),
      'color-relief-opacity': reliefOpacity(imagery),
      'color-relief-opacity-transition': NO_TRANSITION,
    },
  };
}
