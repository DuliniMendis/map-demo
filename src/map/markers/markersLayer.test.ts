import { describe, expect, it } from 'vitest';
import mock from '../../data/mock-nations.json';
import type { Nation } from '../../types/nation';
import {
  LAYER_NATIONS_CIRCLE,
  LAYER_NATIONS_LABEL,
  LAYER_NATIONS_RING,
  LABEL_MIN_ZOOM,
  NATIONS_LAYER_IDS,
  SOURCE_NATIONS,
  markerLayerSpecs,
  nationsToGeoJSON,
  radiusExpression,
  ringFilter,
} from './markersLayer';

const nations = (mock as unknown as { nations: Nation[] }).nations;

describe('nationsToGeoJSON', () => {
  it('one point per nation with idx/code/name, in input order', () => {
    const fc = nationsToGeoJSON(nations);
    expect(fc.features).toHaveLength(nations.length);
    fc.features.forEach((f, i) => {
      expect(f.geometry.coordinates).toEqual([nations[i]!.lng, nations[i]!.lat]);
      expect(f.properties).toEqual({ idx: i, code: nations[i]!.id, name: nations[i]!.name });
    });
  });

  it('empty input → empty collection', () => {
    expect(nationsToGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('markerLayerSpecs', () => {
  it('contract ids, bottom to top, all on the nations source', () => {
    const specs = markerLayerSpecs();
    expect(specs.map((l) => l.id)).toEqual(NATIONS_LAYER_IDS);
    expect(NATIONS_LAYER_IDS).toEqual([
      LAYER_NATIONS_RING,
      LAYER_NATIONS_CIRCLE,
      LAYER_NATIONS_LABEL,
    ]);
    for (const l of specs) expect((l as { source: string }).source).toBe(SOURCE_NATIONS);
  });

  it('circles stay round facing the camera (viewport pitch alignment)', () => {
    const circle = markerLayerSpecs().find((l) => l.id === LAYER_NATIONS_CIRCLE)!;
    expect(circle.type).toBe('circle');
    expect((circle as { paint: Record<string, unknown> }).paint['circle-pitch-alignment']).toBe(
      'viewport',
    );
  });

  it('labels hidden below z 6.5 and never overlap', () => {
    const label = markerLayerSpecs().find((l) => l.id === LAYER_NATIONS_LABEL)!;
    expect(label.minzoom).toBe(LABEL_MIN_ZOOM);
    expect(LABEL_MIN_ZOOM).toBe(6.5);
    expect((label as { layout: Record<string, unknown> }).layout['text-allow-overlap']).toBe(false);
  });

  it('withLabels: false drops the label layer; textFont is configurable', () => {
    expect(markerLayerSpecs({ withLabels: false }).map((l) => l.id)).toEqual([
      LAYER_NATIONS_RING,
      LAYER_NATIONS_CIRCLE,
    ]);
    const label = markerLayerSpecs({ textFont: ['Open Sans Bold'] }).at(-1) as {
      layout: Record<string, unknown>;
    };
    expect(label.layout['text-font']).toEqual(['Open Sans Bold']);
  });
});

describe('expressions', () => {
  it('radius ramps 3 px at z3 → 7 px at z10, plus an offset', () => {
    expect(radiusExpression()).toEqual(['interpolate', ['linear'], ['zoom'], 3, 3, 10, 7]);
    expect(radiusExpression(5)).toEqual(['interpolate', ['linear'], ['zoom'], 3, 8, 10, 12]);
  });

  it('ring filter matches only the selected code', () => {
    expect(ringFilter('W9')).toEqual(['==', ['get', 'code'], 'W9']);
    expect(ringFilter(null)).toEqual(['==', ['get', 'code'], '']);
  });
});
