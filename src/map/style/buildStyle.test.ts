import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { LayerSpecification, RasterDEMSourceSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { buildStyle, DEFAULT_STYLE_OPTIONS, type StyleOptions } from './buildStyle';
import {
  AUSTRALIA_BOUNDS,
  LAYER_HILLSHADE,
  LAYER_IMAGERY,
  LAYER_LABELS_FIRST,
  LAYER_RELIEF,
  SOURCE_DEM,
  SOURCE_DEM_SHADE,
  SOURCE_IMAGERY,
  SOURCE_LABELS,
} from './ids';
import { LABEL_LAYER_IDS } from './layers/labels';
import { RELIEF_RAMP } from './layers/relief';
import { ATTRIBUTION_TEXT, SOURCE_BOUNDS } from './sources';

const bools = [false, true];
const allOptions: StyleOptions[] = bools.flatMap((imagery) =>
  bools.flatMap((labels) =>
    bools.flatMap((hillshade) =>
      bools.flatMap((relief) =>
        (['mapterhorn', 'aws'] as const).map((demProvider) => ({
          imagery,
          labels,
          hillshade,
          relief,
          exaggeration: 1.5,
          demProvider,
        })),
      ),
    ),
  ),
);

const layer = (style: ReturnType<typeof buildStyle>, id: string) => {
  const l = style.layers.find((x) => x.id === id);
  if (!l) throw new Error(`no layer ${id}`);
  return l as LayerSpecification & {
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
  };
};

describe('buildStyle', () => {
  it.each(allOptions.map((o) => [JSON.stringify(o), o] as const))(
    'validates against the MapLibre style spec: %s',
    (_, o) => {
      expect(validateStyleMin(buildStyle(o))).toEqual([]);
    },
  );

  it('(sanity) the validator does reject a broken layer', () => {
    const s = buildStyle(DEFAULT_STYLE_OPTIONS);
    const broken = {
      ...s,
      layers: [...s.layers, { id: 'x', type: 'hillshade', source: SOURCE_IMAGERY }],
    };
    expect(validateStyleMin(broken as typeof s).length).toBeGreaterThan(0);
  });

  it('maps each toggle to its layers’ visibility', () => {
    for (const o of allOptions) {
      const s = buildStyle(o);
      const vis = (id: string) => layer(s, id).layout?.visibility;
      expect(vis(LAYER_IMAGERY)).toBe(o.imagery ? 'visible' : 'none');
      expect(vis(LAYER_HILLSHADE)).toBe(o.hillshade ? 'visible' : 'none');
      expect(vis(LAYER_RELIEF)).toBe(o.relief ? 'visible' : 'none');
      for (const id of LABEL_LAYER_IDS) expect(vis(id)).toBe(o.labels ? 'visible' : 'none');
    }
  });

  it('strengthens hillshade and relief when imagery is off', () => {
    const on = buildStyle({ ...DEFAULT_STYLE_OPTIONS, imagery: true });
    const off = buildStyle({ ...DEFAULT_STYLE_OPTIONS, imagery: false });
    expect(layer(on, LAYER_HILLSHADE).paint?.['hillshade-exaggeration']).toBe(0.35);
    expect(layer(off, LAYER_HILLSHADE).paint?.['hillshade-exaggeration']).toBe(0.6);
    expect(layer(on, LAYER_RELIEF).paint?.['color-relief-opacity']).toBe(0.25);
    expect(layer(off, LAYER_RELIEF).paint?.['color-relief-opacity']).toBe(0.85);
    expect(layer(on, LAYER_HILLSHADE).paint?.['hillshade-illumination-direction']).toBe(315);
  });

  it('sets terrain on the dem source with the requested exaggeration, plus sky', () => {
    const s = buildStyle({ ...DEFAULT_STYLE_OPTIONS, exaggeration: 2.2 });
    expect(s.terrain).toEqual({ source: SOURCE_DEM, exaggeration: 2.2 });
    expect(s.sky?.['fog-ground-blend']).toBe(0.6);
  });

  it('orders layers: base, relief under hillshade, lines, then LAYER_LABELS_FIRST as first symbol', () => {
    const s = buildStyle(DEFAULT_STYLE_OPTIONS);
    const ids = s.layers.map((l) => l.id);
    expect(ids.slice(0, 4)).toEqual(['background', LAYER_IMAGERY, LAYER_RELIEF, LAYER_HILLSHADE]);
    const firstSymbol = s.layers.find((l) => l.type === 'symbol');
    expect(firstSymbol?.id).toBe(LAYER_LABELS_FIRST);
    const below = s.layers.slice(0, ids.indexOf(LAYER_LABELS_FIRST));
    expect(below.every((l) => l.type !== 'symbol')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points both DEM sources at the chosen provider', () => {
    const m = buildStyle({ ...DEFAULT_STYLE_OPTIONS, demProvider: 'mapterhorn' });
    const a = buildStyle({ ...DEFAULT_STYLE_OPTIONS, demProvider: 'aws' });
    for (const id of [SOURCE_DEM, SOURCE_DEM_SHADE]) {
      const ms = m.sources[id] as RasterDEMSourceSpecification;
      const as = a.sources[id] as RasterDEMSourceSpecification;
      expect(ms).toMatchObject({
        type: 'raster-dem',
        encoding: 'terrarium',
        tileSize: 512,
        maxzoom: 17,
      });
      expect(ms.tiles).toEqual(['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']);
      expect(as).toMatchObject({
        type: 'raster-dem',
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      });
      expect(as.tiles).toEqual([
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      ]);
    }
    // Terrain on the contract's `dem`; hillshade and relief on their own full-resolution source.
    expect(m.terrain?.source).toBe(SOURCE_DEM);
    expect(layer(m, LAYER_HILLSHADE)).toMatchObject({ source: SOURCE_DEM_SHADE });
    expect(layer(m, LAYER_RELIEF)).toMatchObject({ source: SOURCE_DEM_SHADE });
  });

  it('changes runtime-toggled paint properties without transitions (RTT would freeze them)', () => {
    const s = buildStyle(DEFAULT_STYLE_OPTIONS);
    expect(layer(s, LAYER_HILLSHADE).paint?.['hillshade-exaggeration-transition']).toEqual({
      duration: 0,
      delay: 0,
    });
    expect(layer(s, LAYER_RELIEF).paint?.['color-relief-opacity-transition']).toEqual({
      duration: 0,
      delay: 0,
    });
  });

  it('uses EOX with {y}/{x} order and bounds every source to (padded) Australia', () => {
    const s = buildStyle(DEFAULT_STYLE_OPTIONS);
    expect((s.sources[SOURCE_IMAGERY] as { tiles: string[] }).tiles[0]).toContain(
      's2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
    );
    for (const src of Object.values(s.sources)) {
      expect((src as { bounds?: number[] }).bounds).toEqual(SOURCE_BOUNDS);
    }
    const [w, so, e, n] = SOURCE_BOUNDS;
    const [[cw, cs], [ce, cn]] = AUSTRALIA_BOUNDS;
    expect(w).toBeLessThanOrEqual(cw);
    expect(so).toBeLessThanOrEqual(cs);
    expect(e).toBeGreaterThanOrEqual(ce);
    expect(n).toBeGreaterThanOrEqual(cn);
    // Boigu Island (northernmost Torres Strait community) is inside.
    expect(n).toBeGreaterThan(-9.23);
  });

  it('carries the research.md attribution strings', () => {
    const attr = (o: StyleOptions, id: string) =>
      (buildStyle(o).sources[id] as { attribution?: string }).attribution ?? '';
    const strip = (html: string) => html.replace(/<[^>]+>/g, '');
    const o = DEFAULT_STYLE_OPTIONS;
    expect(strip(attr(o, SOURCE_DEM))).toBe(ATTRIBUTION_TEXT.mapterhorn);
    expect(strip(attr({ ...o, demProvider: 'aws' }, SOURCE_DEM))).toBe(ATTRIBUTION_TEXT.aws);
    expect(strip(attr(o, SOURCE_IMAGERY))).toBe(ATTRIBUTION_TEXT.imagery);
    expect(strip(attr(o, SOURCE_LABELS))).toContain(ATTRIBUTION_TEXT.labels);
    expect(ATTRIBUTION_TEXT.imagery).toBe(
      'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    );
  });

  it('never references a non-free tile host', () => {
    const json = JSON.stringify(allOptions.map(buildStyle)).toLowerCase();
    for (const host of ['arcgis', 'esri', 'google', 'mapbox.com', 'maptiler', 'virtualearth']) {
      expect(json).not.toContain(host);
    }
  });

  it('has a monotonic relief ramp that ends in white at Kosciuszko height', () => {
    const ms = RELIEF_RAMP.map(([m]) => m);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    expect(RELIEF_RAMP.at(-1)?.[0]).toBe(2200);
  });
});
