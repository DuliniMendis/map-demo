/**
 * WS8 — nearest OpenStreetMap town and natural landmark for every nation (build time only).
 *
 * 1. Five Australia-wide Overpass queries, one per feature class (towns, peaks, rivers, lakes,
 *    ranges), run one after another with a pause between them and a generic project User-Agent.
 *    Raw responses go to data/cache/osm/raw/<class>-<date>.overpass (Overpass JSON, gitignored:
 *    ~140 MB, rivers alone 136 MB; not named .json so Prettier skips them). A trimmed snapshot — OSM id, name, kind and the coordinates needed for
 *    distance (river lines simplified to 10 m and polyline-encoded), clipped to the features
 *    within the cut-off of some nation point (no other feature can ever be chosen) — goes to
 *    data/cache/osm/<class>.json with the fetch date and the OSM data timestamp; it is committed.
 * 2. For each nation: nearest place=city|town within 100 km, nearest named peak / river / lake /
 *    range within 50 km → data/cache/osm/nearby.json, which scripts/build-nations.ts merges into
 *    public/data/nations.json.
 *
 * Reruns use the committed snapshot (no network) unless --refresh. If a snapshot is missing,
 * the raw cache is re-trimmed when present, otherwise that class is fetched.
 *
 * Network policy: overpass-api.de first; on refusal (429/5xx) or timeout, back off and retry
 * twice, then switch to one alternate public instance. If that fails too, stop (never hammer)
 * and keep whatever snapshot exists. Failure exits 0 with a warning when every class still has a
 * snapshot, else 1; --strict makes any failure fatal.
 *
 * Usage: node scripts/nearby.ts [--refresh] [--only towns,rivers] [--strict]
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { parseArgs } from 'node:util';
import { assertAustlangCollection } from './lib/austlang.ts';
import type { CleaningPolicy } from './lib/clean.ts';
import { readJson, writeJsonFormatted } from './lib/io.ts';
import { HttpError } from './lib/net.ts';
import type { NearbyCache, OsmClass, OsmSnapshot } from './lib/nearby-cache.ts';
import { OSM_CLASSES, snapshotFile } from './lib/nearby-cache.ts';
import type { NearbyKind, OsmFeature } from './lib/nearby.ts';
import {
  LANDMARK_MAX_KM,
  TOWN_MAX_KM,
  fromStored,
  clipToPoints,
  indexFeatures,
  nearbyFor,
  pointsKey,
  simplifyLine,
  toStored,
} from './lib/nearby.ts';
import { extractNations } from './lib/nations.ts';
import {
  CLEANING_FILE,
  NEARBY_CACHE,
  OSM_RAW_DIR,
  ROOT,
  newestSnapshot,
  todayAu,
} from './lib/paths.ts';

const rel = (f: string) => relative(ROOT, f);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Generic client id: names the project and purpose, no personal details. */
const OVERPASS_USER_AGENT =
  'country-map-data-pipeline/1.0 (build-time OSM extract; open-source map demo)';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
const PAUSE_BETWEEN_QUERIES_MS = 15_000;
const BACKOFF_MS = [30_000, 90_000];
const CLIENT_TIMEOUT_MS = 20 * 60_000;
/** River lines are simplified to this deviation before committing (well under the 0.1 km shown). */
const RIVER_SIMPLIFY_KM = 0.01;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

const AREA = 'area["ISO3166-1"="AU"]["admin_level"="2"]->.au;';
const QUERIES: Record<OsmClass, string> = {
  towns: `[out:json][timeout:900];${AREA}node["place"~"^(city|town)$"]["name"](area.au);out qt;`,
  peaks: `[out:json][timeout:900];${AREA}node["natural"="peak"]["name"](area.au);out qt;`,
  rivers: `[out:json][timeout:900][maxsize:1073741824];${AREA}way["waterway"="river"]["name"](area.au);out tags geom qt;`,
  lakes:
    `[out:json][timeout:900];${AREA}(way["natural"="water"]["water"="lake"]["name"](area.au);` +
    `relation["natural"="water"]["water"="lake"]["name"](area.au););out tags center qt;`,
  ranges:
    `[out:json][timeout:900];${AREA}(nwr["natural"="mountain_range"]["name"](area.au);` +
    `way["natural"="ridge"]["name"](area.au););out tags center qt;`,
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: ({ lat: number; lon: number } | null)[];
  tags?: Record<string, string>;
}
interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  remark?: string;
  elements?: OverpassElement[];
}

const osmId = (e: OverpassElement) => `${e.type[0]}${e.id}`;

function kindOf(cls: OsmClass, e: OverpassElement): NearbyKind | null {
  switch (cls) {
    case 'towns':
      return e.tags?.place === 'city' ? 'city' : e.tags?.place === 'town' ? 'town' : null;
    case 'peaks':
      return 'peak';
    case 'rivers':
      return 'river';
    case 'lakes':
      return 'lake';
    case 'ranges':
      return 'range';
  }
}

