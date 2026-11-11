import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import { visibility } from './layers/visibility';

/**
 * State government aerial imagery, shown over Sentinel-2 where the satellite photo runs out of
 * detail (z 14). Only three states publish keyless, CORS-enabled XYZ tiles; WA, SA, NT and Victoria
 * stay on Sentinel-2 (see docs/research.md). Each service answers outside its own coverage with a
 * transparent tile or a 404, so the layers can overlap.
 *
 * The layers have no paint adjustments (unlike the Sentinel-2 layer): the Tasmanian licence is
 * no-derivatives, so the tiles are shown as served.
 */
export type StateImageryId = 'nsw' | 'qld' | 'tas';

/** Below this the state layers aren't requested at all; Sentinel-2 is at full detail there anyway. */
export const STATE_IMAGERY_MIN_ZOOM = 13;
/** The state layers fade in over this zoom range, so the switch from Sentinel-2 isn't a hard pop. */
const FADE_END_ZOOM = 13.75;

export interface StateImagery {
  id: StateImageryId;
  sourceId: string;
  layerId: string;
  /** Short name for the credits. */
  name: string;
  tiles: string;
  /** `[w, s, e, n]`; MapLibre only requests tiles inside it. */
  bounds: [number, number, number, number];
  /** Deepest tile level requested; MapLibre stretches beyond it. */
  sourceMaxZoom: number;
  /** How far the camera may zoom in over this state before the imagery reads as a blur. */
  cameraMaxZoom: number;
  /** Rough outline of where the service has imagery (offshore margin included), as `[lng, lat]`. */
  coverage: [number, number][];
  attribution: string;
}

const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

// The NSW–Queensland border, west → east (29° S, then the Barwon/Macintyre/Dumaresq rivers and the
// McPherson Range to Point Danger). Both outlines share it.
const NSW_QLD_BORDER: [number, number][] = [
  [141.0, -29.0],
  [148.96, -29.0],
  [149.6, -28.75],
  [150.3, -28.58],
  [151.1, -28.9],
  [151.4, -29.1],
  [151.95, -28.95],
  [152.1, -28.55],
  [152.5, -28.3],
  [153.0, -28.3],
  [153.55, -28.17],
];

// NSW and the ACT (the NSW service covers both): the QLD border, the coast, the Cape Howe line and
// the Murray River back to 141° E.
const NSW_COVERAGE: [number, number][] = [
  ...NSW_QLD_BORDER,
  [153.9, -28.17],
  [153.9, -29.5],
  [153.4, -31.0],
  [152.9, -32.0],
  [152.0, -32.8],
  [151.6, -33.4],
  [151.4, -34.0],
  [151.1, -34.6],
  [150.7, -35.3],
  [150.4, -36.0],
  [150.3, -36.8],
  [150.1, -37.6],
  [149.98, -37.55],
  [148.2, -36.8],
  [147.9, -36.2],
  [147.03, -36.1],
  [146.92, -36.06],
  [146.39, -35.97],
  [145.57, -35.8],
  [144.75, -36.1],
  [144.13, -35.62],
  [143.55, -35.3],
  [142.77, -34.56],
  [142.15, -34.16],
  [141.9, -34.08],
  [141.0, -34.0],
];

// Queensland: the NT and SA borders, the NSW border, then the coast (Great Barrier Reef included)
// up to the Torres Strait islands and back down Cape York into the Gulf.
const QLD_COVERAGE: [number, number][] = [
  [138.0, -26.0],
  [141.0, -26.0],
  ...NSW_QLD_BORDER,
  [153.9, -28.17],
  [153.8, -27.0],
  [153.6, -25.5],
  [152.9, -24.2],
  [151.9, -21.5],
  [150.0, -19.3],
  [148.0, -17.5],
  [146.7, -15.5],
  [145.5, -13.5],
  [144.2, -11.5],
  [144.3, -9.5],
  [143.0, -9.3],
  [142.0, -9.15],
  [141.3, -9.25],
  [141.3, -12.0],
  [141.3, -15.5],
  [140.7, -17.3],
  [139.0, -16.3],
  [138.0, -16.3],
];

