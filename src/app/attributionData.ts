import { FALLBACK_ATTRIBUTION } from './stubs/attributionFallback';

export interface AttributionEntry {
  id: string;
  /** Full credit line, exactly as in docs/research.md. */
  text: string;
  /** Compact form for the always-visible footer line; falls back to `text`. */
  short?: string;
  url?: string;
  licence?: string;
}

export const ATTRIBUTION_URL = `${import.meta.env.BASE_URL}data/attribution.json`;

/** Always credited; the map renderer is not part of WS3's data attribution file. */
export const MAPLIBRE_ENTRY: AttributionEntry = {
  id: 'maplibre',
  short: '© MapLibre',
  text: '© MapLibre',
  url: 'https://maplibre.org/',
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * Tolerant parser for WS3's `attribution.json`, whose exact shape is not in docs/contracts.md yet.
 * Accepts a bare array or an object with one array property (`entries`, `items`, `sources`,
 * `attributions`, `attribution`); each item may be a string or an object with a text-like field
 * (`text`, `attribution`, `label`, `name`, `title`) and optional `short`, `url`/`href`/`link`,
 * `licence`/`license`. Returns null when nothing usable is found.
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
      short: str(o.short),
      url: str(o.url) ?? str(o.href) ?? str(o.link),
      licence: str(o.licence) ?? str(o.license),
    });
  });
  return out.length ? out : null;
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
