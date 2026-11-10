export const TLCMAP_URL = 'https://tlcmap.org/layers/81/json/download';
export const TLCMAP_LAYER_URL = 'https://tlcmap.org/layers/81';
export const AIATSIS_CSV_URL = 'https://collection.aiatsis.gov.au/datasets/austlang/001.csv';

/** Shape of TLCMap layer 81 (AUSTLANG mirror) GeoJSON, as downloaded on 2026-11-09. */
export interface AustlangProperties {
  language_code: string;
  language_name: string;
  language_synonym?: string | null;
  thesaurus_heading_language?: string | null;
  thesaurus_heading_people?: string | null;
  approximate_latitude_of_language_variety?: string | number | null;
  approximate_longitude_of_language_variety?: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  uri?: string | null;
  [key: string]: unknown;
}

export interface AustlangFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | null;
  properties: AustlangProperties;
}

export interface AustlangCollection {
  type: 'FeatureCollection';
  metadata?: Record<string, unknown>;
  features: AustlangFeature[];
}

/** Throws unless `data` looks like the TLCMap AUSTLANG layer. */
export function assertAustlangCollection(data: unknown): asserts data is AustlangCollection {
  const d = data as Partial<AustlangCollection> | null;
  if (d?.type !== 'FeatureCollection' || !Array.isArray(d.features)) {
    throw new Error('not a GeoJSON FeatureCollection');
  }
  if (d.features.length < 400) {
    throw new Error(`only ${d.features.length} features; expected ~455`);
  }
  const bad = d.features.findIndex(
    (f) => typeof f?.properties?.language_code !== 'string' || !f.properties.language_name,
  );
  if (bad !== -1) throw new Error(`feature ${bad} has no language_code/language_name`);
}
