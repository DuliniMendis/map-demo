/** A ring is a closed or open list of [lng, lat] positions. Polygons and multipolygons are flattened to rings. */
export type Ring = readonly (readonly number[])[];

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

export function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Even-odd point-in-polygon over all rings. Works for polygons with holes and for multipolygons
 * flattened to rings (Esri JSON `rings` and GeoPackage WKB both reduce to this).
 */
export function pointInRings(lng: number, lat: number, rings: readonly Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance in km from a point to the nearest edge of the rings (0 if inside). Uses a local
 * equirectangular projection around the point, which is accurate to well under 1% at the
 * ≤ 300 km ranges we use it for.
 */
export function distanceToRingsKm(lng: number, lat: number, rings: readonly Ring[]): number {
  if (pointInRings(lng, lat, rings)) return 0;
  const kx = Math.cos(lat * RAD) * EARTH_RADIUS_KM * RAD;
  const ky = EARTH_RADIUS_KM * RAD;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ax = (a[0] - lng) * kx;
      const ay = (a[1] - lat) * ky;
      const bx = (b[0] - lng) * kx;
      const by = (b[1] - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

export type Bounds = readonly [readonly [number, number], readonly [number, number]];

/**
 * Copy of `AUSTRALIA_BOUNDS` from src/map/style/ids.ts (WS1 owns that file, which may grow browser
 * imports). tests/unit/nations-data.test.ts asserts the two stay equal.
 */
export const AUSTRALIA_BOUNDS: Bounds = [
  [112.5, -44.5],
  [154.5, -9.5],
];

export const inBounds = (lng: number, lat: number, [[w, s], [e, n]]: Bounds): boolean =>
  lng >= w && lng <= e && lat >= s && lat <= n;

/** Degrees of longitude/latitude that cover `km` around `lat` (for bbox prefilters). */
export function kmToDegrees(km: number, lat: number): { dLng: number; dLat: number } {
  const dLat = km / (EARTH_RADIUS_KM * RAD);
  return { dLat, dLng: dLat / Math.max(0.01, Math.cos(lat * RAD)) };
}