/** Raw Overpass elements → trimmed features (name exactly as the OSM `name` tag). */
function trim(cls: OsmClass, elements: readonly OverpassElement[]): OsmFeature[] {
  const out: OsmFeature[] = [];
  for (const e of elements) {
    const name = e.tags?.name;
    const kind = kindOf(cls, e);
    if (!name || !kind) continue;
    if (cls === 'rivers') {
      const pts = (e.geometry ?? [])
        .filter((p): p is { lat: number; lon: number } => p !== null)
        .map((p) => [p.lon, p.lat] as [number, number]);
      if (!pts.length) continue;
      const line = simplifyLine(pts, RIVER_SIMPLIFY_KM).map(
        ([x, y]) => [r5(x), r5(y)] as [number, number],
      );
      out.push({ osm: osmId(e), name, kind, lines: [line] });
    } else {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat === undefined || lon === undefined) continue;
      out.push({ osm: osmId(e), name, kind, at: [r5(lon), r5(lat)] });
    }
  }
  return out.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
}

const retryable = (err: unknown) =>
  !(err instanceof HttpError) || err.status === 429 || err.status >= 500;

/** POSTs one query and streams the response to `file`. Throws HttpError / network errors. */
async function postQuery(endpoint: string, query: string, file: string): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': OVERPASS_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const text = (await res.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    throw new HttpError(res.status, `HTTP ${res.status} from ${endpoint}: ${text}`);
  }
  mkdirSync(OSM_RAW_DIR, { recursive: true });
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(file),
  );
  const body = JSON.parse(readFileSync(file, 'utf8')) as OverpassResponse;
  // Overpass reports query timeouts and memory exhaustion as a 200 with a `remark`.
  if (body.remark && /error|timed out|out of memory/i.test(body.remark)) {
    throw new HttpError(504, `Overpass remark from ${endpoint}: ${body.remark}`);
  }
  if (!Array.isArray(body.elements)) throw new HttpError(502, 'response has no elements array');
}

class Client {
  private endpointIndex = 0;
  private queries = 0;
  /** Runs a query politely; switches to the alternate instance at most once, then gives up. */
  async run(cls: OsmClass, file: string): Promise<string> {
    for (;;) {
      const endpoint = ENDPOINTS[this.endpointIndex];
      for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
        if (this.queries++ > 0) await sleep(PAUSE_BETWEEN_QUERIES_MS);
        const t0 = performance.now();
        console.log(`[osm] ${cls}: querying ${new URL(endpoint).host} (attempt ${attempt + 1})…`);
        try {
          await postQuery(endpoint, QUERIES[cls], file);
          const mb = (statSync(file).size / 1e6).toFixed(1);
          console.log(
            `[osm] ${cls}: ${mb} MB in ${((performance.now() - t0) / 1000).toFixed(0)} s`,
          );
          return endpoint;
        } catch (err) {
          const msg = (err as Error).message;
          console.warn(`[osm] ${cls}: ${msg}`);
          if (!retryable(err)) throw err;
          if (attempt < BACKOFF_MS.length) {
            console.warn(`[osm] backing off ${BACKOFF_MS[attempt] / 1000} s`);
            await sleep(BACKOFF_MS[attempt]);
          }
        }
      }
      if (this.endpointIndex + 1 >= ENDPOINTS.length) {
        throw new Error(
          `all Overpass endpoints refused or timed out (${ENDPOINTS.join(', ')}); stopping`,
        );
      }
      this.endpointIndex++;
      console.warn(`[osm] switching to ${ENDPOINTS[this.endpointIndex]}`);
    }
  }
}

