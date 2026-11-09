// Public surface of the basemap style (WS1). `buildStyle.ts` and `ids.ts` also work as import paths,
// per docs/contracts.md.
export * from './ids';
export { applyStyleOptions, buildStyle, DEFAULT_STYLE_OPTIONS } from './buildStyle';
export type { DemFallbackEventData, StyleOptions } from './types';
export {
  countsAsOutage,
  DEM_FALLBACK_THRESHOLD,
  installDemFallback,
  onDemFallback,
  watchDemFallback,
} from './demFallback';
export { getActiveDemProvider, hasFallenBack } from './demProvider';
export { LABEL_LAYER_IDS } from './layers/labels';
export { RELIEF_RAMP } from './layers/relief';
export { MAP_OPTIONS } from './sky';
export { ATTRIBUTION_TEXT, DEM_PROVIDERS, SOURCE_BOUNDS, type DemProvider } from './sources';
