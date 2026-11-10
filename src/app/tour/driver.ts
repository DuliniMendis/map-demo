// Runs the guided tour against the store (WS9): selects each stop, waits for the camera to land, dwells, moves
// on, and pauses when the user takes over. The UI (Tour.tsx) only dispatches events and renders.
import type { AppActions, AppState, useAppStore } from '../../store/useAppStore';
import { selectsStop, tourTransition, type TourEvent } from './machine';
import { resolveStops, TOUR_DWELL_MS, type ResolvedStop } from './stops';

type State = AppState & AppActions;
export type TourStore = Pick<typeof useAppStore, 'getState' | 'setState' | 'subscribe'>;

export interface TourTimers {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface TourDriverOptions {
  dwellMs?: number;
  timers?: TourTimers;
}

export interface TourDriver {
  dispatch(event: TourEvent): void;
  /** The stops available in the loaded data, in order. */
  stops(): ResolvedStop[];
  dispose(): void;
}

const defaultTimers: TourTimers = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Store writes are atomic (`setState({ tour, selectedId })`) so the map wiring sees one selection change and
 * flies once. Writes triggered from inside a store listener are deferred to a microtask: zustand notifies
 * the remaining listeners of a nested `set` with the newest state, which would make them see the same
 * selection change twice.
 */
export function createTourDriver(store: TourStore, opts: TourDriverOptions = {}): TourDriver {
  const dwellMs = opts.dwellMs ?? TOUR_DWELL_MS;
  const timers = opts.timers ?? defaultTimers;
  let cachedNations: State['nations'] | null = null;
  let cachedStops: ResolvedStop[] = [];
  let timer: unknown = null;
  let armedIndex = -1;
  let disposed = false;

  const stops = (): ResolvedStop[] => {
    const nations = store.getState().nations;
    if (nations !== cachedNations) {
      cachedNations = nations;
      cachedStops = resolveStops(nations);
    }
    return cachedStops;
  };
  const stopId = (s: State): string | null =>
    s.tour.status === 'off' ? null : (stops()[s.tour.index]?.nation.id ?? null);

  const clear = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    armedIndex = -1;
  };

  /** Dwell only while playing, at the current stop, with the camera at rest (the flight has landed). */
  const shouldDwell = (s: State) =>
    s.tour.status === 'playing' &&
    !s.reducedMotion &&
    s.cameraState === 'idle' &&
    s.selectedId !== null &&
    s.selectedId === stopId(s);

  const syncTimer = () => {
    const s = store.getState();
    if (!shouldDwell(s)) {
      clear();
      return;
    }
    if (timer !== null && armedIndex === s.tour.index) return;
    clear();
    armedIndex = s.tour.index;
    timer = timers.setTimeout(() => {
      timer = null;
      armedIndex = -1;
      if (!disposed && shouldDwell(store.getState())) dispatch({ type: 'dwellDone' });
    }, dwellMs);
  };

  const dispatch = (event: TourEvent) => {
    if (disposed) return;
    const s = store.getState();
    const list = stops();
    const tour = tourTransition(s.tour, event, {
      count: list.length,
      reducedMotion: s.reducedMotion,
    });
    const id = tour.status === 'off' ? null : (list[tour.index]?.nation.id ?? null);
    const patch: Partial<State> = {};
    if (tour.status !== s.tour.status || tour.index !== s.tour.index) patch.tour = tour;
    if (id !== null && selectsStop(event) && s.selectedId !== id) patch.selectedId = id;
    if (Object.keys(patch).length > 0) store.setState(patch);
    syncTimer();
  };

  const unsubscribe = store.subscribe((s: State, prev: State) => {
    if (s.tour.status === 'off') {
      clear();
      return;
    }
    const takenOver =
      s.tour.status === 'playing' &&
      ((s.selectedId !== prev.selectedId && s.selectedId !== stopId(s)) ||
        (s.reducedMotion && !prev.reducedMotion));
    if (takenOver) {
      clear();
      queueMicrotask(() => {
        const now = store.getState();
        const stillOff = now.selectedId !== stopId(now) || now.reducedMotion;
        if (now.tour.status === 'playing' && stillOff) dispatch({ type: 'interrupt' });
      });
      return;
    }
    syncTimer();
  });

  return {
    dispatch,
    stops,
    dispose() {
      disposed = true;
      clear();
      unsubscribe();
    },
  };
}
