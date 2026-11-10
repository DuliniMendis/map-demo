import { create } from 'zustand';
import type { Nation } from '../types/nation';

// Shape is the contract in docs/contracts.md. WS0 skeleton; WS5 maintains.
export interface AppState {
  nations: Nation[]; // loaded once
  selectedId: string | null;
  hoveredId: string | null;
  cameraState: 'idle' | 'flying';
  query: string; // search text
  stateFilter: Nation['modern']['stateCode'] | 'ALL';
  layers: {
    imagery: boolean;
    labels: boolean;
    hillshade: boolean;
    relief: boolean;
    contours: boolean;
  };
  exaggeration: number; // 1.0–2.5, default 1.5
  reducedMotion: boolean; // from matchMedia
  sunHour: number | null; // Phase 3 (WS7): local solar time 5–19 lighting the terrain; null = fixed default light
  tour: TourState; // Phase 3 (WS9)
  select(id: string | null): void;
  setHovered(id: string | null): void;
  setCameraState(s: AppState['cameraState']): void;
  setQuery(q: string): void;
  setStateFilter(f: AppState['stateFilter']): void;
  toggleLayer(k: keyof AppState['layers']): void;
  setExaggeration(n: number): void;
  setSunHour(h: number | null): void;
  setTour(t: Partial<TourState>): void;
}

/** Guided tour (WS9): `index` points into the tour's stop list. */
export interface TourState {
  status: 'off' | 'playing' | 'paused';
  index: number;
}

/** Not part of the contract: one-time setter used by the app shell after `loadNations()`. */
export interface AppActions {
  setNations(nations: Nation[]): void;
}

export const EXAGGERATION_MIN = 1.0;
export const EXAGGERATION_MAX = 2.5;
export const EXAGGERATION_DEFAULT = 1.5;

export const DEFAULT_LAYERS: AppState['layers'] = {
  imagery: true,
  labels: true,
  hillshade: true,
  relief: false,
  contours: false,
};

export const SUN_HOUR_MIN = 5;
export const SUN_HOUR_MAX = 19;
export const TOUR_OFF: TourState = { status: 'off', index: 0 };

/** Clamps to SUN_HOUR_MIN–SUN_HOUR_MAX; null (and non-finite input) means the fixed default light. */
export function clampSunHour(h: number | null): number | null {
  if (h === null || !Number.isFinite(h)) return null;
  return Math.min(SUN_HOUR_MAX, Math.max(SUN_HOUR_MIN, h));
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function clampExaggeration(n: number): number {
  if (!Number.isFinite(n)) return EXAGGERATION_DEFAULT;
  return Math.min(EXAGGERATION_MAX, Math.max(EXAGGERATION_MIN, n));
}

export const useAppStore = create<AppState & AppActions>()((set) => ({
  nations: [],
  selectedId: null,
  hoveredId: null,
  cameraState: 'idle',
  query: '',
  stateFilter: 'ALL',
  layers: { ...DEFAULT_LAYERS },
  exaggeration: EXAGGERATION_DEFAULT,
  reducedMotion: prefersReducedMotion(),
  sunHour: null,
  tour: { ...TOUR_OFF },

  setNations: (nations) => set({ nations }),
  select: (selectedId) => set({ selectedId }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setCameraState: (cameraState) => set({ cameraState }),
  setQuery: (query) => set({ query }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setExaggeration: (n) => set({ exaggeration: clampExaggeration(n) }),
  setSunHour: (h) => set({ sunHour: clampSunHour(h) }),
  setTour: (t) => set((s) => ({ tour: { ...s.tour, ...t } })),
}));

// Keep reducedMotion in sync if the OS setting changes while the app is open.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window
    .matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', (e) => useAppStore.setState({ reducedMotion: e.matches }));
}
