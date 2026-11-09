import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { LAYER_LABELS_FIRST, SOURCE_LABELS } from '../ids';
import { visibility } from './visibility';

/**
 * Labels-only overlay on OpenFreeMap's OpenMapTiles vector tiles: no fills, no road lines, just what
 * helps a reader answer "what is this place called today". Two subtle line layers (rivers, state
 * borders) sit *below* `LAYER_LABELS_FIRST`, i.e. under WS2's markers; every symbol layer is above it.
 */
export const LAYER_LABELS_WATERWAY_LINE = 'labels-waterway-line';
export const LAYER_LABELS_BOUNDARY = 'labels-boundary';
export const LAYER_LABELS_WATER_LINE = 'labels-water-line';
export const LAYER_LABELS_WATERWAY_NAME = 'labels-waterway-name';
export const LAYER_LABELS_ROAD = 'labels-road';
export const LAYER_LABELS_PLACE_MINOR = 'labels-place-minor';
export const LAYER_LABELS_PLACE_TOWN = 'labels-place-town';
export const LAYER_LABELS_PLACE_CITY = 'labels-place-city';
export const LAYER_LABELS_PLACE_STATE = 'labels-place-state';
export const LAYER_LABELS_PLACE_COUNTRY = 'labels-place-country';

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name']];

const TEXT = '#fbf8f2';
const HALO = 'rgba(18, 14, 10, 0.85)';
const WATER_TEXT = '#cfe6fb';
const WATER_HALO = 'rgba(6, 22, 40, 0.85)';

const isPoint: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['Point', 'MultiPoint'],
  true,
  false,
];
const isLine: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString'],
  true,
  false,
];
const classIn = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
];

const byZoom = (...stops: number[]): DataDrivenPropertyValueSpecification<number> =>
  ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;

function line(
  id: string,
  sourceLayer: string,
  minzoom: number,
  filter: FilterSpecification,
  paint: LineLayerSpecification['paint'],
  visible: boolean,
): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source: SOURCE_LABELS,
    'source-layer': sourceLayer,
    minzoom,
    filter,
    layout: { visibility: visibility(visible), 'line-cap': 'round', 'line-join': 'round' },
    paint,
  };
}

interface SymbolOpts {
  minzoom?: number;
  maxzoom?: number;
  filter: FilterSpecification;
  layout: SymbolLayerSpecification['layout'];
  paint?: SymbolLayerSpecification['paint'];
}

function symbol(
  id: string,
  sourceLayer: string,
  o: SymbolOpts,
  visible: boolean,
): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: SOURCE_LABELS,
    'source-layer': sourceLayer,
    ...(o.minzoom !== undefined && { minzoom: o.minzoom }),
    ...(o.maxzoom !== undefined && { maxzoom: o.maxzoom }),
    filter: o.filter,
    layout: { visibility: visibility(visible), 'text-field': NAME, ...o.layout },
    paint: {
      'text-color': TEXT,
      'text-halo-color': HALO,
      'text-halo-width': 1.4,
      'text-halo-blur': 0.4,
      ...o.paint,
    },
  };
}

