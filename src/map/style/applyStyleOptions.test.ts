import type { CircleLayerSpecification } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStyleOptions } from './applyStyleOptions';
import { buildStyle, DEFAULT_STYLE_OPTIONS, type StyleOptions } from './buildStyle';
import { getActiveDemProvider, SWAP_IDLE_TIMEOUT_MS } from './demProvider';
import { FakeMap } from './fakeMap.testutil';
import {
  LAYER_HILLSHADE,
  LAYER_IMAGERY,
  LAYER_LABELS_FIRST,
  LAYER_RELIEF,
  SOURCE_DEM,
  SOURCE_DEM_SHADE,
} from './ids';
import { LABEL_LAYER_IDS } from './layers/labels';
import { setSunLocationHint } from './lighting';

const D = DEFAULT_STYLE_OPTIONS;
const markers: CircleLayerSpecification = {
  id: 'nations-circle',
  type: 'circle',
  source: 'nations',
};

function freshMap(o: StyleOptions = D) {
  const fm = new FakeMap(buildStyle(o));
  fm.style!.sources.nations = {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  };
  fm.addLayer(markers, LAYER_LABELS_FIRST); // what WS2 does
  fm.calls = [];
  return fm;
}

describe('applyStyleOptions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is a no-op when nothing changed', () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), D);
    expect(fm.calls).toEqual([]);
  });

  it('toggles visibility of each layer group in place', () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, imagery: false, labels: false, relief: true });
    const vis = (id: string) => fm.getLayoutProperty(id, 'visibility');
    expect(vis(LAYER_IMAGERY)).toBe('none');
    expect(vis(LAYER_RELIEF)).toBe('visible');
    expect(vis(LAYER_HILLSHADE)).toBe('visible');
    for (const id of LABEL_LAYER_IDS) expect(vis(id)).toBe('none');
    // WS2's layer is untouched and still directly below the first label symbol.
    const ids = fm.layerIds();
    expect(ids.indexOf('nations-circle')).toBe(ids.indexOf(LAYER_LABELS_FIRST) - 1);
  });

  it('retunes hillshade and relief for imagery on/off', () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, imagery: false });
    expect(fm.getPaintProperty(LAYER_HILLSHADE, 'hillshade-exaggeration')).toBe(0.6);
    expect(fm.getPaintProperty(LAYER_HILLSHADE, 'hillshade-highlight-color')).toBe('#fff4e0');
    expect(fm.getPaintProperty(LAYER_RELIEF, 'color-relief-opacity')).toBe(0.85);
    applyStyleOptions(fm.asMap(), D);
    expect(fm.getPaintProperty(LAYER_HILLSHADE, 'hillshade-exaggeration')).toBe(0.35);
    expect(fm.getPaintProperty(LAYER_RELIEF, 'color-relief-opacity')).toBe(0.25);
  });

  it('changes exaggeration via setTerrain', () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, exaggeration: 2.1 });
    expect(fm.calls).toEqual(['terrain dem x2.1']);
  });

  it('switches DEM provider by remove/add, keeping layer order, visibility and terrain', () => {
    const fm = freshMap();
    const before = fm.layerIds();
    applyStyleOptions(fm.asMap(), { ...D, relief: true, demProvider: 'aws' });
    expect(getActiveDemProvider(fm.asMap())).toBe('aws');
    expect(fm.getSource(SOURCE_DEM_SHADE)).toMatchObject({ tileSize: 256, maxzoom: 15 });
    expect(fm.layerIds()).toEqual(before);
    expect(fm.getLayoutProperty(LAYER_RELIEF, 'visibility')).toBe('visible');
    expect(fm.getTerrain()).toEqual({ source: SOURCE_DEM, exaggeration: 1.5 });
    expect(fm.calls).not.toContain('setStyle');
  });

  it('waits for idle before swapping DEM sources while the map is busy', () => {
    const fm = freshMap();
    fm.moving = true;
    applyStyleOptions(fm.asMap(), { ...D, demProvider: 'aws' });
    expect(getActiveDemProvider(fm.asMap())).toBe('mapterhorn');
    fm.moving = false;
    fm.fire('idle');
    expect(getActiveDemProvider(fm.asMap())).toBe('aws');
  });

  it('coalesces provider requests and gives up waiting for idle after a timeout', () => {
    const fm = freshMap();
    fm.tilesLoaded = false; // e.g. tiles stuck pending on a blackholed host
    applyStyleOptions(fm.asMap(), { ...D, demProvider: 'aws' });
    applyStyleOptions(fm.asMap(), { ...D, demProvider: 'mapterhorn' });
    applyStyleOptions(fm.asMap(), { ...D, demProvider: 'aws' });
    vi.advanceTimersByTime(SWAP_IDLE_TIMEOUT_MS);
    expect(getActiveDemProvider(fm.asMap())).toBe('aws');
    expect(fm.calls.filter((c) => c === `addSource ${SOURCE_DEM}`)).toHaveLength(1);
  });

  it('defers calls made before the style has loaded, applying only the latest', () => {
    const fm = new FakeMap();
    applyStyleOptions(fm.asMap(), { ...D, imagery: false });
    applyStyleOptions(fm.asMap(), { ...D, labels: false });
    fm.loadStyle(buildStyle(D));
    expect(fm.getLayoutProperty(LAYER_IMAGERY, 'visibility')).toBe('visible');
    expect(fm.getLayoutProperty(LAYER_LABELS_FIRST, 'visibility')).toBe('none');
  });
});

