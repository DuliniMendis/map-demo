// Runtime lookups against the Native Land Digital API (https://api-docs.native-land.ca).
// Their Data Sovereignty Treaty: non-commercial use only, attribute Native Land Digital, show a
// disclaimer, and do not store or redistribute the data. So nothing here is bundled or persisted:
// responses live in a small in-memory cache for the current page only.
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export const NATIVE_LAND_API = 'https://native-land.ca/api/index.php';
export const NATIVE_LAND_SITE = 'https://native-land.ca/';

/** The operator's key, from `VITE_NATIVE_LAND_KEY` (see docs/places.md). Null when not set up. */
export function nativeLandKey(): string | null {
  const k = import.meta.env.VITE_NATIVE_LAND_KEY;
  return typeof k === 'string' && k.trim() ? k.trim() : null;
}

export interface Territory {
  slug: string;
  name: string;
  /** Native Land's colour for the shape, e.g. "#A1B2C3". */
  color: string;
  /** Their page about this territory. */
  url: string;
  geometry: Polygon | MultiPolygon;
}

/** Rounded to ~1 km so small pans reuse the last answer (Native Land's shapes are coarser than that). */
export function positionKey(lng: number, lat: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Pure: the point-lookup URL (`maps=territories&position=lat,lng&key=…`). */
export function buildTerritoriesUrl(lng: number, lat: number, key: string): string {
  const p = new URLSearchParams({ maps: 'territories', position: positionKey(lng, lat), key });
  return `${NATIVE_LAND_API}?${p.toString()}`;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

/** Pure: Native Land's answer (a bare feature array or a FeatureCollection) → territories. */
export function parseTerritories(data: unknown): Territory[] {
  const list = Array.isArray(data) ? data : (data as { features?: unknown })?.features;
  if (!Array.isArray(list)) return [];
  const out: Territory[] = [];
  const seen = new Set<string>();
  for (const f of list as Feature[]) {
    const g = f?.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const name = str(p.Name) ?? str(p.name);
    if (!name) continue;
    const slug = str(p.Slug) ?? str(p.slug) ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (seen.has(slug)) continue;
    seen.add(slug);
    const color = str(p.color);
    const link = str(p.description);
    out.push({
      slug,
      name,
      color: color && HEX.test(color) ? color : '#e03c31',
      url:
        link && /^https:\/\/native-land\.ca\//.test(link)
          ? link
          : `${NATIVE_LAND_SITE}maps/territories/${encodeURIComponent(slug)}`,
      geometry: g,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));
}

const CACHE_MAX = 40;
const cache = new Map<string, Territory[]>();

export class NativeLandError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Territories at a point. Throws NativeLandError (bad key, network); AbortError passes through. */
export async function territoriesAt(
  lng: number,
  lat: number,
  opts: { key: string; signal?: AbortSignal },
): Promise<Territory[]> {
  const k = positionKey(lng, lat);
  const hit = cache.get(k);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch(buildTerritoriesUrl(lng, lat, opts.key), { signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NativeLandError('Could not reach Native Land Digital');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = str((body as { error?: unknown } | null)?.error);
    throw new NativeLandError(msg ?? `Native Land Digital answered ${res.status}`, res.status);
  }
  const territories = parseTerritories(body);
  cache.set(k, territories);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return territories;
}

/** Test helper. */
export function clearTerritoryCache() {
  cache.clear();
}
