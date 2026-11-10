// Time-of-day light (WS7). The store's `sunHour` (local solar time, 5–19) puts the hillshade light
// where the sun would be at that hour over the place you're looking at; `null` is today's fixed
// cartographic light (315°, viewport-anchored), unchanged.
//
// MapLibre 6.17's `standard` hillshade (ours) ignores `hillshade-illumination-altitude`: only the
// basic/combined/multidirectional methods read it, and switching method would change the default
// look. So the sun's altitude is expressed through the paint we can change: a low sun gets stronger
// relief (longer shadows), a warmer highlight and cooler shadows; a high sun flattens the relief.
import type { Map as MlMap } from 'maplibre-gl';
import { LAYER_HILLSHADE } from './ids';
import {
  HILLSHADE_DEFAULT_LIGHT,
  hillshadeExaggeration,
  hillshadeHighlight,
} from './layers/hillshade';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Degrees clockwise from true north, 0–360. */
  azimuthDeg: number;
  /** Degrees above the horizon (negative below), with standard atmospheric refraction. */
  altitudeDeg: number;
}

interface SolarTerms {
  declinationRad: number;
  /** Equation of time, minutes (apparent minus mean solar time). */
  eqTimeMin: number;
}

/** NOAA solar terms (Meeus, "Astronomical Algorithms" ch. 25, as in NOAA's solar calculator). */
function solarTerms(utcMs: number): SolarTerms {
  const jd = utcMs / 86_400_000 + 2_440_587.5;
  const t = (jd - 2_451_545) / 36_525;
  const l0 = (((280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declinationRad = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTimeMin =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { declinationRad, eqTimeMin };
}

/** Bennett-style refraction as used by NOAA, degrees, for a geometric elevation in degrees. */
function refraction(elevDeg: number): number {
  if (elevDeg > 85) return 0;
  const te = Math.tan(elevDeg * RAD);
  let arcsec: number;
  if (elevDeg > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elevDeg > -0.575)
    arcsec = 1735 + elevDeg * (-518.2 + elevDeg * (103.4 + elevDeg * (-12.79 + elevDeg * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

function position(latDeg: number, hourAngleDeg: number, declinationRad: number): SunPosition {
  const lat = latDeg * RAD;
  const h = hourAngleDeg * RAD;
  const sinAlt =
    Math.sin(lat) * Math.sin(declinationRad) +
    Math.cos(lat) * Math.cos(declinationRad) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
  const az =
    Math.atan2(
      Math.sin(h),
      Math.cos(h) * Math.sin(lat) - Math.tan(declinationRad) * Math.cos(lat),
    ) *
      DEG +
    180;
  return { azimuthDeg: ((az % 360) + 360) % 360, altitudeDeg: alt + refraction(alt) };
}

/** Sun position at an instant (NOAA). Used to check the formulas against published values. */
export function sunPositionAt(lat: number, lng: number, when: Date): SunPosition {
  const ms = when.getTime();
  const { declinationRad, eqTimeMin } = solarTerms(ms);
  const utcMin = (((ms / 60_000) % 1440) + 1440) % 1440;
  const trueSolarMin = (((utcMin + eqTimeMin + 4 * lng) % 1440) + 1440) % 1440;
  return position(lat, trueSolarMin / 4 - 180, declinationRad);
}

/**
 * Sun position at local **apparent** solar time `hour` (12 = the sun due north/south, highest) on
 * the calendar day of `date` (its UTC year/month/day). Longitude only nudges the declination
 * through the instant it implies; the hour angle comes straight from `hour`.
 */
export function sunPosition(lat: number, lng: number, date: Date, hour: number): SunPosition {
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const approxUtcMs = midnightUtc + (hour - lng / 15) * 3_600_000;
  const { declinationRad } = solarTerms(approxUtcMs);
  return position(lat, 15 * (hour - 12), declinationRad);
}

/** Today's calendar date in Australia (eastern time, where most people are), as a UTC-midnight Date. */
export function todayInAustralia(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

/** "7:30 am", "12:00 pm", "6:45 pm" for a fractional hour. */
export function formatSunHour(hour: number): string {
  const totalMin = Math.round(hour * 60);
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

// ---- sun → hillshade paint ----

export interface HillshadeLight {
  'hillshade-illumination-direction': number;
  'hillshade-illumination-anchor': 'map' | 'viewport';
  'hillshade-exaggeration': number;
  'hillshade-highlight-color': string;
  'hillshade-shadow-color': string;
}

type Rgba = [number, number, number, number];

function parseColor(c: string): Rgba {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = c.match(/[\d.]+/g)!.map(Number);
  return [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
}

function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const [r, g, bl] = [0, 1, 2].map((i) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * t));
  const al = Math.round((ca[3] + (cb[3] - ca[3]) * t) * 100) / 100;
  return `rgba(${r}, ${g}, ${bl}, ${al})`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Golden-hour tones the light leans towards as the sun drops. */
export const LOW_SUN = { highlight: '#ffc27a', shadow: '#2b1d2e' } as const;

/** The exact paint `buildStyle` uses today (the fixed default light). */
export function defaultLight(imagery: boolean): HillshadeLight {
  return {
    'hillshade-illumination-direction': HILLSHADE_DEFAULT_LIGHT.direction,
    'hillshade-illumination-anchor': HILLSHADE_DEFAULT_LIGHT.anchor,
    'hillshade-exaggeration': hillshadeExaggeration(imagery),
    'hillshade-highlight-color': hillshadeHighlight(imagery),
    'hillshade-shadow-color': HILLSHADE_DEFAULT_LIGHT.shadow,
  };
}

/**
 * Hillshade paint for a sun position. Light comes from the sun's azimuth, anchored to the map (so
 * it stays put as the camera turns). `low` = 1 at the horizon, 0 from 45° up: warmer highlight,
 * cooler shadow, stronger relief. Above 45° the relief flattens towards 0.75× of the default.
 */
export function sunLight(sun: SunPosition, imagery: boolean): HillshadeLight {
  const base = defaultLight(imagery);
  const alt = Math.max(0, sun.altitudeDeg);
  const low = clamp01(1 - alt / 45);
  const high = clamp01((alt - 45) / 40);
  const strength = 1 + 0.5 * low - 0.25 * high;
  const highlightTarget = imagery ? 'rgba(255, 194, 122, 0.5)' : LOW_SUN.highlight;
  let direction = round(sun.azimuthDeg, 0.5);
  if (direction >= 360) direction -= 360;
  return {
    'hillshade-illumination-direction': direction,
    'hillshade-illumination-anchor': 'map',
    'hillshade-exaggeration': Math.min(1, round(base['hillshade-exaggeration'] * strength, 0.01)),
    'hillshade-highlight-color': mix(base['hillshade-highlight-color'], highlightTarget, low),
    'hillshade-shadow-color': mix(base['hillshade-shadow-color'], LOW_SUN.shadow, low * 0.8),
  };
}

// ---- where the sun is computed for ----

export interface LngLat {
  lng: number;
  lat: number;
}

let locationHint: LngLat | null = null;

/**
 * Where the next sun-hour change should be computed for: the selected nation's point, or null for
 * "the map centre right now". The slider (LayerControls) sets it just before `setSunHour`.
 */
export function setSunLocationHint(p: LngLat | null): void {
  locationHint = p ? { lng: p.lng, lat: p.lat } : null;
}

interface LightState {
  hour: number | null;
  imagery: boolean;
  at: LngLat | null;
}
const lightStates = new WeakMap<MlMap, LightState>();

type PaintProp = Parameters<MlMap['setPaintProperty']>[1];

/**
 * Apply `sunHour` (and the imagery-dependent hillshade strength) to the hillshade layer. The place
 * is fixed when the hour changes — the hint, else the map centre — and not re-computed on pan.
 */
export function applyLighting(
  map: MlMap,
  o: { sunHour: number | null; imagery: boolean },
  today: () => Date = todayInAustralia,
): void {
  if (!map.getLayer(LAYER_HILLSHADE)) return;
  const prev = lightStates.get(map);
  let at = prev?.at ?? null;
  if (o.sunHour !== null && (prev?.hour !== o.sunHour || at === null)) {
    if (locationHint) at = { ...locationHint };
    else {
      const c = map.getCenter();
      at = { lng: c.lng, lat: c.lat };
    }
  }
  lightStates.set(map, { hour: o.sunHour, imagery: o.imagery, at });

  const paint =
    o.sunHour === null || at === null
      ? defaultLight(o.imagery)
      : sunLight(sunPosition(at.lat, at.lng, today(), o.sunHour), o.imagery);
  for (const [prop, value] of Object.entries(paint) as [PaintProp, string | number][]) {
    if (map.getPaintProperty(LAYER_HILLSHADE, prop) !== value) {
      map.setPaintProperty(LAYER_HILLSHADE, prop, value);
    }
  }
}
