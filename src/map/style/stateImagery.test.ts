import { describe, expect, it } from 'vitest';
import { SOURCE_BOUNDS } from './sources';
import { STATE_IMAGERY, stateImageryAt, stateImagerySources } from './stateImagery';

const at = (lng: number, lat: number) => stateImageryAt(lng, lat).map((s) => s.id);

describe('stateImageryAt', () => {
  it.each([
    ['Sydney', 151.21, -33.86, ['nsw']],
    ['Canberra (ACT, on the NSW service)', 149.13, -35.28, ['nsw']],
    ['Broken Hill', 141.47, -31.95, ['nsw']],
    ['Albury', 146.92, -36.0, ['nsw']],
    ['Tweed Heads', 153.54, -28.2, ['nsw']],
    ['Brisbane', 153.02, -27.47, ['qld']],
    ['Goondiwindi', 150.31, -28.55, ['qld']],
    ['Gold Coast', 153.43, -28.0, ['qld']],
    ['Mount Isa', 139.49, -20.73, ['qld']],
    ['Birdsville', 139.35, -25.9, ['qld']],
    ['Cairns', 145.77, -16.92, ['qld']],
    ['Thursday Island', 142.22, -10.58, ['qld']],
    ['Saibai Island', 142.62, -9.38, ['qld']],
    ['Hobart', 147.32, -42.88, ['tas']],
    ['King Island', 143.95, -39.88, ['tas']],
    ['Flinders Island', 148.0, -40.0, ['tas']],
    ['Melbourne', 144.96, -37.81, []],
    ['Wodonga', 146.88, -36.13, []],
    ['Mildura', 142.15, -34.21, []],
    ['Wilsons Promontory', 146.38, -39.13, []],
    ['Adelaide', 138.6, -34.93, []],
    ['Uluru', 131.03, -25.34, []],
    ['Darwin', 130.84, -12.46, []],
    ['Perth', 115.86, -31.95, []],
  ])('%s', (_name, lng, lat, want) => {
    expect(at(lng, lat)).toEqual(want);
  });
});

describe('stateImagerySources', () => {
  it('keeps every source inside its coverage box and Australia', () => {
    const sources = stateImagerySources();
    for (const s of STATE_IMAGERY) {
      const src = sources[s.sourceId];
      expect(src.minzoom).toBe(13);
      expect(src.maxzoom).toBeGreaterThanOrEqual(s.cameraMaxZoom);
      const [w, so, e, n] = src.bounds!;
      expect(w).toBeGreaterThanOrEqual(SOURCE_BOUNDS[0]);
      expect(so).toBeGreaterThanOrEqual(SOURCE_BOUNDS[1]);
      expect(e).toBeLessThanOrEqual(SOURCE_BOUNDS[2]);
      expect(n).toBeLessThanOrEqual(SOURCE_BOUNDS[3]);
    }
  });
});
