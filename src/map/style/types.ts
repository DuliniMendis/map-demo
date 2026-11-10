import type { DemProvider } from './sources';

/** Contract (docs/contracts.md). `imagery…relief` mirror the store's `layers`; exaggeration 1.0–2.5. */
export interface StyleOptions {
  imagery: boolean;
  labels: boolean;
  hillshade: boolean;
  relief: boolean;
  exaggeration: number;
  demProvider: DemProvider;
  /** Phase 3 (WS7): DEM contour lines from z 10 (fully drawn by z 10.5, where nation flights land). */
  contours: boolean;
  /** Phase 3 (WS7): local solar hour 5–19 driving hillshade illumination; null = fixed default light. */
  sunHour: number | null;
  /** Phase 3 (WS9): globe projection when zoomed out, mercator from z 4 in. */
  globe: boolean;
}

/** Payload of the `style:dem-fallback` event fired on the Map. */
export interface DemFallbackEventData {
  from: DemProvider;
  to: DemProvider;
  /** The tile error that tipped it over (the last of the consecutive failures). */
  error?: { message: string };
}
