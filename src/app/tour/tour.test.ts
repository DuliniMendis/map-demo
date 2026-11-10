import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tourDoc from '../../../docs/tour.md?raw';
import data from '../../../public/data/nations.json';
import { TOUR_OFF, useAppStore, type AppState } from '../../store/useAppStore';
import type { Nation, NationsFile } from '../../types/nation';
import { createTourDriver, type TourDriver } from './driver';
import { tourTransition, type TourContext } from './machine';
import { narration, resolveStops, TOUR_DWELL_MS, TOUR_STOPS } from './stops';

const nations = (data as NationsFile).nations;

describe('TOUR_STOPS', () => {
  const stops = resolveStops(nations);

  it('has 12 unique ids, all present in public/data/nations.json', () => {
    const ids = TOUR_STOPS.map((s) => s.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(stops.map((s) => s.id)).toEqual(ids);
  });

  it('covers every state and the NT', () => {
    const covered = new Set(stops.map((s) => s.nation.modern.stateCode));
    for (const code of ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'] as const) {
      expect(covered, code).toContain(code);
    }
  });

  it('narration is built from the data plus one landscape sentence', () => {
    for (const stop of stops) {
      const n = stop.nation;
      const text = narration(stop);
      expect(text).toContain(n.name);
      expect(text).toContain(`Country today: ${n.modern.locality}, ${n.modern.state}.`);
      if (n.peopleName) expect(text).toContain(n.peopleName);
      expect(text.endsWith(stop.landscape)).toBe(true);
      expect(stop.landscape.length).toBeLessThan(140);
    }
  });

  it('uses the agreed words (no "tribe")', () => {
    for (const stop of stops) expect(narration(stop)).not.toMatch(/tribe/i);
  });

  it('every narration is listed in docs/tour.md for review', () => {
    for (const stop of stops) expect(tourDoc).toContain(narration(stop));
  });

  it('skips stops missing from the data', () => {
    const some = nations.filter((n) => n.id === 'Y6' || n.id === 'S64');
    expect(resolveStops(some).map((s) => s.id)).toEqual(['Y6', 'S64']);
  });
});

describe('tourTransition', () => {
  const ctx: TourContext = { count: 12, reducedMotion: false };
  const playing = (index: number) => ({ status: 'playing' as const, index });
  const paused = (index: number) => ({ status: 'paused' as const, index });

  it('start plays from stop 1; with reduced motion it starts paused', () => {
    expect(tourTransition(TOUR_OFF, { type: 'start' }, ctx)).toEqual(playing(0));
    expect(tourTransition(paused(5), { type: 'start' }, ctx)).toEqual(playing(0));
    expect(tourTransition(TOUR_OFF, { type: 'start' }, { ...ctx, reducedMotion: true })).toEqual(
      paused(0),
    );
  });

  it('dwell moves on while playing; the last stop ends the tour paused', () => {
    expect(tourTransition(playing(3), { type: 'dwellDone' }, ctx)).toEqual(playing(4));
    expect(tourTransition(playing(11), { type: 'dwellDone' }, ctx)).toEqual(paused(11));
    expect(tourTransition(paused(3), { type: 'dwellDone' }, ctx)).toEqual(paused(3));
  });

  it('next/prev clamp and keep the status', () => {
    expect(tourTransition(playing(0), { type: 'prev' }, ctx)).toEqual(playing(0));
    expect(tourTransition(paused(0), { type: 'next' }, ctx)).toEqual(paused(1));
    expect(tourTransition(paused(11), { type: 'next' }, ctx)).toEqual(paused(11));
    expect(tourTransition(playing(5), { type: 'prev' }, ctx)).toEqual(playing(4));
  });

  it('toggle pauses/plays; play at the end starts over; reduced motion never plays', () => {
    expect(tourTransition(playing(2), { type: 'toggle' }, ctx)).toEqual(paused(2));
    expect(tourTransition(paused(2), { type: 'toggle' }, ctx)).toEqual(playing(2));
    expect(tourTransition(paused(11), { type: 'toggle' }, ctx)).toEqual(playing(0));
    expect(tourTransition(paused(2), { type: 'toggle' }, { ...ctx, reducedMotion: true })).toEqual(
      paused(2),
    );
  });

  it('interrupt pauses; stop turns it off; events do nothing while off', () => {
    expect(tourTransition(playing(4), { type: 'interrupt' }, ctx)).toEqual(paused(4));
    expect(tourTransition(paused(4), { type: 'stop' }, ctx)).toEqual(TOUR_OFF);
    expect(tourTransition(TOUR_OFF, { type: 'next' }, ctx)).toEqual(TOUR_OFF);
    expect(tourTransition(TOUR_OFF, { type: 'toggle' }, ctx)).toEqual(TOUR_OFF);
  });
});

describe('tour driver (store + timers)', () => {
  let driver: TourDriver;
  let unwire: () => void;
  const stops = resolveStops(nations);
  const initial = useAppStore.getState();

  /** Stand-in for the map wiring: a new selection starts a flight (nested set, like the real controller). */
  function fakeWiring() {
    return useAppStore.subscribe((s: AppState, prev: AppState) => {
      if (s.selectedId !== prev.selectedId && s.selectedId !== null) {
        useAppStore.getState().setCameraState('flying');
      }
    });
  }
  const land = () => useAppStore.getState().setCameraState('idle');
  const state = () => useAppStore.getState();
  const flush = () => Promise.resolve();

  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({
      ...initial,
      nations: nations as Nation[],
      selectedId: null,
      cameraState: 'idle',
      reducedMotion: false,
      tour: { ...TOUR_OFF },
    });
    unwire = fakeWiring();
    driver = createTourDriver(useAppStore);
  });
  afterEach(() => {
    driver.dispose();
    unwire();
    vi.useRealTimers();
  });

  it('play → fly → land → dwell → next stop', () => {
    driver.dispatch({ type: 'start' });
    expect(state().tour).toEqual({ status: 'playing', index: 0 });
    expect(state().selectedId).toBe(stops[0]!.id);
    expect(state().cameraState).toBe('flying');

    // No dwell while the camera is still flying.
    vi.advanceTimersByTime(TOUR_DWELL_MS * 2);
    expect(state().tour.index).toBe(0);

    land();
    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    expect(state().tour.index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(state().tour.index).toBe(1);
    expect(state().selectedId).toBe(stops[1]!.id);
    expect(state().cameraState).toBe('flying');
  });

  it('ends paused at the last stop', () => {
    useAppStore.setState({ tour: { status: 'playing', index: 10 } });
    driver.dispatch({ type: 'next' });
    expect(state().tour).toEqual({ status: 'playing', index: 11 });
    land();
    vi.advanceTimersByTime(TOUR_DWELL_MS);
    expect(state().tour).toEqual({ status: 'paused', index: 11 });
    expect(state().selectedId).toBe(stops[11]!.id);
    vi.advanceTimersByTime(TOUR_DWELL_MS * 3);
    expect(state().tour).toEqual({ status: 'paused', index: 11 });
  });

  it('selecting another nation pauses it (and keeps the user’s choice)', async () => {
    driver.dispatch({ type: 'start' });
    land();
    state().select('L3');
    await flush();
    expect(state().tour).toEqual({ status: 'paused', index: 0 });
    expect(state().selectedId).toBe('L3');
    land();
    vi.advanceTimersByTime(TOUR_DWELL_MS * 2);
    expect(state().tour.index).toBe(0);
  });

  it('interrupt (drag, Esc, About) pauses; play resumes and dwells again', () => {
    driver.dispatch({ type: 'start' });
    land();
    vi.advanceTimersByTime(TOUR_DWELL_MS / 2);
    driver.dispatch({ type: 'interrupt' });
    expect(state().tour.status).toBe('paused');
    vi.advanceTimersByTime(TOUR_DWELL_MS);
    expect(state().tour.index).toBe(0);
    driver.dispatch({ type: 'toggle' });
    expect(state().tour).toEqual({ status: 'playing', index: 0 });
    vi.advanceTimersByTime(TOUR_DWELL_MS);
    expect(state().tour.index).toBe(1);
  });

  it('play after Esc cleared the selection reselects the stop', () => {
    driver.dispatch({ type: 'start' });
    land();
    driver.dispatch({ type: 'interrupt' });
    state().select(null);
    driver.dispatch({ type: 'toggle' });
    expect(state().selectedId).toBe(stops[0]!.id);
  });

  it('next/prev select the stop and do not count as a takeover', async () => {
    driver.dispatch({ type: 'start' });
    driver.dispatch({ type: 'next' });
    await flush();
    expect(state().tour).toEqual({ status: 'playing', index: 1 });
    expect(state().selectedId).toBe(stops[1]!.id);
    driver.dispatch({ type: 'prev' });
    await flush();
    expect(state().tour).toEqual({ status: 'playing', index: 0 });
    expect(state().selectedId).toBe(stops[0]!.id);
  });

  it('stop turns it off and never advances again', () => {
    driver.dispatch({ type: 'start' });
    land();
    driver.dispatch({ type: 'stop' });
    expect(state().tour).toEqual(TOUR_OFF);
    vi.advanceTimersByTime(TOUR_DWELL_MS * 3);
    expect(state().tour).toEqual(TOUR_OFF);
  });

  it('reduced motion: starts paused and never auto-advances; next still works', () => {
    useAppStore.setState({ reducedMotion: true });
    driver.dispatch({ type: 'start' });
    expect(state().tour).toEqual({ status: 'paused', index: 0 });
    land();
    vi.advanceTimersByTime(TOUR_DWELL_MS * 3);
    expect(state().tour.index).toBe(0);
    driver.dispatch({ type: 'next' });
    expect(state().tour).toEqual({ status: 'paused', index: 1 });
    expect(state().selectedId).toBe(stops[1]!.id);
  });

  it('turning reduced motion on mid-tour pauses it', async () => {
    driver.dispatch({ type: 'start' });
    land();
    useAppStore.setState({ reducedMotion: true });
    await flush();
    expect(state().tour.status).toBe('paused');
  });

  it('starting at a stop that is already selected and at rest dwells right away', () => {
    state().select(stops[0]!.id);
    land();
    driver.dispatch({ type: 'start' });
    expect(state().cameraState).toBe('idle');
    vi.advanceTimersByTime(TOUR_DWELL_MS);
    expect(state().tour.index).toBe(1);
  });
});
