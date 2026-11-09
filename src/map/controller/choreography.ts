// Pure camera choreography (PLAN.md §6, docs/workstreams/WS2-camera-markers.md).
// No MapLibre import: everything here is plain data so it can be unit-tested in node.

import type { Nation } from '../../types/nation';
import { OVERVIEW_CAMERA } from '../style/ids';

export type LngLatTuple = [number, number];

/** Where the camera is now, as read from the map. */
export interface CameraPose {
  center: LngLatTuple;
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Map canvas size in CSS pixels; the flyTo duration depends on it (see `flyToDurationMs`). */
export interface Viewport {
  width: number;
  height: number;
}

interface StepBase {
  zoom: number;
  pitch: number;
  bearing: number;
  /** Milliseconds. Always explicit so the controller can tell a finished step from an interrupted one. */
  duration: number;
}

/** Straight ease. Without `center` the camera rises in place. */
export interface EaseToStep extends StepBase {
  type: 'easeTo';
  center?: LngLatTuple;
}

/**
 * Van Wijk "optimal path" flight. `speed`/`curve` are the PLAN.md §6 values; `duration` is what that speed takes
 * along this path, clamped to the flight budget, and is what MapLibre actually uses.
 */
export interface FlyToStep extends StepBase {
  type: 'flyTo';
  center: LngLatTuple;
  speed: number;
  curve: number;
  essential: true;
}

/** Reduced motion: an instant cut, masked by a short fade of the canvas. */
export interface JumpToStep {
  type: 'jumpTo';
  center: LngLatTuple;
  zoom: number;
  pitch: number;
  bearing: number;
  /** Total fade (out + in) in milliseconds. */
  fadeMs: number;
}

export type FlightStep = EaseToStep | FlyToStep | JumpToStep;

export interface PlanOptions {
  viewport?: Viewport;
}

// --- tuning ---------------------------------------------------------------------------------------

export const DEFAULT_VIEW = { zoom: 10.5, pitch: 62, bearing: -18 } as const;
export const ZOOM_RANGE = { min: 8, max: 13 } as const;
export const PITCH_RANGE = { min: 0, max: 75 } as const;

/** Rise step: zoom out by this much, but never below RISE_MIN_ZOOM. */
export const RISE_ZOOM_DELTA = 5;
export const RISE_MIN_ZOOM = 4.2;
export const RISE_DURATION_MS = 900;
/** Skip the rise when the camera is already this close to the rise pose (zoomed out and flat). */
const RISE_SKIP_ZOOM_EPS = 0.5;
const RISE_SKIP_PITCH_EPS = 5;

export const FLY_SPEED = 0.6;
export const FLY_CURVE = 1.42;

/** Below this great-circle distance the camera glides across instead of rising. */
export const NEAR_DISTANCE_KM = 150;
/**
 * Glide duration, linear in distance: 1.5 s for a hop of ~0 km (real data has points ~1 km apart) up to 3.2 s at
 * 150 km. Short hops go below the 2.5 s flight floor on purpose: a 2.5 s glide across 1 km feels stuck.
 */
export const NEAR_EASE_MIN_MS = 1500;
export const NEAR_EASE_MAX_MS = 3200;
/** Closer than this (and at the target zoom/bearing) counts as already there: no steps. */
const ARRIVED_KM = 0.05;
const ARRIVED_ZOOM_EPS = 0.05;
const ARRIVED_BEARING_EPS = 1;

/** docs/contracts.md: flight total 2.5–4.5 s. We aim inside that with a little headroom. */
export const FLIGHT_MIN_MS = 2500;
export const FLIGHT_MAX_MS = 4200;

/** docs/contracts.md: reduced motion ≤ 0.4 s. */
export const REDUCED_MOTION_FADE_MS = 300;

/** Overview return (`flyToOverview`). */
export const OVERVIEW_MIN_MS = 1500;
export const OVERVIEW_MAX_MS = 3500;

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

/** The national overview as a pose (OVERVIEW_CAMERA from WS1's ids.ts). Also the `from = null` start. */
export const OVERVIEW_POSE: CameraPose = {
  center: [OVERVIEW_CAMERA.center[0], OVERVIEW_CAMERA.center[1]],
  zoom: OVERVIEW_CAMERA.zoom,
  pitch: OVERVIEW_CAMERA.pitch,
  bearing: OVERVIEW_CAMERA.bearing,
};

const EARTH_RADIUS_KM = 6371.0088;
/** MapLibre's world is 512 px wide at zoom 0. */
const TILE_SIZE = 512;

// --- helpers --------------------------------------------------------------------------------------

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function finiteOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Wraps a bearing into (−180, 180]. */
export function normalizeBearing(b: number): number {
  const w = ((((b + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** Haversine great-circle distance in kilometres. */
export function greatCircleKm(a: LngLatTuple, b: LngLatTuple): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The camera the nation should end on: its `view` overrides over the defaults, clamped. */
export function targetPose(to: Nation): CameraPose {
  const v = to.view ?? {};
  return {
    center: [to.lng, to.lat],
    zoom: clamp(finiteOr(v.zoom, DEFAULT_VIEW.zoom), ZOOM_RANGE.min, ZOOM_RANGE.max),
    pitch: clamp(finiteOr(v.pitch, DEFAULT_VIEW.pitch), PITCH_RANGE.min, PITCH_RANGE.max),
    bearing: normalizeBearing(finiteOr(v.bearing, DEFAULT_VIEW.bearing)),
  };
}

function mercatorPx(c: LngLatTuple, worldSize: number): [number, number] {
  const lat = clamp(c[1], -85.051129, 85.051129);
  const x = ((c[0] + 180) / 360) * worldSize;
  const y =
    ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360) *
    worldSize;
  return [x, y];
}

/**
 * Natural duration of `map.flyTo` from `from` to `to` at `speed`/`curve`, i.e. what MapLibre 6.17 computes when no
 * `duration` is given (ui/camera.ts flyTo: van Wijk & Nuij 2003, S / V seconds). Mercator, no padding/offset.
 */
export function flyToDurationMs(
  from: Pick<CameraPose, 'center' | 'zoom'>,
  to: Pick<CameraPose, 'center' | 'zoom'>,
  viewport: Viewport = DEFAULT_VIEWPORT,
  speed = FLY_SPEED,
  curve = FLY_CURVE,
): number {
  const worldSize = TILE_SIZE * 2 ** from.zoom;
  const [x0, y0] = mercatorPx(from.center, worldSize);
  const [x1, y1] = mercatorPx(to.center, worldSize);
  const u1 = Math.hypot(x1 - x0, y1 - y0);
  const w0 = Math.max(viewport.width, viewport.height);
  const w1 = w0 / 2 ** (to.zoom - from.zoom);
  const rho = curve;
  const rho2 = rho * rho;
  const r = (descent: boolean) => {
    const b =
      (w1 * w1 - w0 * w0 + (descent ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (descent ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  let S = (r(true) - r(false)) / rho;
  if (Math.abs(u1) < 0.000002 || !Number.isFinite(S)) {
    S = Math.abs(Math.log(w1 / w0)) / rho;
  }
  return (1000 * S) / speed;
}

function flyStep(
  from: Pick<CameraPose, 'center' | 'zoom'>,
  to: CameraPose,
  viewport: Viewport,
  minMs: number,
  maxMs: number,
): FlyToStep {
  const natural = flyToDurationMs(from, to, viewport);
  return {
    type: 'flyTo',
    center: to.center,
    zoom: to.zoom,
    pitch: to.pitch,
    bearing: to.bearing,
    speed: FLY_SPEED,
    curve: FLY_CURVE,
    essential: true,
    duration: Math.round(clamp(natural, minMs, maxMs)),
  };
}

// --- plans ----------------------------------------------------------------------------------------

/**
 * The steps that take the camera from `from` to nation `to`.
 *
 * - reducedMotion → one `jumpTo` (with a fade), whatever `from` is.
 * - `from` null (national overview, first selection) → one `flyTo`.
 * - `from` already at `to` (centre, zoom and bearing) → no steps.
 * - `from` within NEAR_DISTANCE_KM of `to` → one `easeTo` that keeps the current pitch (a glide, no rise).
 * - otherwise → `easeTo` rise (zoom − 5, ≥ 4.2, flat, north up, 900 ms) then `flyTo`. When the camera is already
 *   at or above the rise pose the rise is skipped.
 *
 * Durations: flyTo uses speed 0.6 / curve 1.42 along the van Wijk path, clamped so the whole flight lands in
 * FLIGHT_MIN_MS..FLIGHT_MAX_MS (docs/contracts.md budget 2.5–4.5 s).
 */
export function planFlight(
  from: CameraPose | null,
  to: Nation,
  reducedMotion: boolean,
  opts: PlanOptions = {},
): FlightStep[] {
  const target = targetPose(to);
  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;

  if (reducedMotion) {
    return [{ type: 'jumpTo', ...target, fadeMs: REDUCED_MOTION_FADE_MS }];
  }

  if (from === null) {
    return [flyStep(OVERVIEW_POSE, target, viewport, FLIGHT_MIN_MS, FLIGHT_MAX_MS)];
  }

  const km = greatCircleKm(from.center, target.center);
  if (
    km < ARRIVED_KM &&
    Math.abs(from.zoom - target.zoom) < ARRIVED_ZOOM_EPS &&
    Math.abs(normalizeBearing(from.bearing - target.bearing)) < ARRIVED_BEARING_EPS
  ) {
    return []; // already there (re-selecting the focused nation)
  }
  if (km < NEAR_DISTANCE_KM) {
    const duration =
      NEAR_EASE_MIN_MS + (NEAR_EASE_MAX_MS - NEAR_EASE_MIN_MS) * (km / NEAR_DISTANCE_KM);
    return [
      {
        type: 'easeTo',
        center: target.center,
        zoom: target.zoom,
        pitch: clamp(from.pitch, PITCH_RANGE.min, PITCH_RANGE.max),
        bearing: target.bearing,
        duration: Math.round(duration),
      },
    ];
  }

  const riseZoom = Math.min(from.zoom, Math.max(RISE_MIN_ZOOM, from.zoom - RISE_ZOOM_DELTA));
  const alreadyUp =
    from.zoom - riseZoom < RISE_SKIP_ZOOM_EPS && Math.abs(from.pitch) < RISE_SKIP_PITCH_EPS;
  if (alreadyUp) {
    return [flyStep(from, target, viewport, FLIGHT_MIN_MS, FLIGHT_MAX_MS)];
  }

  return [
    { type: 'easeTo', zoom: riseZoom, pitch: 0, bearing: 0, duration: RISE_DURATION_MS },
    flyStep(
      { center: from.center, zoom: riseZoom },
      target,
      viewport,
      FLIGHT_MIN_MS - RISE_DURATION_MS,
      FLIGHT_MAX_MS - RISE_DURATION_MS,
    ),
  ];
}

/** Steps back to the national overview (`flyToOverview`). */
export function planOverview(
  from: CameraPose,
  reducedMotion: boolean,
  opts: PlanOptions = {},
): FlightStep[] {
  const target = OVERVIEW_POSE;
  if (reducedMotion) {
    return [{ type: 'jumpTo', ...target, fadeMs: REDUCED_MOTION_FADE_MS }];
  }
  return [
    flyStep(from, target, opts.viewport ?? DEFAULT_VIEWPORT, OVERVIEW_MIN_MS, OVERVIEW_MAX_MS),
  ];
}

/** Sum of step durations, for logging and tests. */
export function plannedDurationMs(steps: readonly FlightStep[]): number {
  return steps.reduce((t, s) => t + (s.type === 'jumpTo' ? s.fadeMs : s.duration), 0);
}
