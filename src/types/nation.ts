// Shared contract — see docs/contracts.md. Frozen after Phase 0: change only via a PR to docs/contracts.md.

export interface NationView { zoom?: number; pitch?: number; bearing?: number; }

export interface NearbyFeature {
  name: string;               // OSM name tag as published
  kind: 'city' | 'town' | 'village' | 'peak' | 'river' | 'lake' | 'range';
  distanceKm: number;         // great-circle from the nation's point, 1 decimal place
  bearing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'; // from the nation's point to the feature
}

export interface Nation {
  id: string;                 // AUSTLANG code, e.g. "A103"  (stable key, used in URL ?n=)
  name: string;               // AUSTLANG language_name, trimmed
  peopleName?: string;        // from thesaurus_heading_people, e.g. "Waljen people"
  synonyms: string[];         // from language_synonym, split on ", "
  lng: number; lat: number;   // approximate_longitude/latitude_of_language_variety
  modern: {                   // from ABS SAL 2021 point-in-polygon
    locality: string;         // sal_name_2021, e.g. "Petermann"
    state: string;            // state_name_2021, e.g. "Northern Territory"
    stateCode: 'NSW'|'VIC'|'QLD'|'SA'|'WA'|'TAS'|'NT'|'ACT'|'OT';
  };
  links: { austlang: string; wikipedia?: string; };
  view?: NationView;          // per-nation camera override from data/overrides.json
  nearby?: {                  // Phase 3 (WS8): OpenStreetMap, computed at build time
    town?: NearbyFeature;     // nearest place=city|town|village within 100 km
    landmark?: NearbyFeature; // nearest named peak/river/lake/range within 50 km
  };
  source: 'austlang';
}

export interface NationsFile {
  generatedAt: string;        // ISO date
  count: number;
  nations: Nation[];          // sorted by name, locale 'en-AU'
}

export type StateCode = Nation['modern']['stateCode'];

/** Display order for the state filter. */
export const STATE_CODES: readonly StateCode[] = [
  'NSW',
  'VIC',
  'QLD',
  'SA',
  'WA',
  'TAS',
  'NT',
  'ACT',
  'OT',
];

/** ABS `state_name_2021` for each code. */
export const STATE_NAMES: Readonly<Record<StateCode, string>> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
  OT: 'Other Territories',
};
