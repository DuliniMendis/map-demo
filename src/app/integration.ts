// Phase 2 swap points. Every module the app shell needs from WS1/WS2/WS4 is imported through this
// file, so integrating a merged workstream is a one-line change here (see ./stubs/README.md).
// Nothing else in the app imports from ./stubs directly (except ./attributionData.ts's fallback list).

// WS1 — style factory. Real: '../map/style/buildStyle'
export { applyStyleOptions, buildStyle, watchDemFallback } from './stubs/buildStyle';
export type { StyleOptions } from './stubs/buildStyle';

// WS2 — camera + markers. Real: '../map/controller/MapController'
export { MapController } from './stubs/MapController';

// WS4 — UI. Real: '../ui/SidePanel', '../ui/InfoCard', '../ui/Disclaimer'
export { SidePanel } from './stubs/ui';
export { InfoCard } from './stubs/ui';
export { Disclaimer } from './stubs/ui';
