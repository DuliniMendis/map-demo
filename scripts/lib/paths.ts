import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const RAW_DIR = join(ROOT, 'data', 'raw');
export const CACHE_DIR = join(ROOT, 'data', 'cache');
export const SAL_CACHE_DIR = join(CACHE_DIR, 'sal');
export const WIKIDATA_CACHE = join(CACHE_DIR, 'wikidata.json');
/** WS8: trimmed OpenStreetMap snapshots (committed) and raw Overpass responses (gitignored). */
export const OSM_CACHE_DIR = join(CACHE_DIR, 'osm');
export const OSM_RAW_DIR = join(OSM_CACHE_DIR, 'raw');
/** WS8: per-nation nearest town/landmark, written by scripts/nearby.ts, read by the build. */
export const NEARBY_CACHE = join(OSM_CACHE_DIR, 'nearby.json');
export const OVERRIDES_FILE = join(ROOT, 'data', 'overrides.json');
export const CLEANING_FILE = join(ROOT, 'data', 'cleaning.json');
export const REPORT_FILE = join(ROOT, 'data', 'report.md');
export const NATIONS_FILE = join(ROOT, 'public', 'data', 'nations.json');
export const ATTRIBUTION_FILE = join(ROOT, 'public', 'data', 'attribution.json');
export const NATION_TYPES_FILE = join(ROOT, 'src', 'types', 'nation.ts');

const SNAPSHOT_RE = /^austlang-tlcmap-(\d{4}-\d{2}-\d{2})\.geojson$/;
const CSV_SNAPSHOT_RE = /^austlang-aiatsis-(\d{4}-\d{2}-\d{2})\.csv$/;

export const snapshotName = (date: string): string => `austlang-tlcmap-${date}.geojson`;
export const csvSnapshotName = (date: string): string => `austlang-aiatsis-${date}.csv`;

function newest(re: RegExp): { file: string; date: string } | null {
  let files: string[];
  try {
    files = readdirSync(RAW_DIR);
  } catch {
    return null;
  }
  const dated = files
    .map((f) => ({ f, m: re.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => a.m[1].localeCompare(b.m[1]));
  const last = dated.at(-1);
  return last ? { file: join(RAW_DIR, last.f), date: last.m[1] } : null;
}

/** Newest committed TLCMap snapshot (by the date in its file name). */
export const newestSnapshot = (): { file: string; date: string } | null => newest(SNAPSHOT_RE);
/** Newest AIATSIS canonical CSV snapshot, if one was ever downloaded. */
export const newestCsvSnapshot = (): { file: string; date: string } | null =>
  newest(CSV_SNAPSHOT_RE);

/** Today's date (YYYY-MM-DD) in Australian Eastern time, which names snapshots. */
export function todayAu(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}
