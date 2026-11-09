/**
 * "Country today": point-in-polygon of every nation's point against ABS ASGS 2021 Suburbs and
 * Localities (SAL), cached per nation in data/cache/sal/<id>.json (committed; ~150 KB).
 *
 * Online (default): ABS ArcGIS FeatureServer, ≤ 5 requests in flight, retry with backoff.
 * Offline: --gpkg <ASGS_2021_SAL GeoPackage> uses node:sqlite + the GeoPackage R-tree index.
 *
 * Points in no SAL polygon (in the sea):
 *   --nearest  → nearest SAL within 25 km (distance stored in the cache and the report);
 *   otherwise, or if none in range → locality "Offshore", state from the ABS STE layer
 *   (state containing the point, else the nearest state within 200 km). Offline mode takes the
 *   offshore state from the nearest SAL within 200 km instead.
 *
 * Usage: node scripts/abs-lookup.ts [--nearest] [--gpkg file] [--layer table] [--refresh] [--only A1,B2]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { assertAustlangCollection } from './lib/austlang.ts';
import type { CleaningPolicy } from './lib/clean.ts';
import type { Ring } from './lib/geo.ts';
import { distanceToRingsKm, kmToDegrees, pointInRings } from './lib/geo.ts';
import { parseGpkgGeometry } from './lib/gpkg.ts';
import { readJson, writeJsonFormatted } from './lib/io.ts';
import { fetchJsonWithRetry, mapPool } from './lib/net.ts';
import { extractNations } from './lib/nations.ts';
import { CLEANING_FILE, SAL_CACHE_DIR, newestSnapshot, todayAu } from './lib/paths.ts';
import type { SalCacheRecord, SalHit } from './lib/sal.ts';
import { NEAREST_KM, cacheUsable, resolveSal, stateCodeFor } from './lib/sal.ts';

const ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021';
const SAL_URL = `${ABS}/SAL/FeatureServer/0/query`;
const STE_URL = `${ABS}/STE/FeatureServer/0/query`;
const MAX_CONCURRENCY = 5;
const OFFSHORE_STATE_RADII_KM = [10, 25, 50, 100, 200];

interface EsriFeature {
  attributes: Record<string, string | number | null>;
  geometry?: { rings: number[][][] };
}
interface EsriResponse {
  features?: EsriFeature[];
  error?: { code: number; message: string };
}

const esriCheck = (body: unknown) => {
  const b = body as EsriResponse;
  if (b.error) throw new Error(`ArcGIS error ${b.error.code}: ${b.error.message}`);
  if (!Array.isArray(b.features)) throw new Error('ArcGIS response has no features array');
};

async function esriQuery(
  url: string,
  lng: number,
  lat: number,
  opts: { distanceKm?: number; outFields: string; geometry?: boolean },
): Promise<EsriFeature[]> {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: opts.outFields,
    returnGeometry: String(Boolean(opts.geometry)),
    f: 'json',
  });
  if (opts.distanceKm) {
    q.set('distance', String(opts.distanceKm * 1000));
    q.set('units', 'esriSRUnit_Meter');
  }
  if (opts.geometry) {
    q.set('outSR', '4326');
    q.set('maxAllowableOffset', '0.0005');
    q.set('geometryPrecision', '5');
  }
  const body = await fetchJsonWithRetry<EsriResponse>(`${url}?${q}`, { check: esriCheck });
  return body.features ?? [];
}

const SAL_FIELDS = 'sal_code_2021,sal_name_2021,state_code_2021,state_name_2021';

function toHit(a: EsriFeature['attributes']): SalHit {
  const state = String(a.state_name_2021);
  return {
    salCode: String(a.sal_code_2021),
    locality: String(a.sal_name_2021).trim(),
    state,
    stateCode: stateCodeFor(state),
  };
}
const bySalCode = (a: SalHit, b: SalHit) => a.salCode.localeCompare(b.salCode);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface Backend {
  name: SalCacheRecord['source'];
  within(lng: number, lat: number): Promise<SalHit | null>;
  nearest(lng: number, lat: number, km: number): Promise<(SalHit & { distanceKm: number }) | null>;
  offshoreState(lng: number, lat: number): Promise<SalCacheRecord['offshoreState']>;
}

function arcgisBackend(): Backend {
  return {
    name: 'abs-arcgis',
    async within(lng, lat) {
      const hits = (await esriQuery(SAL_URL, lng, lat, { outFields: SAL_FIELDS })).map((f) =>
        toHit(f.attributes),
      );
      // SAL has no overlaps; a point exactly on a boundary can touch two. Pick deterministically.
      return hits.sort(bySalCode)[0] ?? null;
    },
    async nearest(lng, lat, km) {
      const feats = await esriQuery(SAL_URL, lng, lat, {
        outFields: SAL_FIELDS,
        distanceKm: km,
        geometry: true,
      });
      const ranked = feats
        .map((f) => ({
          ...toHit(f.attributes),
          distanceKm: round3(distanceToRingsKm(lng, lat, f.geometry?.rings ?? [])),
        }))
        .filter((h) => h.distanceKm <= km)
        .sort((a, b) => a.distanceKm - b.distanceKm || bySalCode(a, b));
      return ranked[0] ?? null;
    },
    async offshoreState(lng, lat) {
      const fields = 'state_code_2021,state_name_2021';
      const inside = await esriQuery(STE_URL, lng, lat, { outFields: fields });
      if (inside.length) {
        const state = String(inside[0].attributes.state_name_2021);
        return { state, stateCode: stateCodeFor(state), method: 'STE contains point' };
      }
      for (const km of OFFSHORE_STATE_RADII_KM) {
        const near = await esriQuery(STE_URL, lng, lat, { outFields: fields, distanceKm: km });
        if (near.length) {
          const states = [...new Set(near.map((f) => String(f.attributes.state_name_2021)))].sort();
          const state = states[0];
          const note = states.length > 1 ? ` (also: ${states.slice(1).join(', ')})` : '';
          return {
            state,
            stateCode: stateCodeFor(state),
            method: `nearest STE within ${km} km${note}`,
          };
        }
      }
      return null;
    },
  };
}

interface GpkgRow {
  rowid: number;
  code: string;
  name: string;
  state: string;
  geom: Uint8Array;
}

function gpkgBackend(file: string, layer?: string): Backend {
  const db = new DatabaseSync(file, { readOnly: true });
  const layers = db.prepare('SELECT table_name, column_name FROM gpkg_geometry_columns').all() as {
    table_name: string;
    column_name: string;
  }[];
  const chosen = layer
    ? layers.find((l) => l.table_name === layer)
    : (layers.find((l) => /^SAL_2021/i.test(l.table_name)) ??
      layers.find((l) => /SAL/i.test(l.table_name)));
  if (!chosen) {
    throw new Error(
      `no SAL layer in ${file}; layers: ${layers.map((l) => l.table_name).join(', ')}`,
    );
  }
  const t = chosen.table_name;
  const g = chosen.column_name;
  const cols = (db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map(
    (c) => c.name,
  );
  const col = (re: RegExp) => {
    const c = cols.find((n) => re.test(n));
    if (!c) throw new Error(`column ${re} not found in ${t} (${cols.join(', ')})`);
    return `"${c}"`;
  };
  const codeCol = col(/^sal_code_2021$/i);
  const nameCol = col(/^sal_name_2021$/i);
  const stateCol = col(/^(state|ste)_name_2021$/i);
  const rtree = `rtree_${t}_${g}`;
  const hasRtree = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(rtree);
  if (!hasRtree) throw new Error(`${file} has no spatial index table ${rtree}`);
  const bboxQuery = db.prepare(
    `SELECT f.rowid AS rowid, ${codeCol} AS code, ${nameCol} AS name, ${stateCol} AS state, f."${g}" AS geom
       FROM "${t}" f JOIN "${rtree}" r ON f.rowid = r.id
      WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ? AND f."${g}" IS NOT NULL`,
  );
  const candidates = (lng: number, lat: number, km: number) => {
    const { dLng, dLat } = kmToDegrees(km, lat);
    return (
      bboxQuery.all(lng + dLng, lng - dLng, lat + dLat, lat - dLat) as unknown as GpkgRow[]
    ).map((r) => ({
      hit: {
        salCode: String(r.code),
        locality: String(r.name).trim(),
        state: String(r.state),
        stateCode: stateCodeFor(String(r.state)),
      } satisfies SalHit,
      rings: parseGpkgGeometry(r.geom) as Ring[],
    }));
  };
  const nearestWithin = (lng: number, lat: number, km: number) =>
    candidates(lng, lat, km)
      .map((c) => ({ ...c.hit, distanceKm: round3(distanceToRingsKm(lng, lat, c.rings)) }))
      .filter((h) => h.distanceKm <= km)
      .sort((a, b) => a.distanceKm - b.distanceKm || bySalCode(a, b))[0] ?? null;
  return {
    name: 'gpkg',
    async within(lng, lat) {
      const hits = candidates(lng, lat, 0.001)
        .filter((c) => pointInRings(lng, lat, c.rings))
        .map((c) => c.hit);
      return hits.sort(bySalCode)[0] ?? null;
    },
    async nearest(lng, lat, km) {
      return nearestWithin(lng, lat, km);
    },
    async offshoreState(lng, lat) {
      const h = nearestWithin(lng, lat, 200);
      return h
        ? {
            state: h.state,
            stateCode: h.stateCode,
            method: `state of nearest SAL (${h.distanceKm} km)`,
          }
        : null;
    },
  };
}

function readCache(id: string): SalCacheRecord | null {
  const file = join(SAL_CACHE_DIR, `${id}.json`);
  return existsSync(file) ? readJson<SalCacheRecord>(file) : null;
}

async function lookup(
  backend: Backend,
  id: string,
  lng: number,
  lat: number,
  useNearest: boolean,
  prev: SalCacheRecord | null,
): Promise<SalCacheRecord> {
  const reuse =
    prev && prev.lng === lng && prev.lat === lat && prev.source === backend.name ? prev : null;
  const rec: SalCacheRecord = reuse ?? {
    id,
    lng,
    lat,
    source: backend.name,
    retrieved: todayAu(),
    within: await backend.within(lng, lat),
  };
  if (!rec.within && useNearest && rec.nearest === undefined) {
    rec.nearest = await backend.nearest(lng, lat, NEAREST_KM);
  }
  if (!rec.within && !(useNearest && rec.nearest) && rec.offshoreState === undefined) {
    rec.offshoreState = await backend.offshoreState(lng, lat);
  }
  return rec;
}

async function main() {
  const { values } = parseArgs({
    options: {
      nearest: { type: 'boolean', default: false },
      gpkg: { type: 'string' },
      layer: { type: 'string' },
      refresh: { type: 'boolean', default: false },
      only: { type: 'string' },
      concurrency: { type: 'string', default: String(MAX_CONCURRENCY) },
    },
  });
  const snap = newestSnapshot();
  if (!snap) throw new Error('no data/raw snapshot; run node scripts/fetch-austlang.ts first');
  const fc: unknown = JSON.parse(readFileSync(snap.file, 'utf8'));
  assertAustlangCollection(fc);
  const { nations } = extractNations(fc, readJson<CleaningPolicy>(CLEANING_FILE));
  const only = values.only ? new Set(values.only.split(',')) : null;
  const todo = nations.filter((n) => !only || only.has(n.id));

  const backend = values.gpkg ? gpkgBackend(values.gpkg, values.layer) : arcgisBackend();
  const concurrency = values.gpkg
    ? 1
    : Math.min(MAX_CONCURRENCY, Math.max(1, Number(values.concurrency)));
  const t0 = performance.now();
  let fetched = 0;
  let cached = 0;
  const failures: string[] = [];

  await mapPool(todo, concurrency, async (n) => {
    const prev = values.refresh ? null : readCache(n.id);
    if (cacheUsable(prev, n.lng, n.lat, values.nearest)) {
      cached++;
      return;
    }
    try {
      const rec = await lookup(backend, n.id, n.lng, n.lat, values.nearest, prev);
      await writeJsonFormatted(join(SAL_CACHE_DIR, `${n.id}.json`), rec);
      fetched++;
      const r = resolveSal(rec, values.nearest);
      if (!r) failures.push(`${n.id} ${n.name}: no SAL and no state found`);
      else if (r.method !== 'within') {
        console.log(
          `[abs] ${n.id} ${n.name}: ${r.method} → ${r.locality}, ${r.state}` +
            (r.distanceKm !== undefined ? ` (${r.distanceKm} km)` : ''),
        );
      }
    } catch (err) {
      failures.push(`${n.id} ${n.name}: ${(err as Error).message}`);
    }
    const done = fetched + cached + failures.length;
    if (done % 50 === 0) console.log(`[abs] ${done}/${todo.length}`);
  });

  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[abs] ${todo.length} nations: ${fetched} looked up (${backend.name}), ${cached} from cache, ` +
      `${failures.length} failed, ${secs} s`,
  );
  if (failures.length) {
    console.error(failures.map((f) => `  ✗ ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

await main();
