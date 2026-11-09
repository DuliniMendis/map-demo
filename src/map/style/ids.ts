// TEMPORARY (WS0). WS1 owns and replaces this file; keep these exported names identical to docs/contracts.md.

export const SOURCE_DEM = 'dem', SOURCE_IMAGERY = 'imagery', SOURCE_LABELS = 'labels';
export const LAYER_IMAGERY = 'imagery', LAYER_HILLSHADE = 'hillshade', LAYER_RELIEF = 'relief', LAYER_LABELS_FIRST = 'labels-water'; // WS2 inserts markers *before* LAYER_LABELS_FIRST
export const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [[112.5, -44.5], [154.5, -9.5]];
export const OVERVIEW_CAMERA = { center: [134.0, -26.5], zoom: 3.7, pitch: 0, bearing: 0 } as const;