describe('applyStyleOptions: time-of-day light (sunHour)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A fixed "today" (todayInAustralia reads the clock): 21 December, summer solstice.
    vi.setSystemTime(new Date('2026-12-20T22:00:00Z'));
    setSunLocationHint(null);
  });
  afterEach(() => vi.useRealTimers());

  const paint = (fm: FakeMap, prop: string) => fm.getPaintProperty(LAYER_HILLSHADE, prop);
  const DEFAULT_PAINT = {
    'hillshade-illumination-direction': 315,
    'hillshade-illumination-anchor': 'viewport',
    'hillshade-exaggeration': 0.35,
    'hillshade-highlight-color': 'rgba(255, 244, 224, 0.35)',
    'hillshade-shadow-color': '#3a2414',
  };

  it("null keeps every paint value at today's defaults (no calls)", () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, sunHour: null });
    expect(fm.calls).toEqual([]);
    for (const [k, v] of Object.entries(DEFAULT_PAINT)) expect(paint(fm, k)).toBe(v);
  });

  it('a sun hour lights from the sun azimuth over the map centre, anchored to the map', () => {
    const fm = freshMap();
    fm.center = { lng: 150.3, lat: -33.75 }; // Blue Mountains
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 7 });
    expect(paint(fm, 'hillshade-illumination-anchor')).toBe('map');
    const am = paint(fm, 'hillshade-illumination-direction') as number;
    expect(am).toBeGreaterThan(100); // summer sunrise: well south of east
    expect(am).toBeLessThan(125);
    // Low sun: stronger relief than the default.
    expect(paint(fm, 'hillshade-exaggeration') as number).toBeGreaterThan(0.35);

    applyStyleOptions(fm.asMap(), { ...D, sunHour: 18 });
    const pm = paint(fm, 'hillshade-illumination-direction') as number;
    expect(pm).toBeGreaterThan(235);
    expect(pm).toBeLessThan(260);
  });

  it('fixes the place when the hour changes, not on pan', () => {
    const fm = freshMap();
    fm.center = { lng: 146.4, lat: -43.18 }; // Tasmania
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 12 });
    const tas = paint(fm, 'hillshade-exaggeration');
    fm.center = { lng: 130.8, lat: -12.46 }; // pan to Darwin; e.g. imagery toggles re-apply
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 12, labels: false });
    expect(paint(fm, 'hillshade-exaggeration')).toBe(tas);
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 12.25 }); // slider moved: now Darwin
    expect(paint(fm, 'hillshade-exaggeration')).not.toBe(tas);
  });

  it('prefers the location hint (selected nation) over the map centre', () => {
    const a = freshMap();
    const b = freshMap();
    a.center = { lng: 130.8, lat: -12.46 };
    b.center = { lng: 130.8, lat: -12.46 };
    applyStyleOptions(a.asMap(), { ...D, sunHour: 9 });
    setSunLocationHint({ lng: 146.4, lat: -43.18 });
    applyStyleOptions(b.asMap(), { ...D, sunHour: 9 });
    expect(paint(b, 'hillshade-illumination-direction')).not.toBe(
      paint(a, 'hillshade-illumination-direction'),
    );
  });

  it('null after a sun hour restores the exact defaults, for both imagery settings', () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 6.5, imagery: false });
    applyStyleOptions(fm.asMap(), { ...D, sunHour: null, imagery: false });
    expect(paint(fm, 'hillshade-illumination-direction')).toBe(315);
    expect(paint(fm, 'hillshade-illumination-anchor')).toBe('viewport');
    expect(paint(fm, 'hillshade-exaggeration')).toBe(0.6);
    expect(paint(fm, 'hillshade-highlight-color')).toBe('#fff4e0');
    expect(paint(fm, 'hillshade-shadow-color')).toBe('#3a2414');
    applyStyleOptions(fm.asMap(), { ...D, sunHour: 17 });
    applyStyleOptions(fm.asMap(), D);
    for (const [k, v] of Object.entries(DEFAULT_PAINT)) expect(paint(fm, k)).toBe(v);
    expect(fm.calls).not.toContain('setStyle');
  });
});
