// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_MUTED_KEY, createAmbient } from './ambient';
import type { SoundEngine } from './soundscape';
import { SoundToggle, VISION_SEEN_KEY, Vision, hasSeenVision, markVisionSeen } from './Vision';

function fakeEngine() {
  let running = false;
  const engine = {
    start: vi.fn(() => {
      running = true;
    }),
    stop: vi.fn(() => {
      running = false;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    running: () => running,
  } satisfies SoundEngine;
  return engine;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('first visit', () => {
  it('is remembered once the modal has been seen', () => {
    expect(hasSeenVision()).toBe(false);
    markVisionSeen();
    expect(localStorage.getItem(VISION_SEEN_KEY)).toBe('1');
    expect(hasSeenVision()).toBe(true);
  });
});

describe('ambient sound', () => {
  it('is on by default and starts when asked from a gesture', () => {
    const engine = fakeEngine();
    const a = createAmbient(() => engine);
    expect(a.getState()).toMatchObject({ muted: false, playing: false });
    a.play();
    expect(engine.start).toHaveBeenCalledOnce();
    expect(a.getState().playing).toBe(true);
  });

  it('turning it off stops it and is remembered; a muted visitor never hears it start', () => {
    const engine = fakeEngine();
    const a = createAmbient(() => engine);
    a.play();
    a.toggle();
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(a.getState()).toMatchObject({ muted: true, playing: false });
    expect(localStorage.getItem(SOUND_MUTED_KEY)).toBe('1');

    const next = fakeEngine();
    const b = createAmbient(() => next);
    expect(b.getState().muted).toBe(true);
    b.play();
    expect(next.start).not.toHaveBeenCalled();
    b.toggle();
    expect(next.start).toHaveBeenCalledOnce();
    expect(localStorage.getItem(SOUND_MUTED_KEY)).toBeNull();
  });

  it('starts on the first click anywhere, then stops listening', () => {
    const engine = fakeEngine();
    const a = createAmbient(() => engine);
    const disarm = a.armOnFirstGesture();
    window.dispatchEvent(new Event('click'));
    window.dispatchEvent(new Event('click'));
    expect(engine.start).toHaveBeenCalledOnce();
    disarm();
  });

  it('hides the toggle where Web Audio is missing', () => {
    const a = createAmbient(() => null);
    a.play();
    expect(a.getState().unsupported).toBe(true);
    render(h(SoundToggle, { sound: a }));
    expect(screen.queryByTestId('sound-toggle')).toBeNull();
  });

  it('the toggle shows and flips the state', () => {
    const a = createAmbient(() => fakeEngine());
    render(h(SoundToggle, { sound: a }));
    const btn = screen.getByTestId('sound-toggle');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Turn ambient sound on');
  });
});

describe('Vision modal', () => {
  it('"Explore the map" starts the sound and closes', () => {
    const engine = fakeEngine();
    const a = createAmbient(() => engine);
    const onClose = vi.fn();
    render(h(Vision, { open: true, onClose, sound: a }));
    expect(
      screen.getByRole('heading', { name: 'Every part of this land is Country' }),
    ).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/river red gums/);
    fireEvent.click(screen.getByTestId('vision-enter'));
    expect(engine.start).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('the sound switch turns sound off before entering', () => {
    const engine = fakeEngine();
    const a = createAmbient(() => engine);
    render(h(Vision, { open: true, onClose: () => {}, sound: a }));
    fireEvent.click(screen.getByTestId('vision-sound'));
    expect(a.getState().muted).toBe(true);
    fireEvent.click(screen.getByTestId('vision-enter'));
    expect(engine.start).not.toHaveBeenCalled();
  });

  it('offers the tour only once it can start', () => {
    const a = createAmbient(() => fakeEngine());
    const { rerender } = render(h(Vision, { open: true, onClose: () => {}, sound: a }));
    expect(screen.queryByTestId('vision-tour')).toBeNull();
    const onStartTour = vi.fn();
    rerender(h(Vision, { open: true, onClose: () => {}, onStartTour, sound: a }));
    fireEvent.click(screen.getByTestId('vision-tour'));
    expect(onStartTour).toHaveBeenCalledOnce();
  });
});
