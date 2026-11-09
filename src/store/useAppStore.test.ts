import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, EXAGGERATION_DEFAULT, useAppStore } from './useAppStore';

const initial = useAppStore.getState();

describe('useAppStore', () => {
  beforeEach(() => useAppStore.setState(initial, true));

  it('has contract defaults', () => {
    const s = useAppStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.cameraState).toBe('idle');
    expect(s.stateFilter).toBe('ALL');
    expect(s.layers).toEqual(DEFAULT_LAYERS);
    expect(s.exaggeration).toBe(EXAGGERATION_DEFAULT);
    expect(s.reducedMotion).toBe(false); // no matchMedia in node
  });

  it('toggles a layer without touching the others', () => {
    useAppStore.getState().toggleLayer('relief');
    expect(useAppStore.getState().layers).toEqual({ ...DEFAULT_LAYERS, relief: true });
  });

  it('clamps exaggeration to 1.0–2.5', () => {
    const { setExaggeration } = useAppStore.getState();
    setExaggeration(9);
    expect(useAppStore.getState().exaggeration).toBe(2.5);
    setExaggeration(0.2);
    expect(useAppStore.getState().exaggeration).toBe(1.0);
    setExaggeration(Number.NaN);
    expect(useAppStore.getState().exaggeration).toBe(EXAGGERATION_DEFAULT);
  });

  it('selects and clears', () => {
    useAppStore.getState().select('L3');
    expect(useAppStore.getState().selectedId).toBe('L3');
    useAppStore.getState().select(null);
    expect(useAppStore.getState().selectedId).toBeNull();
  });
});
