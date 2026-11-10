// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { GESTURES_SEEN_KEY, GestureHint } from './GestureHint';
import { TILT_3D_PITCH, TiltControl, isFlat, tiltTarget } from './TiltControl';

/** Just enough of a MapLibre map: a pitch, events, and camera moves that land at once. */
function fakeMap(pitch = 0) {
  const handlers = new Map<string, Set<() => void>>();
  const container = document.createElement('div');
  const fire = (type: string) => handlers.get(type)?.forEach((f) => f());
  const move = (o: { pitch?: number }) => {
    if (o.pitch !== undefined) pitch = o.pitch;
    fire('pitch');
    fire('moveend');
  };
  return {
    getPitch: () => pitch,
    on: (type: string, f: () => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(f);
    },
    off: (type: string, f: () => void) => handlers.get(type)?.delete(f),
    easeTo: vi.fn(move),
    jumpTo: vi.fn(move),
    getCanvasContainer: () => container,
    setPitch(p: number) {
      pitch = p;
      fire('pitch');
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ cameraState: 'idle', reducedMotion: false, selectedId: null });
});
afterEach(cleanup);

describe('tilt', () => {
  it('2D looks straight down, north up; 3D tilts and keeps the heading', () => {
    expect(tiltTarget('2d')).toEqual({ pitch: 0, bearing: 0 });
    expect(tiltTarget('3d')).toEqual({ pitch: TILT_3D_PITCH });
    expect(isFlat(0)).toBe(true);
    expect(isFlat(30)).toBe(false);
  });

  it('switches the camera and follows it when the visitor tilts by hand', () => {
    const map = fakeMap(0);
    // The fake satisfies the subset of the map the control uses.
    render(h(TiltControl, { map: map as never }));
    const b2 = screen.getByTestId('tilt-2d');
    const b3 = screen.getByTestId('tilt-3d');
    expect(b2.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(b3);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: TILT_3D_PITCH }));
    expect(b3.getAttribute('aria-pressed')).toBe('true');

    act(() => map.setPitch(2));
    expect(b2.getAttribute('aria-pressed')).toBe('true');
  });

  it('jumps instead of easing with reduced motion, and waits out a flight', () => {
    const map = fakeMap(60);
    useAppStore.setState({ reducedMotion: true });
    render(h(TiltControl, { map: map as never }));
    fireEvent.click(screen.getByTestId('tilt-2d'));
    expect(map.jumpTo).toHaveBeenCalledWith({ pitch: 0, bearing: 0 });
    expect(map.easeTo).not.toHaveBeenCalled();

    act(() => useAppStore.setState({ cameraState: 'flying' }));
    expect((screen.getByTestId('tilt-3d') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('gesture hint', () => {
  it('waits for the map and for dialogs to close', () => {
    const map = fakeMap();
    const { rerender } = render(h(GestureHint, { map: null, suppressed: false }));
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
    rerender(h(GestureHint, { map: map as never, suppressed: true }));
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
    rerender(h(GestureHint, { map: map as never, suppressed: false }));
    expect(screen.getByTestId('gesture-hint').textContent).toMatch(/Scroll to zoom/);
  });

  it('goes away for good once the visitor uses the map', () => {
    const map = fakeMap();
    render(h(GestureHint, { map: map as never, suppressed: false }));
    act(() => {
      map.getCanvasContainer().dispatchEvent(new Event('pointerdown'));
    });
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
    expect(localStorage.getItem(GESTURES_SEEN_KEY)).toBe('1');
  });

  it('"Got it" dismisses it, and it does not come back', () => {
    const map = fakeMap();
    const first = render(h(GestureHint, { map: map as never, suppressed: false }));
    fireEvent.click(screen.getByTestId('gesture-hint-dismiss'));
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
    first.unmount();
    render(h(GestureHint, { map: map as never, suppressed: false }));
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
  });

  it('steps aside for good once a nation is picked', () => {
    render(h(GestureHint, { map: fakeMap() as never, suppressed: false }));
    expect(screen.getByTestId('gesture-hint')).toBeTruthy();
    act(() => useAppStore.setState({ selectedId: 'L4' }));
    expect(screen.queryByTestId('gesture-hint')).toBeNull();
    expect(localStorage.getItem(GESTURES_SEEN_KEY)).toBe('1');
  });

  it('shows touch gestures on touch screens', () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q === '(pointer: coarse)',
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      render(h(GestureHint, { map: fakeMap() as never, suppressed: false }));
      const text = screen.getByTestId('gesture-hint').textContent;
      expect(text).toMatch(/Pinch to zoom/);
      expect(text).not.toMatch(/Keyboard/);
    } finally {
      window.matchMedia = mm;
    }
  });
});