/** Label layers in draw order (bottom → top). Later symbol layers win label collisions. */
export function labelLayers(visible: boolean): LayerSpecification[] {
  return [
    // Rivers, subtle. Most Australian rivers are intermittent; those are fainter still.
    line(
      LAYER_LABELS_WATERWAY_LINE,
      'waterway',
      9,
      [
        'all',
        isLine,
        ['!=', ['get', 'brunnel'], 'tunnel'],
        ['any', classIn('river'), ['all', ['>=', ['zoom'], 13.5], classIn('stream', 'canal')]],
      ],
      {
        'line-color': '#9cc9ec',
        'line-opacity': ['case', ['==', ['get', 'intermittent'], 1], 0.25, 0.5],
        'line-width': byZoom(9, 0.5, 12, 1, 15, 2),
      },
      visible,
    ),
    // State and territory borders (OSM admin_level 4), dashed.
    line(
      LAYER_LABELS_BOUNDARY,
      'boundary',
      3,
      ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      {
        'line-color': 'rgba(255, 244, 228, 0.6)',
        'line-width': byZoom(3, 0.6, 8, 1.2, 12, 1.8),
        'line-dasharray': [3, 2],
      },
      visible,
    ),

    // ---- symbols: WS2 inserts its marker layers immediately below this one ----
    symbol(
      LAYER_LABELS_FIRST,
      'water_name',
      {
        filter: isPoint,
        layout: {
          'text-font': FONT_ITALIC,
          'text-size': ['match', ['get', 'class'], ['ocean', 'sea'], 14, 12],
          'text-letter-spacing': ['match', ['get', 'class'], ['ocean', 'sea'], 0.2, 0.05],
          'text-max-width': 6,
        },
        paint: { 'text-color': WATER_TEXT, 'text-halo-color': WATER_HALO },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_WATER_LINE,
      'water_name',
      {
        filter: isLine,
        layout: {
          'text-font': FONT_ITALIC,
          'text-size': 12,
          'text-letter-spacing': 0.15,
          'symbol-placement': 'line',
        },
        paint: { 'text-color': WATER_TEXT, 'text-halo-color': WATER_HALO },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_WATERWAY_NAME,
      'waterway',
      {
        minzoom: 11,
        filter: [
          'all',
          isLine,
          ['has', 'name'],
          ['any', classIn('river', 'canal'), ['all', ['>=', ['zoom'], 13.5], classIn('stream')]],
        ],
        layout: {
          'text-font': FONT_ITALIC,
          'text-size': byZoom(11, 10, 15, 12),
          'symbol-placement': 'line',
          'symbol-spacing': 400,
          'text-letter-spacing': 0.08,
        },
        paint: { 'text-color': WATER_TEXT, 'text-halo-color': WATER_HALO },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_ROAD,
      'transportation_name',
      {
        minzoom: 11,
        filter: [
          'all',
          isLine,
          [
            'any',
            classIn('motorway', 'trunk', 'primary', 'secondary', 'tertiary'),
            ['all', ['>=', ['zoom'], 14], classIn('minor', 'service', 'track')],
          ],
        ],
        layout: {
          'text-font': FONT_REGULAR,
          'text-size': byZoom(11, 10, 15, 12),
          'symbol-placement': 'line',
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport',
        },
        paint: { 'text-color': '#efe9dd', 'text-halo-width': 1.2 },
      },
      visible,
    ),
    // Places, smallest first so towns and cities win collisions.
    symbol(
      LAYER_LABELS_PLACE_MINOR,
      'place',
      {
        minzoom: 10,
        filter: [
          'any',
          classIn('village'),
          [
            'all',
            ['>=', ['zoom'], 12],
            classIn('hamlet', 'suburb', 'locality', 'isolated_dwelling'),
          ],
        ],
        layout: {
          'text-font': FONT_REGULAR,
          'text-size': byZoom(10, 10, 14, 13),
          'text-max-width': 8,
        },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_PLACE_TOWN,
      'place',
      {
        minzoom: 7,
        filter: classIn('town'),
        layout: {
          'text-font': FONT_REGULAR,
          'text-size': byZoom(7, 11, 12, 15),
          'text-max-width': 8,
        },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_PLACE_CITY,
      'place',
      {
        minzoom: 4,
        filter: classIn('city'),
        layout: {
          'text-font': FONT_BOLD,
          // State and national capitals (OpenMapTiles capital 2 / 4) a little larger.
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4,
            ['case', ['has', 'capital'], 12, 10.5],
            10,
            ['case', ['has', 'capital'], 18, 15],
          ],
          'text-max-width': 8,
        },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_PLACE_STATE,
      'place',
      {
        minzoom: 3.5,
        maxzoom: 8,
        filter: classIn('state'),
        layout: {
          'text-font': FONT_BOLD,
          'text-size': byZoom(3.5, 10, 7, 13),
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.18,
          'text-max-width': 8,
        },
        paint: { 'text-color': 'rgba(251, 248, 242, 0.8)' },
      },
      visible,
    ),
    symbol(
      LAYER_LABELS_PLACE_COUNTRY,
      'place',
      {
        maxzoom: 5,
        filter: classIn('country'),
        layout: {
          'text-font': FONT_BOLD,
          'text-size': 15,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.3,
        },
        paint: { 'text-color': 'rgba(251, 248, 242, 0.7)' },
      },
      visible,
    ),
  ];
}

/** Every layer the `labels` toggle controls. */
export const LABEL_LAYER_IDS: readonly string[] = labelLayers(true).map((l) => l.id);
