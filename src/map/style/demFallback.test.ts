import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStyleOptions } from './applyStyleOptions';
import { buildStyle, DEFAULT_STYLE_OPTIONS } from './buildStyle';
import { DEM_FALLBACK_THRESHOLD, installDemFallback, onDemFallback } from './demFallback';
import { getActiveDemProvider, hasFallenBack } from './demProvider';
import { FakeMap } from './fakeMap.testutil';
import { SOURCE_DEM, SOURCE_DEM_SHADE, SOURCE_IMAGERY } from './ids';
import type { DemFallbackEventData } from './types';

const tileError = (sourceId: string) => ({
  error: new Error('Failed to fetch'),
  sourceId,
  tile: {},
});

function setup() {
  const fm = new FakeMap(buildStyle(DEFAULT_STYLE_OPTIONS));
  const map = fm.asMap();
  installDemFallback(map);
  const events: DemFallbackEventData[] = [];
  onDemFallback(map, (e) => events.push(e));
  // A second error listener, as an app would have, so the watcher doesn't re-log errors.
  fm.on('error', () => {});
  return { fm, map, events };
}

describe('DEM fallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it(`switches to AWS after ${DEM_FALLBACK_THRESHOLD} consecutive DEM tile errors`, () => {
    const { fm, map, events } = setup();
    fm.fire('error', tileError(SOURCE_DEM));
    fm.fire('error', tileError(SOURCE_DEM_SHADE));
    expect(getActiveDemProvider(map)).toBe('mapterhorn');
    fm.fire('error', tileError(SOURCE_DEM));
    expect(getActiveDemProvider(map)).toBe('aws');
    expect(hasFallenBack(map)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: 'mapterhorn', to: 'aws' });
  });

  it('resets the count when a DEM tile loads', () => {
    const { fm, map, events } = setup();
    fm.fire('error', tileError(SOURCE_DEM));
    fm.fire('error', tileError(SOURCE_DEM));
    fm.fire('sourcedata', { sourceId: SOURCE_DEM, tile: {} });
    fm.fire('error', tileError(SOURCE_DEM));
    fm.fire('error', tileError(SOURCE_DEM));
    expect(getActiveDemProvider(map)).toBe('mapterhorn');
    expect(events).toHaveLength(0);
  });

  it('ignores errors from other sources and non-tile errors', () => {
    const { fm, map } = setup();
    for (let i = 0; i < 5; i++) fm.fire('error', tileError(SOURCE_IMAGERY));
    for (let i = 0; i < 5; i++)
      fm.fire('error', { error: new Error('style'), sourceId: SOURCE_DEM });
    expect(getActiveDemProvider(map)).toBe('mapterhorn');
  });

  it('is sticky: later applyStyleOptions asking for Mapterhorn stays on AWS, fires once', () => {
    const { fm, map, events } = setup();
    for (let i = 0; i < DEM_FALLBACK_THRESHOLD * 2; i++) fm.fire('error', tileError(SOURCE_DEM));
    applyStyleOptions(map, { ...DEFAULT_STYLE_OPTIONS, demProvider: 'mapterhorn' });
    expect(getActiveDemProvider(map)).toBe('aws');
    expect(events).toHaveLength(1);
  });

  it('keeps MapLibre’s default console logging when it is the only error listener', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fm = new FakeMap(buildStyle(DEFAULT_STYLE_OPTIONS));
    installDemFallback(fm.asMap());
    fm.fire('error', tileError(SOURCE_IMAGERY));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reads the provider from the serialized source (a live source has no `tiles` until loaded)', () => {
    const fm = new FakeMap(buildStyle({ ...DEFAULT_STYLE_OPTIONS, demProvider: 'aws' }));
    const spec = fm.style!.sources[SOURCE_DEM];
    vi.spyOn(fm, 'getSource').mockImplementation(
      () => ({ type: 'raster-dem', serialize: () => spec }) as never,
    );
    expect(getActiveDemProvider(fm.asMap())).toBe('aws');
  });

  it('installs once per map', () => {
    const fm = new FakeMap(buildStyle(DEFAULT_STYLE_OPTIONS));
    const a = installDemFallback(fm.asMap());
    const b = installDemFallback(fm.asMap());
    expect(a).toBe(b);
    expect(fm._listeners.error).toHaveLength(1);
    a();
    expect(fm._listeners.error).toHaveLength(0);
  });
});