// Tasmania with King Island and the Furneaux Group, stopping short of Wilsons Promontory.
const TAS_COVERAGE: [number, number][] = [
  [143.5, -39.45],
  [148.6, -39.45],
  [148.6, -43.8],
  [143.5, -43.8],
];

const bboxOf = (ring: [number, number][]): [number, number, number, number] => {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
};

/** Bottom → top. NSW goes first: it serves low-resolution Landsat over south-east Queensland. */
export const STATE_IMAGERY: readonly StateImagery[] = [
  {
    id: 'nsw',
    sourceId: 'imagery-nsw',
    layerId: 'imagery-nsw',
    name: 'NSW Spatial Services',
    tiles:
      'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}',
    bounds: bboxOf(NSW_COVERAGE),
    sourceMaxZoom: 18,
    cameraMaxZoom: 17.5,
    coverage: NSW_COVERAGE,
    attribution: `Aerial imagery ${link('https://www.spatial.nsw.gov.au/', '© State of New South Wales (Spatial Services)')}`,
  },
  {
    id: 'qld',
    sourceId: 'imagery-qld',
    layerId: 'imagery-qld',
    name: 'Queensland Government',
    tiles:
      'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer/tile/{z}/{y}/{x}',
    bounds: bboxOf(QLD_COVERAGE),
    // Rural Queensland falls back to a ~3 m Planet mosaic, which blurs past z 16.
    sourceMaxZoom: 17,
    cameraMaxZoom: 16,
    coverage: QLD_COVERAGE,
    attribution: `Aerial imagery ${link('https://qldspatial.information.qld.gov.au/', '© State of Queensland')}; © Planet Labs Netherlands B.V. reproduced under licence from Planet and Geoplex`,
  },
  {
    id: 'tas',
    sourceId: 'imagery-tas',
    layerId: 'imagery-tas',
    name: 'Tasmanian Government (theLIST)',
    tiles:
      'https://services.thelist.tas.gov.au/arcgis/rest/services/Basemaps/Orthophoto/MapServer/tile/{z}/{y}/{x}',
    bounds: bboxOf(TAS_COVERAGE),
    sourceMaxZoom: 18,
    cameraMaxZoom: 17.5,
    coverage: TAS_COVERAGE,
    attribution: `Orthophoto ${link('https://www.thelist.tas.gov.au/', '© State of Tasmania')}`,
  },
];

export const STATE_IMAGERY_LAYER_IDS: readonly string[] = STATE_IMAGERY.map((s) => s.layerId);

/** The deepest zoom any state allows; the Map's own `maxZoom` while nothing narrower applies. */
export const STATE_IMAGERY_MAX_ZOOM = Math.max(...STATE_IMAGERY.map((s) => s.cameraMaxZoom));

export function stateImagerySources(): Record<string, RasterSourceSpecification> {
  return Object.fromEntries(
    STATE_IMAGERY.map((s) => [
      s.sourceId,
      {
        type: 'raster',
        tiles: [s.tiles],
        tileSize: 256,
        minzoom: STATE_IMAGERY_MIN_ZOOM,
        maxzoom: s.sourceMaxZoom,
        bounds: [...s.bounds],
        attribution: s.attribution,
      } satisfies RasterSourceSpecification,
    ]),
  );
}

export function stateImageryLayers(visible: boolean): RasterLayerSpecification[] {
  return STATE_IMAGERY.map((s) => ({
    id: s.layerId,
    type: 'raster',
    source: s.sourceId,
    minzoom: STATE_IMAGERY_MIN_ZOOM,
    layout: { visibility: visibility(visible) },
    paint: {
      'raster-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        STATE_IMAGERY_MIN_ZOOM,
        0,
        FADE_END_ZOOM,
        1,
      ],
      'raster-fade-duration': 250,
    },
  }));
}

/** Pure ray-casting point-in-polygon test. */
export function inRing(lng: number, lat: number, ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The state imagery covering `[lng, lat]`, deepest-zooming first (empty outside NSW/QLD/TAS). */
export function stateImageryAt(lng: number, lat: number): StateImagery[] {
  return STATE_IMAGERY.filter((s) => inRing(lng, lat, s.coverage)).sort(
    (a, b) => b.cameraMaxZoom - a.cameraMaxZoom,
  );
}
