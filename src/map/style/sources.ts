import type {
  RasterDEMSourceSpecification,
  RasterSourceSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import { AUSTRALIA_BOUNDS } from './ids';

export type DemProvider = 'mapterhorn' | 'aws';

/**
 * `bounds` for every source: `AUSTRALIA_BOUNDS` padded by 0.5°. The contract box stops at 9.5° S, but
 * the northern Torres Strait islands (Boigu 9.23° S, Saibai 9.38° S, Dauan 9.42° S) are home to Torres
 * Strait Islander nations, and at z ≥ 12 their tiles would otherwise never load. MapLibre only requests
 * tiles that intersect these bounds, so nothing from the rest of the planet is fetched.
 */
const PAD = 0.5;
export const SOURCE_BOUNDS: [number, number, number, number] = [
  AUSTRALIA_BOUNDS[0][0] - PAD,
  AUSTRALIA_BOUNDS[0][1] - PAD,
  AUSTRALIA_BOUNDS[1][0] + PAD,
  AUSTRALIA_BOUNDS[1][1] + PAD,
];

/**
 * Plain-text attribution, exactly as in docs/research.md, for the app's attribution footer (WS5).
 * The sources below carry the same text as HTML for MapLibre's AttributionControl.
 */
export const ATTRIBUTION_TEXT = {
  mapterhorn: '© Mapterhorn',
  aws: 'Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)',
  imagery:
    'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
  labels: '© OpenMapTiles © OpenStreetMap contributors',
} as const;

const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const ATTRIBUTION_HTML = {
  mapterhorn: link('https://mapterhorn.com/attribution', ATTRIBUTION_TEXT.mapterhorn),
  aws: link(
    'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    ATTRIBUTION_TEXT.aws,
  ),
  imagery: `Sentinel-2 cloudless – ${link('https://s2maps.eu', 'https://s2maps.eu')} by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)`,
  // OpenFreeMap asks to be credited too; the research.md string follows it unchanged.
  labels: `${link('https://openfreemap.org', 'OpenFreeMap')} ${link('https://www.openmaptiles.org/', '© OpenMapTiles')} ${link('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors')}`,
} as const;

interface DemProviderConfig {
  tiles: string[];
  tileSize: number;
  maxzoom: number;
  attribution: string;
}

export const DEM_PROVIDERS: Record<DemProvider, DemProviderConfig> = {
  mapterhorn: {
    tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
    tileSize: 512,
    maxzoom: 17,
    attribution: ATTRIBUTION_HTML.mapterhorn,
  },
  aws: {
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    attribution: ATTRIBUTION_HTML.aws,
  },
};

/** Which provider a DEM source spec (or live source) points at, judged by its tile URL. */
export function demProviderOf(source: { tiles?: string[] } | undefined): DemProvider | null {
  const url = source?.tiles?.[0];
  if (!url) return null;
  for (const [provider, cfg] of Object.entries(DEM_PROVIDERS) as [
    DemProvider,
    DemProviderConfig,
  ][]) {
    if (cfg.tiles[0] === url) return provider;
  }
  return null;
}

export function demSource(provider: DemProvider): RasterDEMSourceSpecification {
  const cfg = DEM_PROVIDERS[provider];
  return {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [...cfg.tiles],
    tileSize: cfg.tileSize,
    maxzoom: cfg.maxzoom,
    bounds: [...SOURCE_BOUNDS],
    attribution: cfg.attribution,
  };
}

/**
 * Deepest EOX zoom with real detail. Sentinel-2 is 10 m/pixel, which z 14 already matches (~8 m/px at
 * Australian latitudes); EOX serves z 15+ too, but those tiles are the same pixels upscaled.
 */
export const IMAGERY_MAX_ZOOM = 14;

export function imagerySource(): RasterSourceSpecification {
  return {
    type: 'raster',
    // EOX WMTS uses {z}/{y}/{x} (row before column).
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
    tileSize: 256,
    maxzoom: IMAGERY_MAX_ZOOM,
    bounds: [...SOURCE_BOUNDS],
    attribution: ATTRIBUTION_HTML.imagery,
  };
}

/**
 * OpenFreeMap planet tiles (OpenMapTiles schema), copied from the `openmaptiles` source of
 * https://tiles.openfreemap.org/styles/liberty. The TileJSON `url` is kept (its `tiles` URL is
 * versioned and rotates weekly); our `bounds` and `attribution` override the TileJSON's because
 * MapLibre merges style-level options over it.
 */
export function labelsSource(): VectorSourceSpecification {
  return {
    type: 'vector',
    url: 'https://tiles.openfreemap.org/planet',
    bounds: [...SOURCE_BOUNDS],
    attribution: ATTRIBUTION_HTML.labels,
  };
}

/** OpenFreeMap glyphs; stacks available: "Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic". */
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
