import { describe, expect, it } from 'vitest';
import { buildStyle, DEFAULT_STYLE_OPTIONS } from './buildStyle';
import { LAYER_HILLSHADE } from './ids';
import {
  defaultLight,
  formatSunHour,
  sunLight,
  sunPosition,
  sunPositionAt,
  todayInAustralia,
} from './lighting';

describe('sunPositionAt (NOAA formulas)', () => {
  // Reference values from suncalc 1.9.0 (geometric altitude; ours adds refraction, ≤ 0.06° here).
  it.each([
    [
      'Sydney, summer solstice ~1 pm AEDT',
      -33.8688,
      151.2093,
      '2026-12-21T02:00:00Z',
      351.4,
      79.46,
    ],
    ['Uluru, winter solstice ~9 am ACST', -25.345, 131.036, '2026-06-21T23:30:00Z', 53.3, 16.35],
    ['Hobart, March equinox ~5 pm AEDT', -42.8821, 147.3272, '2026-03-20T06:15:00Z', 291.95, 22.35],
    ['Darwin, 1 September 5:30 pm ACST', -12.4634, 130.8456, '2026-09-01T08:00:00Z', 282.85, 16.7],
  ])('%s', (_, lat, lng, iso, az, alt) => {
    const p = sunPositionAt(lat, lng, new Date(iso));
    expect(p.azimuthDeg).toBeCloseTo(az, 0);
    expect(Math.abs(p.azimuthDeg - az)).toBeLessThan(0.3);
    expect(Math.abs(p.altitudeDeg - alt)).toBeLessThan(0.3);
  });
});

describe('sunPosition (local apparent solar time)', () => {
  const dec21 = new Date(Date.UTC(2026, 11, 21));
  const jun21 = new Date(Date.UTC(2026, 5, 21));

  it('puts the sun due north at 12:00 in the southern subtropics, at 90° − |lat − declination|', () => {
    // Sydney: summer solstice ≈ 90 − (33.87 − 23.44) = 79.6°; winter ≈ 90 − (33.87 + 23.44) = 32.7°.
    const summer = sunPosition(-33.8688, 151.2093, dec21, 12);
    expect(summer.azimuthDeg % 360).toBeCloseTo(0, 5);
    expect(summer.altitudeDeg).toBeCloseTo(79.57, 0);
    const winter = sunPosition(-33.8688, 151.2093, jun21, 12);
    expect(winter.altitudeDeg).toBeCloseTo(32.72, 0);
  });

  it('rises in the east and sets in the west, symmetric about noon', () => {
    const am = sunPosition(-25.345, 131.036, dec21, 7);
    const pm = sunPosition(-25.345, 131.036, dec21, 17);
    expect(am.azimuthDeg).toBeGreaterThan(90); // summer: south of east in the southern hemisphere
    expect(am.azimuthDeg).toBeLessThan(135);
    // (Declination drifts a little over the ten hours between the two.)
    expect(pm.azimuthDeg).toBeCloseTo(360 - am.azimuthDeg, 1);
    expect(pm.altitudeDeg).toBeCloseTo(am.altitudeDeg, 1);
  });

  it('agrees with the instant-based formula at the matching UTC time', () => {
    // At 151.21° E, apparent noon on 21 Dec is 12:00 − 10.081 h − EoT (+1.9 min) = 01:53:13 UTC.
    // With the sun 10° from the zenith its azimuth swings ~1.4° a minute there, so check altitude
    // (flat at noon) and that the azimuth is close to due north.
    const at = sunPositionAt(-33.8688, 151.2093, new Date('2026-12-21T01:53:13Z'));
    const solar = sunPosition(-33.8688, 151.2093, new Date(Date.UTC(2026, 11, 21)), 12);
    expect(at.altitudeDeg).toBeCloseTo(solar.altitudeDeg, 1);
    expect(Math.min(at.azimuthDeg, 360 - at.azimuthDeg)).toBeLessThan(2);
  });
});

describe('todayInAustralia', () => {
  it('uses the eastern Australian calendar date', () => {
    // 20:00 UTC on 9 Nov is 07:00 on 10 Nov in Sydney.
    expect(todayInAustralia(new Date('2026-11-09T20:00:00Z')).toISOString()).toBe(
      '2026-11-10T00:00:00.000Z',
    );
  });
});

describe('formatSunHour', () => {
  it.each([
    [5, '5:00 am'],
    [7.5, '7:30 am'],
    [11.75, '11:45 am'],
    [12, '12:00 pm'],
    [14.25, '2:15 pm'],
    [19, '7:00 pm'],
  ])('%s → %s', (h, text) => expect(formatSunHour(h)).toBe(text));
});

describe('sunLight', () => {
  it('defaultLight is exactly the paint buildStyle ships', () => {
    for (const imagery of [true, false]) {
      const style = buildStyle({ ...DEFAULT_STYLE_OPTIONS, imagery });
      const paint = style.layers.find((l) => l.id === LAYER_HILLSHADE)!.paint as Record<
        string,
        unknown
      >;
      for (const [k, v] of Object.entries(defaultLight(imagery))) expect(paint[k]).toEqual(v);
    }
  });

  it('lights from the sun azimuth, map-anchored', () => {
    const l = sunLight({ azimuthDeg: 97.26, altitudeDeg: 20 }, true);
    expect(l['hillshade-illumination-direction']).toBe(97.5);
    expect(l['hillshade-illumination-anchor']).toBe('map');
    expect(sunLight({ azimuthDeg: 359.9, altitudeDeg: 20 }, true)).toMatchObject({
      'hillshade-illumination-direction': 0,
    });
  });

  it('low sun: stronger relief and warmer highlight; high sun: flatter', () => {
    const base = defaultLight(false);
    const low = sunLight({ azimuthDeg: 90, altitudeDeg: 3 }, false);
    const mid = sunLight({ azimuthDeg: 90, altitudeDeg: 45 }, false);
    const high = sunLight({ azimuthDeg: 0, altitudeDeg: 85 }, false);
    expect(low['hillshade-exaggeration']).toBeGreaterThan(base['hillshade-exaggeration']);
    expect(mid['hillshade-exaggeration']).toBeCloseTo(base['hillshade-exaggeration'], 5);
    expect(high['hillshade-exaggeration']).toBeLessThan(base['hillshade-exaggeration']);
    expect(low['hillshade-highlight-color']).not.toBe(mid['hillshade-highlight-color']);
    expect(mid['hillshade-highlight-color']).toBe('rgba(255, 244, 224, 1)'); // = #fff4e0
    // Below the horizon behaves like the horizon.
    expect(sunLight({ azimuthDeg: 90, altitudeDeg: -4 }, false)).toEqual(
      sunLight({ azimuthDeg: 90, altitudeDeg: 0 }, false),
    );
  });
});
