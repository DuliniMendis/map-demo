import { describe, expect, it } from 'vitest';
import data from '../../public/data/nations.json';
import { AUSTRALIA_BOUNDS, OVERVIEW_CAMERA } from '../map/style/ids';
import type { NationsFile } from '../types/nation';
import {
  CENTER_BOUNDS,
  constrainCamera,
  MAX_ZOOM,
  MAX_ZOOM_ANYWHERE,
  maxZoomAt,
  MIN_ZOOM,
} from './mapSetup';

describe('constrainCamera (replaces maxBounds, which the globe ignores)', () => {
  const [[w, s], [e, n]] = CENTER_BOUNDS;

  it('leaves the overview and every nation alone', () => {
    const [lng, lat] = OVERVIEW_CAMERA.center;
    expect(constrainCamera(lng, lat, OVERVIEW_CAMERA.zoom)).toEqual({
      lng,
      lat,
      zoom: OVERVIEW_CAMERA.zoom,
    });
    for (const nation of (data as NationsFile).nations) {
      const c = constrainCamera(nation.lng, nation.lat, 10.5);
      expect([c.lng, c.lat], nation.id).toEqual([nation.lng, nation.lat]);
    }
  });

  it('contains Australia with sea room', () => {
    expect(w).toBeLessThan(AUSTRALIA_BOUNDS[0][0]);
    expect(s).toBeLessThan(AUSTRALIA_BOUNDS[0][1]);
    expect(e).toBeGreaterThan(AUSTRALIA_BOUNDS[1][0]);
    expect(n).toBeGreaterThan(AUSTRALIA_BOUNDS[1][1]);
  });

  it('clamps the centre the same way at every zoom (no jump when the globe flattens at z 4)', () => {
    for (const zoom of [2.5, 3.99, 4, 4.01, 8]) {
      const c = constrainCamera(30, 0, zoom); // Africa
      expect([c.lng, c.lat]).toEqual([w, n]);
    }
    expect(constrainCamera(-170, -80, 5)).toMatchObject({ lng: w, lat: s });
  });

  it('clamps zoom and survives bad input', () => {
    expect(constrainCamera(134, -26, 0).zoom).toBe(MIN_ZOOM);
    expect(constrainCamera(134, -26, 30).zoom).toBe(MAX_ZOOM);
    expect(constrainCamera(134, -26, 16).zoom).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBeLessThan(15); // past the imagery's real detail it's only blur
    const c = constrainCamera(Number.NaN, Number.NaN, Number.NaN);
    expect(Number.isFinite(c.lng) && Number.isFinite(c.lat)).toBe(true);
    expect(c.zoom).toBe(MIN_ZOOM);
  });
});

describe('maxZoomAt', () => {
  it('lets the camera in closer only where state aerial imagery covers it', () => {
    expect(maxZoomAt(151.21, -33.86, true)).toBe(17.5); // Sydney
    expect(maxZoomAt(147.32, -42.88, true)).toBe(17.5); // Hobart
    expect(maxZoomAt(153.02, -27.47, true)).toBe(16); // Brisbane
    expect(maxZoomAt(131.03, -25.34, true)).toBe(MAX_ZOOM); // Uluru
    expect(maxZoomAt(144.96, -37.81, true)).toBe(MAX_ZOOM); // Melbourne
    expect(MAX_ZOOM_ANYWHERE).toBe(17.5);
  });

  it('falls back to MAX_ZOOM with the imagery layer off', () => {
    expect(maxZoomAt(151.21, -33.86, false)).toBe(MAX_ZOOM);
  });

  it('is what constrainCamera clamps to', () => {
    expect(constrainCamera(151.21, -33.86, 20, maxZoomAt(151.21, -33.86, true)).zoom).toBe(17.5);
  });
});
