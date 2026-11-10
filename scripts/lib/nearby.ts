/**
 * Pure helpers for the "nearby town and landmark" lookup (WS8): great-circle distance, 8-point
 * bearing, point-to-polyline distance and a bounding-box prefiltered nearest search. The OSM
 * extract itself is fetched and trimmed by scripts/nearby.ts.
 */
import { createHash } from 'node:crypto';
import type { NearbyFeature } from '../../src/types/nation.ts';
import { haversineKm, kmToDegrees } from './geo.ts';

export type NearbyKind = NearbyFeature['kind'];
export type Compass8 = NearbyFeature['bearing'];

/** Cut-offs from the WS8 brief (inclusive). */
export const TOWN_MAX_KM = 100;
export const LANDMARK_MAX_KM = 50;

/** One OSM feature as stored in the trimmed snapshot (data/cache/osm/*.json). */
export interface OsmPoint {
  /** OSM element, e.g. "n123", "w456", "r789" (for traceability; not shipped to the app). */
  osm: string;
  name: string;
  kind: NearbyKind;
  /** [lng, lat]: the node, or Overpass `out center` for ways/relations. */
  at: readonly [number, number];
}
export interface OsmLine {
  osm: string;
  name: string;
  kind: NearbyKind;
  /** One or more polylines of [lng, lat]. */
  lines: readonly (readonly (readonly [number, number])[])[];
}
export type OsmFeature = OsmPoint | OsmLine;

const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371.0088;

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north, [0, 360). */
export function initialBearingDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const φ1 = lat1 * RAD;
  const φ2 = lat2 * RAD;
  const Δλ = (lng2 - lng1) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = Math.atan2(y, x) / RAD;
  return (deg + 360) % 360;
}

const COMPASS: readonly Compass8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** 8-point compass sector for a bearing in degrees (N = 337.5–22.5, NE = 22.5–67.5, …). */
export function compass8(deg: number): Compass8 {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.floor((d + 22.5) / 45) % 8];
}

/** Rounds to 1 decimal place, as `NearbyFeature.distanceKm` requires. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Nearest point on a set of polylines to (lng, lat), using a local equirectangular projection
 * around the query point (accurate to well under 1 % at ≤ 100 km). Returns the point and its
 * great-circle distance.
 */
export function nearestOnLines(
  lng: number,
  lat: number,
  lines: OsmLine['lines'],
): { lng: number; lat: number; km: number } | null {
  const kx = Math.cos(lat * RAD) * EARTH_RADIUS_KM * RAD;
  const ky = EARTH_RADIUS_KM * RAD;
  let best: { x: number; y: number; d2: number } | null = null;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[Math.min(i + 1, line.length - 1)];
      const ax = (a[0] - lng) * kx;
      const ay = (a[1] - lat) * ky;
      const dx = (b[0] - lng) * kx - ax;
      const dy = (b[1] - lat) * ky - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const x = ax + t * dx;
      const y = ay + t * dy;
      const d2 = x * x + y * y;
      if (!best || d2 < best.d2) best = { x, y, d2 };
    }
  }
  if (!best) return null;
  const pLng = lng + best.x / kx;
  const pLat = lat + best.y / ky;
  return { lng: pLng, lat: pLat, km: haversineKm(lng, lat, pLng, pLat) };
}

/** Distance in km from a point to a polyline set (convenience wrapper for tests and reports). */
export const pointToLinesKm = (lng: number, lat: number, lines: OsmLine['lines']): number =>
  nearestOnLines(lng, lat, lines)?.km ?? Infinity;

const isLine = (f: OsmFeature): f is OsmLine => 'lines' in f;

interface Indexed {
  f: OsmFeature;
  /** [west, south, east, north] */
  bbox: readonly [number, number, number, number];
}

/** A feature list with precomputed bounding boxes, so each nation only measures nearby features. */
export interface FeatureIndex {
  items: readonly Indexed[];
}

