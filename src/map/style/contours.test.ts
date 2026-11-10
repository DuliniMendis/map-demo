import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { CircleLayerSpecification, StyleSpecification } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStyleOptions } from './applyStyleOptions';
import { buildStyle, DEFAULT_STYLE_OPTIONS } from './buildStyle';
import { resetContoursForTests } from './contours';
import { FakeMap } from './fakeMap.testutil';
import {
  DEM_FALLBACK_EVENT,
  LAYER_CONTOUR_LABELS,
  LAYER_CONTOUR_LINES,
  LAYER_HILLSHADE,
  LAYER_LABELS_FIRST,
  SOURCE_CONTOURS,
} from './ids';
import {
  CONTOUR_COLORS,
  CONTOUR_MIN_ZOOM,
  contourInterval,
  contourLabelLayer,
  contourLineLayer,
  contourSource,
  contourTileOptions,
} from './layers/contours';
import { markFallenBack } from './demProvider';

const created = vi.hoisted(() => [] as { url: string; maxzoom: number; id: string }[]);

vi.mock('maplibre-contour', () => {
  class DemSource {
    opts: { url: string; maxzoom: number; id: string };
    constructor(opts: { url: string; maxzoom: number; id: string }) {
      this.opts = opts;
      created.push(opts);
    }
    setupMaplibre() {}
    contourProtocolUrl = (o: { overzoom: number }) =>
      `${this.opts.id}-contour://{z}/{x}/{y}?overzoom=${o.overzoom}`;
  }
  return { default: { DemSource } };
});

const D = DEFAULT_STYLE_OPTIONS;

async function settle() {
  await vi.dynamicImportSettled();
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function freshMap() {
  const fm = new FakeMap(buildStyle(D));
  fm.style!.sources.nations = {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  };
  const markers: CircleLayerSpecification = {
    id: 'nations-circle',
    type: 'circle',
    source: 'nations',
  };
  fm.addLayer(markers, LAYER_LABELS_FIRST);
  fm.calls = [];
  return fm;
}

describe('contour intervals', () => {
  it.each([
    [10.9, null],
    [11, { minor: 50, major: 250 }],
    [12.7, { minor: 50, major: 250 }],
    [13, { minor: 20, major: 100 }],
    [16, { minor: 20, major: 100 }],
  ])('z%s → %j', (z, want) => expect(contourInterval(z)).toEqual(want));

  it('reads the DEM where the terrain does: overzoom 1 on Mapterhorn 512 px, 0 on AWS 256 px', () => {
    expect(contourTileOptions('mapterhorn')).toMatchObject({
      overzoom: 1,
      thresholds: { 11: [50, 250], 13: [20, 100] },
    });
    expect(contourTileOptions('aws').overzoom).toBe(0);
  });
});

describe('contour layers', () => {
  it('validate against the style spec, in both colourways', () => {
    for (const imagery of [true, false]) {
      const style: StyleSpecification = {
        ...buildStyle(D),
        sources: { ...buildStyle(D).sources, [SOURCE_CONTOURS]: contourSource('x://{z}/{x}/{y}') },
      };
      style.layers.push(contourLineLayer(true, imagery), contourLabelLayer(true, imagery));
      expect(validateStyleMin(style)).toEqual([]);
    }
  });

  it('start at z11 and label major lines in metres with the existing glyphs', () => {
    const lines = contourLineLayer(true, true);
    const labels = contourLabelLayer(true, true);
    expect(lines.minzoom).toBe(CONTOUR_MIN_ZOOM);
    expect(labels.layout?.['text-font']).toEqual(['Noto Sans Regular']);
    expect(JSON.stringify(labels.layout?.['text-field'])).toContain('" m"');
    expect(labels.filter).toEqual(['>=', ['get', 'level'], 1]);
  });
});

describe('contours via applyStyleOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetContoursForTests();
    created.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('loads nothing while off', async () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), D);
    await settle();
    expect(created).toEqual([]);
    expect(fm.getSource(SOURCE_CONTOURS)).toBeUndefined();
  });

  it('adds the source and layers above the hillshade, below river lines, markers and labels', async () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, contours: true });
    await settle();
    expect(created).toEqual([
      expect.objectContaining({
        url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
        maxzoom: 12,
      }),
    ]);
    expect(fm.getSource(SOURCE_CONTOURS)).toMatchObject({
      type: 'vector',
      minzoom: 11,
      tiles: ['contour-mapterhorn-contour://{z}/{x}/{y}?overzoom=1'],
    });
    const ids = fm.layerIds();
    const at = (id: string) => ids.indexOf(id);
    expect(at(LAYER_CONTOUR_LINES)).toBe(at(LAYER_HILLSHADE) + 1);
    expect(at(LAYER_CONTOUR_LABELS)).toBe(at(LAYER_CONTOUR_LINES) + 1);
    expect(at(LAYER_CONTOUR_LABELS)).toBeLessThan(at('labels-waterway-line'));
    expect(at(LAYER_CONTOUR_LABELS)).toBeLessThan(at('nations-circle'));
    expect(fm.getLayoutProperty(LAYER_CONTOUR_LINES, 'visibility')).toBe('visible');
  });

  it('toggles visibility in place and retints for imagery off', async () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, contours: true });
    await settle();
    applyStyleOptions(fm.asMap(), { ...D, contours: false });
    expect(fm.getLayoutProperty(LAYER_CONTOUR_LINES, 'visibility')).toBe('none');
    expect(fm.getLayoutProperty(LAYER_CONTOUR_LABELS, 'visibility')).toBe('none');
    applyStyleOptions(fm.asMap(), { ...D, contours: true, imagery: false });
    expect(fm.getLayoutProperty(LAYER_CONTOUR_LINES, 'visibility')).toBe('visible');
    expect(fm.getPaintProperty(LAYER_CONTOUR_LINES, 'line-color')).toBe(
      CONTOUR_COLORS.withoutImagery.line,
    );
    await settle();
    expect(created).toHaveLength(1);
    expect(fm.calls.filter((c) => c.startsWith('addSource'))).toHaveLength(1);
  });

  it('follows the DEM fallback to AWS', async () => {
    const fm = freshMap();
    applyStyleOptions(fm.asMap(), { ...D, contours: true });
    await settle();
    markFallenBack(fm.asMap());
    fm.fire(DEM_FALLBACK_EVENT, { from: 'mapterhorn', to: 'aws' });
    await settle();
    expect(created.map((c) => c.url)).toEqual([
      'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    ]);
    expect(fm.getSource(SOURCE_CONTOURS)).toMatchObject({
      tiles: ['contour-aws-contour://{z}/{x}/{y}?overzoom=0'],
    });
    const ids = fm.layerIds();
    expect(ids.indexOf(LAYER_CONTOUR_LINES)).toBe(ids.indexOf(LAYER_HILLSHADE) + 1);
    // Re-applying with the stale "mapterhorn" request keeps contours on AWS.
    applyStyleOptions(fm.asMap(), { ...D, contours: true });
    await settle();
    expect(created).toHaveLength(2);
  });
});
