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
  layers: { imagery: boolean; labels: boolean; hillshade: boolean; relief: boolean };
  exaggeration: number; // 1.0–2.5, default 1.5
  reducedMotion: boolean; // from matchMedia
  select(id: string | null): void;
  setHovered(id: string | null): void;
  setCameraState(s: AppState['cameraState']): void;
  setQuery(q: string): void;
  setStateFilter(f: AppState['stateFilter']): void;
  toggleLayer(k: keyof AppState['layers']): void;
  setExaggeration(n: number): void;
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
};

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

  setNations: (nations) => set({ nations }),
  select: (selectedId) => set({ selectedId }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setCameraState: (cameraState) => set({ cameraState }),
  setQuery: (query) => set({ query }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setExaggeration: (n) => set({ exaggeration: clampExaggeration(n) }),
}));

// Keep reducedMotion in sync if the OS setting changes while the app is open.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window
    .matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', (e) => useAppStore.setState({ reducedMotion: e.matches }));
}
