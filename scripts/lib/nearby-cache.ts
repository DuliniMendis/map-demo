import { join } from 'node:path';
import type { NearbyResult, StoredFeature } from './nearby.ts';
import { OSM_CACHE_DIR } from './paths.ts';

/** One Overpass query per class, in this order. */
export const OSM_CLASSES = ['towns', 'peaks', 'rivers', 'lakes', 'ranges'] as const;
export type OsmClass = (typeof OSM_CLASSES)[number];

export const snapshotFile = (cls: OsmClass): string => join(OSM_CACHE_DIR, `${cls}.json`);

/** data/cache/osm/<class>.json — committed, trimmed extract of one Overpass response. */
export interface OsmSnapshot {
  class: OsmClass;
  /** Date the query ran (Australia/Sydney). */
  retrieved: string;
  /** Overpass `osm3s.timestamp_osm_base`: the OSM data state the extract reflects. */
  osmBase: string;
  endpoint: string;
  query: string;
  licence: string;
  /** Size of the raw response (not committed). */
  rawBytes: number;
  /** Rivers only: Douglas–Peucker tolerance applied before committing. */
  simplifiedKm?: number;
  /** Features in the raw response (named, of the right kind) before clipping. */
  rawCount: number;
  /**
   * Only features within `radiusKm` of a nation point are committed (the rest can never be
   * chosen). `pointsKey` identifies that point set; if the AUSTLANG points change, nearby.ts
   * re-clips from the raw cache or asks for --refresh.
   */
  clip: { radiusKm: number; pointsKey: string };
  count: number;
  features: StoredFeature[];
}

/** data/cache/osm/nearby.json — per-nation results, merged into nations.json by the build. */
export interface NearbyCache {
  /** count: named features Australia-wide; committed: those within the cut-off of a nation. */
  sources: Record<
    OsmClass,
    { retrieved: string; osmBase: string; count: number; committed: number }
  >;
  townMaxKm: number;
  landmarkMaxKm: number;
  /** Keyed by AUSTLANG id; lng/lat let the build reject results for a moved point. */
  nations: Record<string, { lng: number; lat: number } & NearbyResult>;
}
