import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mock from '../data/mock-nations.json';
import { DEFAULT_LAYERS, EXAGGERATION_DEFAULT, useAppStore } from '../store/useAppStore';
import type { Nation } from '../types/nation';
import {
  applyUrlToStore,
  parseUrlState,
  resolveBootSelection,
  serialiseUrlState,
  startUrlWriter,
} from './UrlSync';

const nations = mock.nations as Nation[];
const ALL_OFF = { imagery: false, labels: false, hillshade: false, relief: false, contours: false };
const base = { selectedId: null, layers: DEFAULT_LAYERS, exaggeration: EXAGGERATION_DEFAULT };

describe('parseUrlState', () => {
  it('returns nulls for an empty query', () => {
    expect(parseUrlState('')).toEqual({ n: null, layers: null, exaggeration: null });
  });

  it('reads n, l and x', () => {
    expect(parseUrlState('?n=L3&l=imagery,relief&x=2.1')).toEqual({
      n: 'L3',
      layers: { ...ALL_OFF, imagery: true, relief: true },
      exaggeration: 2.1,
    });
  });

  it('accepts ids with dots and an encoded comma list', () => {
    const s = parseUrlState('?n=S31.1&l=labels%2Chillshade');
    expect(s.n).toBe('S31.1');
    expect(s.layers).toEqual({ ...ALL_OFF, labels: true, hillshade: true });
  });

  it('treats an empty ?l= as all layers off', () => {
    expect(parseUrlState('?l=').layers).toEqual(ALL_OFF);
  });

  it('ignores unknown layer names, and a list of only unknown names', () => {
    expect(parseUrlState('?l=imagery,rainfall').layers).toEqual({ ...ALL_OFF, imagery: true });
    expect(parseUrlState('?l=rainfall,foo').layers).toBeNull();
  });

  it('clamps x and ignores non-numbers', () => {
    expect(parseUrlState('?x=9').exaggeration).toBe(2.5);
    expect(parseUrlState('?x=0').exaggeration).toBe(1);
    expect(parseUrlState('?x=abc').exaggeration).toBeNull();
    expect(parseUrlState('?x=').exaggeration).toBeNull();
  });

  it('treats a blank n as absent', () => {
    expect(parseUrlState('?n=%20').n).toBeNull();
  });
});

describe('serialiseUrlState', () => {
  it('omits everything at defaults', () => {
    expect(serialiseUrlState(base)).toBe('');
  });

  it('writes n, l (canonical order, literal commas) and x', () => {
    expect(
      serialiseUrlState({
        selectedId: 'S31.1',
        layers: { ...ALL_OFF, relief: true, imagery: true },
        exaggeration: 2.0000001,
      }),
    ).toBe('?n=S31.1&l=imagery,relief&x=2');
  });

  it('writes an empty l when every layer is off', () => {
    expect(serialiseUrlState({ ...base, layers: ALL_OFF })).toBe('?l=');
  });

  it('keeps unrelated params and drops stale n/l/x', () => {
    expect(serialiseUrlState(base, '?debug=1&n=L3&x=2')).toBe('?debug=1');
  });

  it('round-trips through parseUrlState', () => {
    const state = {
      selectedId: 'W9',
      layers: { ...ALL_OFF, labels: true, hillshade: true },
      exaggeration: 1.8,
    };
    const parsed = parseUrlState(serialiseUrlState(state));
    expect(parsed).toEqual({ n: 'W9', layers: state.layers, exaggeration: 1.8 });
  });
});

describe('resolveBootSelection', () => {
  it('keeps a known id and ignores unknown ones', () => {
    expect(resolveBootSelection('L3', nations)).toBe('L3');
    expect(resolveBootSelection('NOPE', nations)).toBeNull();
    expect(resolveBootSelection(null, nations)).toBeNull();
  });
});

describe('store integration', () => {
  const initial = useAppStore.getState();
  beforeEach(() => useAppStore.setState(initial, true));
  afterEach(() => vi.useRealTimers());

  it('applyUrlToStore sets layers/exaggeration and returns the requested id', () => {
    expect(applyUrlToStore(useAppStore, '?n=L3&l=relief&x=2.2')).toBe('L3');
    const s = useAppStore.getState();
    expect(s.layers).toEqual({ ...ALL_OFF, relief: true });
    expect(s.exaggeration).toBe(2.2);
    expect(s.selectedId).toBeNull(); // selection waits for nations
  });

  it('startUrlWriter debounces replaceState by 300 ms', () => {
    vi.useFakeTimers();
    const location = { pathname: '/', search: '?n=NOPE', hash: '' };
    const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
      location.search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    });
    const win = {
      location,
      history: { state: null, replaceState },
      setTimeout,
      clearTimeout,
    } as unknown as Window;

    const stop = startUrlWriter(useAppStore, win);
    // Initial sync clears the unknown id straight away.
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/');

    useAppStore.getState().select('L3');
    useAppStore.getState().setExaggeration(2);
    vi.advanceTimersByTime(299);
    expect(replaceState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(replaceState).toHaveBeenCalledTimes(2);
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?n=L3&x=2');

    // Unrelated store changes don't write.
    useAppStore.getState().setQuery('kaurna');
    vi.advanceTimersByTime(1000);
    expect(replaceState).toHaveBeenCalledTimes(2);

    stop();
    useAppStore.getState().select('W9');
    vi.advanceTimersByTime(1000);
    expect(replaceState).toHaveBeenCalledTimes(2);
  });
});
