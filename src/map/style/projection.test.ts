import type { Map as MlMap, ProjectionSpecification } from 'maplibre-gl';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { applyStyleOptions } from './applyStyleOptions';
import { buildStyle, DEFAULT_STYLE_OPTIONS } from './buildStyle';
import { FakeMap } from './fakeMap.testutil';
import { OVERVIEW_CAMERA } from './ids';
import {
  applyProjection,
  GLOBE_FULL_ZOOM,
  globeness,
  MERCATOR_ZOOM,
  styleProjection,
} from './projection';

/** FakeMap plus the two projection methods MapLibre 6.17 has. */
class ProjectionMap extends FakeMap {
  projection: ProjectionSpecification | undefined;
  setCalls = 0;
  getProjection() {
    return this.projection as ProjectionSpecification;
  }
  setProjection(p: ProjectionSpecification) {
    this.setCalls++;
    this.projection = p;
    return this;
  }
}

describe('styleProjection', () => {
  it('globe: zoom-interpolated vertical-perspective → mercator, flat from z 4', () => {
    expect(styleProjection(true)).toEqual({
      type: ['interpolate', ['linear'], ['zoom'], 3, 'vertical-perspective', 4, 'mercator'],
    });
    expect(MERCATOR_ZOOM).toBe(4);
    expect(GLOBE_FULL_ZOOM).toBeLessThan(MERCATOR_ZOOM);
  });

  it('globe: false is plain mercator (the Phase 2 style)', () => {
    expect(styleProjection(false)).toEqual({ type: 'mercator' });
  });

  it('buildStyle carries it and the style validates', () => {
    const globe = buildStyle(DEFAULT_STYLE_OPTIONS);
    expect(globe.projection).toEqual(styleProjection(true));
    expect(validateStyleMin(globe)).toEqual([]);
    const flat = buildStyle({ ...DEFAULT_STYLE_OPTIONS, globe: false });
    expect(flat.projection).toEqual({ type: 'mercator' });
    expect(validateStyleMin(flat)).toEqual([]);
  });
});

describe('globeness', () => {
  it('is 1 zoomed out, 0 from z 4, linear in between', () => {
    expect(globeness(2)).toBe(1);
    expect(globeness(GLOBE_FULL_ZOOM)).toBe(1);
    expect(globeness(3.5)).toBeCloseTo(0.5);
    expect(globeness(OVERVIEW_CAMERA.zoom)).toBeGreaterThan(0); // the overview is (slightly) a globe
    expect(globeness(MERCATOR_ZOOM)).toBe(0);
    expect(globeness(10.5)).toBe(0);
    expect(globeness(2, false)).toBe(0);
  });
});

describe('applyProjection', () => {
  it('sets the projection only when it differs', () => {
    const map = new ProjectionMap(buildStyle({ ...DEFAULT_STYLE_OPTIONS, globe: false }));
    map.projection = { type: 'mercator' };
    applyProjection(map.asMap(), false);
    expect(map.setCalls).toBe(0);
    applyProjection(map.asMap(), true);
    expect(map.projection).toEqual(styleProjection(true));
    expect(map.setCalls).toBe(1);
    applyProjection(map.asMap(), true);
    expect(map.setCalls).toBe(1);
    applyProjection(map.asMap(), false);
    expect(map.projection).toEqual({ type: 'mercator' });
    expect(map.setCalls).toBe(2);
  });

  it('treats a style without a projection as mercator', () => {
    const map = new ProjectionMap(buildStyle({ ...DEFAULT_STYLE_OPTIONS, globe: false }));
    applyProjection(map.asMap(), false);
    expect(map.setCalls).toBe(0);
  });

  it('applyStyleOptions keeps the projection in line, and ignores maps without the API', () => {
    const map = new ProjectionMap(buildStyle(DEFAULT_STYLE_OPTIONS));
    map.projection = styleProjection(true);
    applyStyleOptions(map.asMap(), DEFAULT_STYLE_OPTIONS);
    expect(map.setCalls).toBe(0);
    applyStyleOptions(map.asMap(), { ...DEFAULT_STYLE_OPTIONS, globe: false });
    expect(map.projection).toEqual({ type: 'mercator' });

    const plain = new FakeMap(buildStyle(DEFAULT_STYLE_OPTIONS));
    expect(() => applyProjection(plain as unknown as MlMap, true)).not.toThrow();
  });
});