function newestRaw(cls: OsmClass): { file: string; date: string } | null {
  if (!existsSync(OSM_RAW_DIR)) return null;
  const re = new RegExp(`^${cls}-(\\d{4}-\\d{2}-\\d{2})\\.overpass$`);
  const hit = readdirSync(OSM_RAW_DIR)
    .map((f) => ({ f, m: re.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => a.m[1].localeCompare(b.m[1]))
    .at(-1);
  return hit ? { file: join(OSM_RAW_DIR, hit.f), date: hit.m[1] } : null;
}

const clipRadius = (cls: OsmClass) => (cls === 'towns' ? TOWN_MAX_KM : LANDMARK_MAX_KM);

async function snapshotFromRaw(
  cls: OsmClass,
  raw: { file: string; date: string },
  endpoint: string,
  points: readonly (readonly [number, number])[],
): Promise<OsmSnapshot> {
  const body = JSON.parse(readFileSync(raw.file, 'utf8')) as OverpassResponse;
  const all = trim(cls, body.elements ?? []);
  const features = clipToPoints(all, points, clipRadius(cls));
  const snap: OsmSnapshot = {
    class: cls,
    retrieved: raw.date,
    osmBase: body.osm3s?.timestamp_osm_base ?? '',
    endpoint,
    query: QUERIES[cls],
    licence: 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
    rawBytes: statSync(raw.file).size,
    ...(cls === 'rivers' ? { simplifiedKm: RIVER_SIMPLIFY_KM } : {}),
    rawCount: all.length,
    clip: { radiusKm: clipRadius(cls), pointsKey: pointsKey(points) },
    count: features.length,
    features: features.map(toStored),
  };
  await writeJsonFormatted(snapshotFile(cls), snap);
  console.log(
    `[osm] ${cls}: ${all.length} features, ${features.length} within ${clipRadius(cls)} km of a nation → ${rel(snapshotFile(cls))} ` +
      `(${(statSync(snapshotFile(cls)).size / 1e6).toFixed(2)} MB)`,
  );
  return snap;
}

async function main() {
  const { values } = parseArgs({
    options: {
      refresh: { type: 'boolean', default: false },
      only: { type: 'string' },
      strict: { type: 'boolean', default: false },
    },
  });
  const only = values.only ? new Set(values.only.split(',')) : null;
  for (const c of only ?? []) {
    if (!OSM_CLASSES.includes(c as OsmClass)) throw new Error(`unknown class "${c}"`);
  }

  const snap = newestSnapshot();
  if (!snap) throw new Error('no data/raw snapshot; run node scripts/fetch-austlang.ts first');
  const fc: unknown = JSON.parse(readFileSync(snap.file, 'utf8'));
  assertAustlangCollection(fc);
  const { nations } = extractNations(fc, readJson<CleaningPolicy>(CLEANING_FILE));
  const points = nations.map((n) => [n.lng, n.lat] as const);
  const key = pointsKey(points);

  const client = new Client();
  const snapshots = new Map<OsmClass, OsmSnapshot>();
  let failure: Error | null = null;
  for (const cls of OSM_CLASSES) {
    const file = snapshotFile(cls);
    const wanted = values.refresh && (!only || only.has(cls));
    const prev = existsSync(file) ? readJson<OsmSnapshot>(file) : null;
    if (!wanted && prev?.clip?.pointsKey === key) {
      snapshots.set(cls, prev);
      continue;
    }
    const raw = newestRaw(cls);
    if (!wanted && raw) {
      if (prev)
        console.log(`[osm] ${cls}: nation points changed; re-clipping from ${rel(raw.file)}`);
      snapshots.set(cls, await snapshotFromRaw(cls, raw, prev?.endpoint ?? '(raw cache)', points));
      continue;
    }
    if (!wanted && prev) {
      throw new Error(
        `[osm] ${cls}: the committed snapshot was clipped to a different set of nation points ` +
          `and there is no raw cache to re-clip from; run node scripts/nearby.ts --refresh --only ${cls}`,
      );
    }
    if (failure) {
      if (existsSync(file)) snapshots.set(cls, readJson<OsmSnapshot>(file));
      continue;
    }
    const date = todayAu();
    const target = join(OSM_RAW_DIR, `${cls}-${date}.overpass`);
    try {
      const endpoint = await client.run(cls, target);
      snapshots.set(cls, await snapshotFromRaw(cls, { file: target, date }, endpoint, points));
    } catch (err) {
      failure = err as Error;
      console.error(`[osm] ${cls}: ${failure.message}`);
      if (existsSync(file)) snapshots.set(cls, readJson<OsmSnapshot>(file));
    }
  }

  const missing = OSM_CLASSES.filter((c) => !snapshots.has(c));
  if (failure && (values.strict || missing.length)) {
    throw new Error(
      `[osm] stopped after a failed query; no snapshot for: ${missing.join(', ') || '(none)'}`,
      { cause: failure },
    );
  }
  if (failure) console.warn('[osm] a refresh failed; kept the existing snapshots');

  // Nearest search over the trimmed snapshots.
  const feats = (c: OsmClass) => snapshots.get(c)!.features.map(fromStored);
  const towns = indexFeatures(feats('towns'));
  const landmarks = indexFeatures([
    ...feats('peaks'),
    ...feats('rivers'),
    ...feats('lakes'),
    ...feats('ranges'),
  ]);

  const t0 = performance.now();
  const cache: NearbyCache = {
    sources: Object.fromEntries(
      OSM_CLASSES.map((c) => {
        const s = snapshots.get(c)!;
        const src = { retrieved: s.retrieved, osmBase: s.osmBase, count: s.rawCount };
        return [c, { ...src, committed: s.count }];
      }),
    ) as NearbyCache['sources'],
    townMaxKm: TOWN_MAX_KM,
    landmarkMaxKm: LANDMARK_MAX_KM,
    nations: {},
  };
  let withTown = 0;
  let withLandmark = 0;
  for (const n of nations) {
    const r = nearbyFor(n.lng, n.lat, towns, landmarks);
    cache.nations[n.id] = { lng: n.lng, lat: n.lat, ...r };
    if (r.town) withTown++;
    if (r.landmark) withLandmark++;
  }
  await writeJsonFormatted(NEARBY_CACHE, cache);
  console.log(
    `[nearby] ${nations.length} nations: ${withTown} with a town ≤ ${TOWN_MAX_KM} km, ` +
      `${withLandmark} with a landmark ≤ ${LANDMARK_MAX_KM} km ` +
      `(${((performance.now() - t0) / 1000).toFixed(1)} s) → ${rel(NEARBY_CACHE)}`,
  );
}

await main();