export function indexFeatures(features: readonly OsmFeature[]): FeatureIndex {
  return {
    items: features.map((f) => {
      if (!isLine(f)) return { f, bbox: [f.at[0], f.at[1], f.at[0], f.at[1]] as const };
      let w = Infinity;
      let s = Infinity;
      let e = -Infinity;
      let n = -Infinity;
      for (const line of f.lines) {
        for (const [x, y] of line) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < s) s = y;
          if (y > n) n = y;
        }
      }
      return { f, bbox: [w, s, e, n] as const };
    }),
  };
}

export interface NearestHit {
  feature: OsmFeature;
  /** The measured point: the node / centre, or the nearest point on the line. */
  to: { lng: number; lat: number };
  km: number;
}

/**
 * The feature nearest to (lng, lat) within `maxKm` (inclusive), or null. Ties (equal distance to
 * the metre) break on name, then OSM id, so the result is deterministic.
 */
export function nearestFeature(
  lng: number,
  lat: number,
  index: FeatureIndex,
  maxKm: number,
): NearestHit | null {
  // Pad the box a little: kmToDegrees uses the query latitude, and boxes are compared loosely.
  const { dLng, dLat } = kmToDegrees(maxKm * 1.02, lat);
  let best: NearestHit | null = null;
  for (const { f, bbox } of index.items) {
    if (
      bbox[0] > lng + dLng ||
      bbox[2] < lng - dLng ||
      bbox[1] > lat + dLat ||
      bbox[3] < lat - dLat
    )
      continue;
    let hit: NearestHit | null;
    if (isLine(f)) {
      const p = nearestOnLines(lng, lat, f.lines);
      hit = p ? { feature: f, to: { lng: p.lng, lat: p.lat }, km: p.km } : null;
    } else {
      hit = {
        feature: f,
        to: { lng: f.at[0], lat: f.at[1] },
        km: haversineKm(lng, lat, f.at[0], f.at[1]),
      };
    }
    if (!hit || hit.km > maxKm) continue;
    if (
      !best ||
      Math.round(hit.km * 1000) < Math.round(best.km * 1000) ||
      (Math.round(hit.km * 1000) === Math.round(best.km * 1000) &&
        (hit.feature.name.localeCompare(best.feature.name, 'en-AU') ||
          hit.feature.osm.localeCompare(best.feature.osm)) < 0)
    ) {
      best = hit;
    }
  }
  return best;
}

/**
 * Keeps only features within `maxKm` of at least one of `points` (input order kept). Used to trim
 * the committed snapshot to the features any nation could be matched with.
 */
export function clipToPoints(
  features: readonly OsmFeature[],
  points: readonly (readonly [number, number])[],
  maxKm: number,
): OsmFeature[] {
  const { items } = indexFeatures(features);
  const keep = new Set<OsmFeature>();
  for (const [lng, lat] of points) {
    const { dLng, dLat } = kmToDegrees(maxKm * 1.02, lat);
    for (const { f, bbox } of items) {
      if (keep.has(f)) continue;
      if (
        bbox[0] > lng + dLng ||
        bbox[2] < lng - dLng ||
        bbox[1] > lat + dLat ||
        bbox[3] < lat - dLat
      )
        continue;
      const km = isLine(f)
        ? (nearestOnLines(lng, lat, f.lines)?.km ?? Infinity)
        : haversineKm(lng, lat, f.at[0], f.at[1]);
      if (km <= maxKm) keep.add(f);
    }
  }
  return features.filter((f) => keep.has(f));
}

/** Order-independent key for a point set (which nation points a clipped snapshot covers). */
export function pointsKey(points: readonly (readonly [number, number])[]): string {
  const s = points.map(([x, y]) => `${x},${y}`).sort();
  return `${s.length}:${createHash('sha256').update(s.join(';')).digest('hex').slice(0, 16)}`;
}

