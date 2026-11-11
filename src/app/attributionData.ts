import { FALLBACK_ATTRIBUTION } from './attributionFallback';

/** One item of WS3's `public/data/attribution.json` (`{ generatedAt, disclaimer, items: [...] }`). */
export interface AttributionEntry {
  id: string;
  /** Full credit line, exactly as in docs/research.md. */
  text: string;
  url?: string;
  licence?: string;
  licenceUrl?: string;
  /** What the source is used for, e.g. "Language locations". */
  usedFor?: string;
  /** Source category from WS3 (e.g. data / terrain / imagery / labels). */
  kind?: string;
}

/** Compact footer labels, matched against the full credit text. */
const COMPACT: [RegExp, string][] = [
  [/AUSTLANG|AIATSIS/i, '© AIATSIS (AUSTLANG)'],
  [/Mapterhorn/i, '© Mapterhorn'],
  [/Mapzen|Terrain Tiles/i, 'Terrain Tiles (Mapzen/AWS)'],
  [/EOX|Sentinel/i, 'Sentinel-2 cloudless by EOX'],
  [/State of New South Wales/i, 'Aerial © NSW'],
  [/State of Queensland/i, 'Aerial © QLD, Planet'],
  [/State of Tasmania/i, 'Aerial © TAS'],
  [/^Nearby towns and landmarks/i, 'Nearby places © OpenStreetMap'],
  [/Native Land/i, 'Territories © Native Land Digital'],
  [/Photon/i, 'Search: Photon (© OpenStreetMap)'],
  [/OpenStreetMap|OpenMapTiles/i, '© OpenMapTiles © OpenStreetMap'],
  [/Bureau of Statistics|\bABS\b/i, '© ABS'],
  [/MapLibre/i, '© MapLibre'],
  [/Wikidata/i, 'Wikidata (CC0)'],
];

/** Pure: short label for the always-visible footer line (the full text is one click away). */
export function compactLabel(e: Pick<AttributionEntry, 'text'>): string {
  return COMPACT.find(([re]) => re.test(e.text))?.[1] ?? e.text;
}

export const ATTRIBUTION_URL = `${import.meta.env.BASE_URL}data/attribution.json`;

/** Always credited; the map renderer is not part of WS3's data attribution file. */
export const MAPLIBRE_ENTRY: AttributionEntry = {
  id: 'maplibre',
  text: '© MapLibre',
  url: 'https://maplibre.org/',
  usedFor: 'Map rendering',
  kind: 'software',
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * Parser for WS3's `attribution.json`: `{ generatedAt, disclaimer, items: [{ id, text, url,
 * licence?, licenceUrl?, usedFor, kind }] }`. Deliberately tolerant (a bare array, `entries`
 * instead of `items`, string items, `license`/`href` spellings) so a small schema drift degrades
 * gracefully instead of blanking the credits. Returns null when nothing usable is found.
 */
export function parseAttribution(data: unknown): AttributionEntry[] | null {
  let list: unknown = data;
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    const o = list as Record<string, unknown>;
    list = ['entries', 'items', 'sources', 'attributions', 'attribution']
      .map((k) => o[k])
      .find(Array.isArray);
  }
  if (!Array.isArray(list)) return null;

  const out: AttributionEntry[] = [];
  list.forEach((item, i) => {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ id: `a${i}`, text: item.trim() });
      return;
    }
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const text = str(o.text) ?? str(o.attribution) ?? str(o.label) ?? str(o.name) ?? str(o.title);
    if (!text) return;
    out.push({
      id: str(o.id) ?? `a${i}`,
      text,
      url: str(o.url) ?? str(o.href) ?? str(o.link),
      licence: str(o.licence) ?? str(o.license),
      licenceUrl: str(o.licenceUrl) ?? str(o.licenseUrl),
      usedFor: str(o.usedFor),
      kind: str(o.kind),
    });
  });
  return out.length ? out : null;
}

/** Runtime services added by src/places (place search, territory overlay); not in WS3's file. */
export const PHOTON_ENTRY: AttributionEntry = {
  id: 'photon',
  text: 'Place search by Photon (komoot), data © OpenStreetMap contributors, ODbL',
  url: 'https://photon.komoot.io/',
  licence: 'ODbL',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/',
  usedFor: 'Finding suburbs and addresses (what you type is sent to photon.komoot.io)',
  kind: 'service',
};

export const NATIVE_LAND_ENTRY: AttributionEntry = {
  id: 'native-land',
  text: 'Territory shapes © Native Land Digital (native-land.ca), used under their Data Sovereignty Treaty',
  url: 'https://native-land.ca/',
  usedFor:
    '"Whose Country?" overlay, fetched at runtime and never stored. Not official or legal boundaries.',
  kind: 'service',
};

/** Adds the place-search and (when configured) Native Land credits. */
export function withPlaces(entries: AttributionEntry[], nativeLand: boolean): AttributionEntry[] {
  const extra = nativeLand ? [PHOTON_ENTRY, NATIVE_LAND_ENTRY] : [PHOTON_ENTRY];
  return [...entries, ...extra.filter((x) => !entries.some((e) => e.id === x.id))];
}

/** Adds the MapLibre credit unless the list already mentions MapLibre. */
export function withMapLibre(entries: AttributionEntry[]): AttributionEntry[] {
  return entries.some((e) => /maplibre/i.test(e.text)) ? entries : [...entries, MAPLIBRE_ENTRY];
}

/** Shown until `loadAttribution()` resolves (and whenever the file is unavailable). */
export const DEFAULT_ATTRIBUTION: AttributionEntry[] = withMapLibre(FALLBACK_ATTRIBUTION);

/**
 * Loads `/data/attribution.json`; falls back to the strings from docs/research.md when the file is
 * missing or unusable, because attribution must always be shown.
 */
export async function loadAttribution(
  fetchImpl: typeof fetch = fetch,
): Promise<AttributionEntry[]> {
  try {
    const res = await fetchImpl(ATTRIBUTION_URL);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
      const parsed = parseAttribution(await res.json());
      if (parsed) return withMapLibre(parsed);
    }
  } catch {
    // fall through to the bundled list
  }
  return DEFAULT_ATTRIBUTION;
}
