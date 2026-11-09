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
 * `maxBounds` for the map. Generous on purpose: MapLibre keeps the whole viewport inside
 * maxBounds, so tight bounds would force a zoom-in on wide screens at the overview, and pitched
 * views near the coast need sea room. 20° E–W keeps the 3.7 overview reachable up to ~1500 px wide.
 */
export const MAX_BOUNDS: Bounds = padBounds(AUSTRALIA_BOUNDS, 20, 10);

/** True when the browser can create a WebGL context (MapLibre needs one). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