/** Converts a hit to the shipped `NearbyFeature` (name as published, 1-dp km, 8-point bearing). */
export function toNearby(lng: number, lat: number, hit: NearestHit): NearbyFeature {
  return {
    name: hit.feature.name,
    kind: hit.feature.kind,
    distanceKm: round1(hit.km),
    bearing: compass8(initialBearingDeg(lng, lat, hit.to.lng, hit.to.lat)),
  };
}

export interface NearbyResult {
  town?: NearbyFeature;
  landmark?: NearbyFeature;
  /** OSM element ids of the chosen features (cache/report only). */
  osm?: { town?: string; landmark?: string };
}

/**
 * Nearest town (≤ 100 km; `towns` indexes cities, towns and villages together, so the nearest
 * wins whatever its class) and nearest landmark (≤ 50 km) for one point.
 */
export function nearbyFor(
  lng: number,
  lat: number,
  towns: FeatureIndex,
  landmarks: FeatureIndex,
): NearbyResult {
  const t = nearestFeature(lng, lat, towns, TOWN_MAX_KM);
  const l = nearestFeature(lng, lat, landmarks, LANDMARK_MAX_KM);
  const out: NearbyResult = {};
  if (t) out.town = toNearby(lng, lat, t);
  if (l) out.landmark = toNearby(lng, lat, l);
  if (t || l) {
    out.osm = {
      ...(t ? { town: t.feature.osm } : {}),
      ...(l ? { landmark: l.feature.osm } : {}),
    };
  }
  return out;
}

/** Douglas–Peucker simplification in a local projection; `tolKm` is the max deviation kept. */
export function simplifyLine(
  line: readonly (readonly [number, number])[],
  tolKm: number,
): [number, number][] {
  if (line.length <= 2) return line.map((p) => [p[0], p[1]]);
  const lat0 = line[0][1];
  const kx = Math.cos(lat0 * RAD) * EARTH_RADIUS_KM * RAD;
  const ky = EARTH_RADIUS_KM * RAD;
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  const tol2 = tolKm * tolKm;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = line[i0][0] * kx;
    const ay = line[i0][1] * ky;
    const dx = line[i1][0] * kx - ax;
    const dy = line[i1][1] * ky - ay;
    const len2 = dx * dx + dy * dy;
    let maxD2 = -1;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const px = line[i][0] * kx - ax;
      const py = line[i][1] * ky - ay;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const ex = px - t * dx;
      const ey = py - t * dy;
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD2) {
        maxD2 = d2;
        idx = i;
      }
    }
    if (idx >= 0 && maxD2 > tol2) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return line.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
}

/**
 * Google "encoded polyline" (precision 5 ≈ 1 m), used to keep river geometry in the committed
 * snapshot compact and on one line per feature. Coordinates are [lng, lat]; the encoding itself
 * stores lat first, as the algorithm specifies.
 */
export function encodePolyline(line: readonly (readonly [number, number])[]): string {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of line) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    enc(iLat - pLat);
    enc(iLng - pLng);
    pLat = iLat;
    pLng = iLng;
  }
  return out;
}

export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const dec = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += dec();
    lng += dec();
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

/** Feature as committed in data/cache/osm/<class>.json: points inline, lines polyline-encoded. */
export type StoredFeature =
  | { osm: string; name: string; kind: NearbyKind; at: [number, number] }
  | { osm: string; name: string; kind: NearbyKind; lines: string[] };

export const toStored = (f: OsmFeature): StoredFeature =>
  isLine(f)
    ? { osm: f.osm, name: f.name, kind: f.kind, lines: f.lines.map(encodePolyline) }
    : { osm: f.osm, name: f.name, kind: f.kind, at: [f.at[0], f.at[1]] };

export const fromStored = (f: StoredFeature): OsmFeature =>
  'lines' in f ? { ...f, lines: f.lines.map(decodePolyline) } : f;
