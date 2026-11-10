import { AUSTRALIA_BOUNDS } from '../map/style/ids';

type Bounds = [[number, number], [number, number]];

/** Pure: grow `[[w, s], [e, n]]` by `padLng`/`padLat` degrees, clamped to valid Web Mercator. */
export function padBounds(b: Bounds, padLng: number, padLat: number): Bounds {
  const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
  const clampLng = (v: number) => Math.max(-180, Math.min(180, v));
  return [
    [clampLng(b[0][0] - padLng), clampLat(b[0][1] - padLat)],
    [clampLng(b[1][0] + padLng), clampLat(b[1][1] + padLat)],
  ];
}

/**
 * The Phase 2 `maxBounds`. Generous on purpose: MapLibre keeps the whole viewport inside maxBounds,
 * so tight bounds would force a zoom-in on wide screens at the overview, and pitched views near the
 * coast need sea room.
 *
 * No longer passed to the Map (WS9): MapLibre 6.17 ignores maxBounds while it renders a globe
 * ("Globe: TODO: respect _lngRange, _latRange" in vertical_perspective_transform.ts), so the camera
 * could wander off to Africa at z 3 and then snap back hundreds of km the moment it crossed z 4 into
 * mercator. `constrainCamera` below replaces it in both projections.
 */
export const MAX_BOUNDS: Bounds = padBounds(AUSTRALIA_BOUNDS, 20, 10);

/**
 * Where the camera *centre* may go, at every zoom and in both projections: Australia plus sea room
 * for the Torres Strait, the Tasman and the Southern Ocean. A centre box (rather than a viewport box)
 * behaves the same on the globe and on the flat map, so crossing z 4 never moves the camera.
 */
export const CENTER_BOUNDS: Bounds = padBounds(AUSTRALIA_BOUNDS, 8, 5);

/** Furthest zoom-out: the whole globe with Australia on it. */
export const MIN_ZOOM = 2;
/** MapLibre's default. */
export const MAX_ZOOM = 22;

/**
 * Pure camera constraint for the Map's `transformConstrain` option: clamps the centre into
 * CENTER_BOUNDS and the zoom into MIN_ZOOM..MAX_ZOOM. (MapView wraps it to return a LngLat.)
 */
export function constrainCamera(
  lng: number,
  lat: number,
  zoom: number,
): { lng: number; lat: number; zoom: number } {
  const [[w, s], [e, n]] = CENTER_BOUNDS;
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : (lo + hi) / 2;
  return {
    lng: clamp(lng, w, e),
    lat: clamp(lat, s, n),
    zoom: Number.isFinite(zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : MIN_ZOOM,
  };
}

/** True when the browser can create a WebGL context (MapLibre needs one). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
