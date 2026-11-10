// Owned by WS1. The first block is verbatim from docs/contracts.md (this file is excluded from Prettier so
// it stays diffable against the contract). Do not rename or change those values.

export const SOURCE_DEM = 'dem', SOURCE_IMAGERY = 'imagery', SOURCE_LABELS = 'labels';
export const LAYER_IMAGERY = 'imagery', LAYER_HILLSHADE = 'hillshade', LAYER_RELIEF = 'relief', LAYER_LABELS_FIRST = 'labels-water'; // WS2 inserts markers *before* LAYER_LABELS_FIRST
export const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [[112.5, -44.5], [154.5, -9.5]];
export const OVERVIEW_CAMERA = { center: [134.0, -26.5], zoom: 3.7, pitch: 0, bearing: 0 } as const;

// ---- WS1 additions (not in the contract; safe to import, but nobody is required to) ----

/**
 * Second raster-dem source with the same tiles as `SOURCE_DEM`, used by the hillshade and colour-relief
 * layers (MapLibre's recommendation, and it warns otherwise). The terrain mesh loads its DEM one zoom
 * level coarser (TerrainTileManager `deltaZoom = 1`); a separate source lets the hillshade use
 * full-resolution tiles, which keeps escarpments and dune lines crisp.
 */
export const SOURCE_DEM_SHADE = 'dem-shade';

export const LAYER_BACKGROUND = 'background';

/** Fired on the Map (`map.on(DEM_FALLBACK_EVENT, e => …)`) when the DEM switches from Mapterhorn to AWS. */
export const DEM_FALLBACK_EVENT = 'style:dem-fallback';

// ---- WS7 additions (Phase 3) ----

/** Vector contour tiles generated in the browser from the DEM (maplibre-contour); added at runtime. */
export const SOURCE_CONTOURS = 'contours';
export const LAYER_CONTOUR_LINES = 'contour-lines';
export const LAYER_CONTOUR_LABELS = 'contour-labels';
