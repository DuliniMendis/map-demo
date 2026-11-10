import type {
  ExpressionSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import { LAYER_CONTOUR_LABELS, LAYER_CONTOUR_LINES, SOURCE_CONTOURS } from '../ids';
import { SOURCE_BOUNDS, type DemProvider } from '../sources';
import { NO_TRANSITION, visibility } from './visibility';

/** Contours appear from this zoom. Below it the DEM is too coarse and the lines too dense. */
export const CONTOUR_MIN_ZOOM = 11;
/**
 * Highest zoom we generate contour tiles for; MapLibre overzooms the vector tiles beyond it. The
 * DEM behind them stops at z12 (Mapterhorn) / z13 (AWS) anyway, so z14+ tiles would add work and
 * requests without adding detail.
 */
export const CONTOUR_SOURCE_MAX_ZOOM = 13;

/** Vector-tile layer and feature keys inside the generated tiles (maplibre-contour defaults). */
export const CONTOUR_SOURCE_LAYER = 'contours';
const ELE = 'ele';
const LEVEL = 'level';

/**
 * `zoom: [minor, major]` spacing in metres. A zoom without an entry uses the next lower one, so
 * z13+ all use 20/100. Major lines (level 1) are drawn heavier and labelled.
 */
export const CONTOUR_THRESHOLDS: Readonly<Record<number, readonly [minor: number, major: number]>> =
  {
    11: [50, 250],
    13: [20, 100],
  };

/** The `[minor, major]` interval in metres at `zoom`, or null below `CONTOUR_MIN_ZOOM`. */
export function contourInterval(zoom: number): { minor: number; major: number } | null {
  if (zoom < CONTOUR_MIN_ZOOM) return null;
  const keys = Object.keys(CONTOUR_THRESHOLDS)
    .map(Number)
    .filter((z) => z <= Math.floor(zoom));
  const [minor, major] = CONTOUR_THRESHOLDS[Math.max(...keys)]!;
  return { minor, major };
}

/**
 * Where maplibre-contour reads the DEM for each provider. Chosen so its fetches are the *same URLs*
 * the terrain mesh already loads (the HTTP cache then answers most of them):
 *
 * - Mapterhorn, 512 px: the terrain loads z-1 tiles, and `overzoom: 1` makes a zN contour tile from
 *   one quadrant of the z(N-1) DEM tile (and ≤ 3 neighbours instead of 8). Capped at z12 because
 *   Mapterhorn 404s z13+ wherever only 30 m data exists (most of the interior).
 * - AWS, 256 px: the terrain loads zN tiles at view zoom N, so `overzoom: 0`.
 */
export const CONTOUR_DEM: Record<DemProvider, { maxzoom: number; overzoom: number }> = {
  mapterhorn: { maxzoom: 12, overzoom: 1 },
  aws: { maxzoom: 13, overzoom: 0 },
};

/** Options encoded into the contour protocol URL (`DemSource.contourProtocolUrl`). */
export function contourTileOptions(provider: DemProvider) {
  return {
    thresholds: Object.fromEntries(
      Object.entries(CONTOUR_THRESHOLDS).map(([z, t]) => [z, [...t]]),
    ) as Record<number, number[]>,
    overzoom: CONTOUR_DEM[provider].overzoom,
    contourLayer: CONTOUR_SOURCE_LAYER,
    elevationKey: ELE,
    levelKey: LEVEL,
    extent: 4096,
    buffer: 1,
  };
}

export function contourSource(tileUrl: string): VectorSourceSpecification {
  return {
    type: 'vector',
    tiles: [tileUrl],
    minzoom: CONTOUR_MIN_ZOOM,
    maxzoom: CONTOUR_SOURCE_MAX_ZOOM,
    bounds: [...SOURCE_BOUNDS],
    // Derived from the DEM, which is already credited; no attribution of its own.
  };
}

/**
 * Thin, low-contrast lines: a pale warm tint over the photo, the hillshade's dark brown over relief.
 * Major lines are a little heavier; nothing should compete with the markers or place labels.
 */
export const CONTOUR_COLORS = {
  withImagery: { line: 'rgb(255, 246, 230)', text: '#fbf3e4', halo: 'rgba(30, 20, 12, 0.75)' },
  withoutImagery: { line: 'rgb(58, 36, 20)', text: '#3a2414', halo: 'rgba(255, 248, 236, 0.75)' },
} as const;

export const contourColors = (imagery: boolean) =>
  imagery ? CONTOUR_COLORS.withImagery : CONTOUR_COLORS.withoutImagery;

const isMajor: ExpressionSpecification = ['>=', ['get', LEVEL], 1];

const byZoom = (...stops: number[]): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;

export function contourLineLayer(visible: boolean, imagery: boolean): LineLayerSpecification {
  return {
    id: LAYER_CONTOUR_LINES,
    type: 'line',
    source: SOURCE_CONTOURS,
    'source-layer': CONTOUR_SOURCE_LAYER,
    minzoom: CONTOUR_MIN_ZOOM,
    layout: { visibility: visibility(visible), 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': contourColors(imagery).line,
      'line-color-transition': NO_TRANSITION,
      // Fade in over the first half zoom so they don't pop on at z11.
      'line-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        CONTOUR_MIN_ZOOM,
        0,
        CONTOUR_MIN_ZOOM + 0.5,
        ['case', isMajor, 0.4, 0.2],
      ],
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        11,
        ['case', isMajor, 0.7, 0.35],
        15,
        ['case', isMajor, 1.4, 0.8],
      ],
    },
  };
}

export function contourLabelLayer(visible: boolean, imagery: boolean): SymbolLayerSpecification {
  const c = contourColors(imagery);
  return {
    id: LAYER_CONTOUR_LABELS,
    type: 'symbol',
    source: SOURCE_CONTOURS,
    'source-layer': CONTOUR_SOURCE_LAYER,
    minzoom: CONTOUR_MIN_ZOOM + 0.5,
    filter: isMajor,
    layout: {
      visibility: visibility(visible),
      'symbol-placement': 'line',
      'symbol-spacing': 350,
      'text-field': ['concat', ['number-format', ['get', ELE], { locale: 'en-AU' }], ' m'],
      'text-font': ['Noto Sans Regular'],
      'text-size': byZoom(11.5, 9, 15, 11),
      'text-max-angle': 30,
      'text-padding': 4,
      // Readable from any bearing, and flat on the slope rather than standing up.
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
    },
    paint: {
      'text-color': c.text,
      'text-color-transition': NO_TRANSITION,
      'text-halo-color': c.halo,
      'text-halo-color-transition': NO_TRANSITION,
      'text-halo-width': 1,
      'text-opacity': 0.85,
    },
  };
}
