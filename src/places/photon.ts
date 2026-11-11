// Place search through Photon (https://photon.komoot.io), an OpenStreetMap geocoder run by komoot.
// Free, keyless and CORS-enabled; their fair-use note: "please be fair - extensive usage will be
// throttled". So: debounce in the UI, a minimum query length, and abort superseded requests.
import { AUSTRALIA_BOUNDS } from '../map/style/ids';

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const MIN_QUERY_LENGTH = 3;
const LIMIT = 6;

export interface PlaceResult {
  /** Stable key for React lists, from the OSM object. */
  id: string;
  /** Main line, e.g. "Newtown" or "12 King Street". */
  label: string;
  /** Second line, e.g. "Sydney, New South Wales 2042". */
  detail: string;
  lng: number;
  lat: number;
  /** [[west, south], [east, north]] when OSM has an outline (suburbs, towns); absent for addresses. */
  bounds?: [[number, number], [number, number]];
  /** Photon's `type`: house, street, district, city, locality, … */
  kind: string;
}

/**
 * Pure: the request URL, limited to Australia's bounding box. No location bias: biasing towards the
 * map centre ranks nearby streets above whole suburbs elsewhere ("Fitzroy" from Sydney).
 */
export function buildPhotonUrl(query: string): string {
  const [[w, s], [e, n]] = AUSTRALIA_BOUNDS;
  const p = new URLSearchParams({
    q: query.trim(),
    limit: String(LIMIT),
    lang: 'en',
    bbox: `${w},${s},${e},${n}`,
  });
  return `${PHOTON_URL}?${p.toString()}`;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function boundsFromExtent(extent: unknown): PlaceResult['bounds'] {
  if (!Array.isArray(extent) || extent.length !== 4) return undefined;
  const v = extent.map(num);
  if (v.some((x) => x === undefined)) return undefined;
  // Photon sends [minLon, maxLat, maxLon, minLat]; sort to be safe.
  const [a, b, c, d] = v as number[];
  return [
    [Math.min(a, c), Math.min(b, d)],
    [Math.max(a, c), Math.max(b, d)],
  ];
}

/** Pure: Photon's GeoJSON → results in Australia, without duplicate lines. */
export function parsePhoton(data: unknown): PlaceResult[] {
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const f of features as { properties?: Record<string, unknown>; geometry?: unknown }[]) {
    const p = f?.properties ?? {};
    const coords = (f?.geometry as { coordinates?: unknown })?.coordinates;
    if (!Array.isArray(coords)) continue;
    const lng = num(coords[0]);
    const lat = num(coords[1]);
    if (lng === undefined || lat === undefined) continue;
    const country = str(p.countrycode);
    if (country && country.toUpperCase() !== 'AU') continue;

    const street = [str(p.housenumber), str(p.street)].filter(Boolean).join(' ') || undefined;
    const name = str(p.name);
    const label = name ?? street;
    if (!label) continue;
    const place = [
      street !== label ? street : undefined,
      str(p.district),
      str(p.city) ?? str(p.county),
    ]
      .concat(str(p.state))
      .filter((x): x is string => !!x && x !== label);
    const unique = [...new Set(place)];
    const postcode = str(p.postcode);
    const detail = [unique.join(', '), postcode].filter(Boolean).join(' ');

    const key = `${label}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${str(p.osm_type) ?? '?'}${String(p.osm_id ?? out.length)}`,
      label,
      detail,
      lng,
      lat,
      bounds: boundsFromExtent(p.extent),
      kind: str(p.type) ?? str(p.osm_value) ?? 'place',
    });
  }
  return out;
}

export async function searchPlaces(
  query: string,
  opts: { signal?: AbortSignal } = {},
): Promise<PlaceResult[]> {
  const res = await fetch(buildPhotonUrl(query), { signal: opts.signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  return parsePhoton(await res.json());
}
