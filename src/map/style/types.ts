import type { DemProvider } from './sources';

/** Contract (docs/contracts.md). `imagery…relief` mirror the store's `layers`; exaggeration 1.0–2.5. */
export interface StyleOptions {
  imagery: boolean;
  labels: boolean;
  hillshade: boolean;
  relief: boolean;
  exaggeration: number;
  demProvider: DemProvider;
}

/** Payload of the `style:dem-fallback` event fired on the Map. */
export interface DemFallbackEventData {
  from: DemProvider;
  to: DemProvider;
  /** The tile error that tipped it over (the last of the consecutive failures). */
  error?: { message: string };
}
