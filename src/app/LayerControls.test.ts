// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTOUR_MIN_ZOOM } from '../map/style/layers/contours';
import { DEFAULT_LAYERS, useAppStore } from '../store/useAppStore';
import { TILT_3D_PITCH } from './controls/TiltControl';
import { LayerControls, zoomHintTarget } from './LayerControls';

/** Zoom, pitch, moveend, and camera moves that land at once. */
function fakeMap(zoom: number, pitch = 0) {
  const handlers = new Set<() => void>();
  const move = (o: { zoom?: number; pitch?: number }) => {
    if (o.zoom !== undefined) zoom = o.zoom;
    if (o.pitch !== undefined) pitch = o.pitch;
    handlers.forEach((f) => f());
  };
  return {
    getZoom: () => zoom,
    getPitch: () => pitch,
    on: (_: string, f: () => void) => handlers.add(f),
    off: (_: string, f: () => void) => handlers.delete(f),
    easeTo: vi.fn(move),
    jumpTo: vi.fn(move),
  };
}

const renderWith = (map: ReturnType<typeof fakeMap> | null) =>
  render(h(LayerControls, { onOverview: () => {}, map: map as never }));

beforeEach(() => {
  useAppStore.setState({
    layers: { ...DEFAULT_LAYERS },
    sunHour: null,
    cameraState: 'idle',
    reducedMotion: false,
  });
});
afterEach(cleanup);

describe('zoomHintTarget', () => {
  it('hints only for a switched-on layer below the zoom it shows from', () => {
    expect(zoomHintTarget('contours', true, 3.7)).toBe(CONTOUR_MIN_ZOOM + 1);
    expect(zoomHintTarget('contours', true, CONTOUR_MIN_ZOOM)).toBeNull();
    expect(zoomHintTarget('contours', false, 3.7)).toBeNull();
    expect(zoomHintTarget('hillshade', true, 4)).toBe(7);
    expect(zoomHintTarget('hillshade', true, 6.5)).toBeNull();
    expect(zoomHintTarget('imagery', true, 3.7)).toBeNull();
  });
});

describe('LayerControls hints', () => {
  it('offers to zoom in for contours, and the hint goes once the map is there', () => {
    const map = fakeMap(3.7);
    renderWith(map);
    expect(screen.queryByTestId('layer-hint-contours')).toBeNull();

    fireEvent.click(screen.getByTestId('layer-toggle-contours'));
    const hint = screen.getByTestId('layer-hint-contours');
    act(() => fireEvent.click(hint));
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: CONTOUR_MIN_ZOOM + 1 }),
    );
    expect(screen.queryByTestId('layer-hint-contours')).toBeNull();
    expect(screen.queryByTestId('layer-hint-hillshade')).toBeNull();
  });

  it('jumps instead of easing with reduced motion, and is disabled during a flight', () => {
    const map = fakeMap(3.7);
    useAppStore.setState({ reducedMotion: true });
    renderWith(map);
    act(() => fireEvent.click(screen.getByTestId('layer-hint-hillshade')));
    expect(map.jumpTo).toHaveBeenCalledWith({ zoom: 7 });
    expect(map.easeTo).not.toHaveBeenCalled();

    act(() => map.jumpTo({ zoom: 3.7 }));
    act(() => useAppStore.setState({ cameraState: 'flying' }));
    expect(screen.getByTestId<HTMLButtonElement>('layer-hint-hillshade').disabled).toBe(true);
  });

  it('says exaggeration needs 3D and tilts there', () => {
    const map = fakeMap(8, 0);
    renderWith(map);
    const slider = screen.getByTestId('exaggeration-slider');
    expect(slider.getAttribute('aria-describedby')).toBeTruthy();
    act(() => fireEvent.click(screen.getByTestId('exaggeration-hint')));
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: TILT_3D_PITCH }));
    expect(screen.queryByTestId('exaggeration-hint')).toBeNull();
    expect(slider.getAttribute('aria-describedby')).toBeNull();
  });

  it('disables the sun slider while hillshade is off, and says why', () => {
    renderWith(fakeMap(8, 60));
    const sun = screen.getByTestId<HTMLInputElement>('sun-slider');
    expect(sun.disabled).toBe(false);
    fireEvent.click(screen.getByTestId('layer-toggle-hillshade'));
    expect(sun.disabled).toBe(true);
    expect(screen.getByText(/Turn Hillshade on/)).toBeTruthy();
    expect(screen.queryByTestId('sun-reset')).toBeNull();
  });

  it('shows no camera hints before the map exists', () => {
    useAppStore.setState({ layers: { ...DEFAULT_LAYERS, contours: true } });
    renderWith(null);
    expect(screen.queryByTestId('layer-hint-contours')).toBeNull();
    expect(screen.queryByTestId('exaggeration-hint')).toBeNull();
  });
});
