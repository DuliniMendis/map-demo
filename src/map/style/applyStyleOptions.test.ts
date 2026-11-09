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
