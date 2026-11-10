// Guided tour UI (WS9): the "Tour" button and the panel over the map. Logic lives in driver.ts / machine.ts.
import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { createTourDriver, type TourDriver } from './driver';
import { isAtEnd } from './machine';
import { narration } from './stops';

let shared: TourDriver | null = null;

/** One driver for the app's store, created on first use and kept for the page's lifetime. */
export function tourDriver(): TourDriver {
  shared ??= createTourDriver(useAppStore);
  return shared;
}

const MAP_SELECTOR = '[data-testid="map-canvas"]';
/** Pointer travel that counts as dragging the map (a plain click on a marker selects it instead). */
const DRAG_PX = 4;

export function TourButton() {
  const active = useAppStore((s) => s.tour.status !== 'off');
  const ready = useAppStore((s) => s.nations.length > 0);
  return (
    <button
      type="button"
      className="btn overlay-panel tour-button"
      data-testid="tour-button"
      aria-pressed={active}
      disabled={!ready}
      onClick={() => {
        if (active) {
          document.querySelector<HTMLElement>('[data-testid="tour-panel"]')?.focus();
          return;
        }
        tourDriver().dispatch({ type: 'start' });
      }}
    >
      Tour
    </button>
  );
}

export interface TourPanelProps {
  /** The About dialog is open: opening it pauses the tour. */
  aboutOpen: boolean;
  /** Clears the selection and flies back to the overview (App's "Overview" action). */
  onOverview: () => void;
}

export function TourPanel({ aboutOpen, onOverview }: TourPanelProps) {
  const tour = useAppStore((s) => s.tour);
  useAppStore((s) => s.nations); // re-render once the data loads (the stops are resolved from it)
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const active = tour.status !== 'off';

  // Opening About takes over.
  useEffect(() => {
    if (aboutOpen) tourDriver().dispatch({ type: 'interrupt' });
  }, [aboutOpen]);

  // Esc anywhere, or dragging / wheeling / keyboard-panning the map, takes over.
  useEffect(() => {
    if (!active) return;
    const pause = () => tourDriver().dispatch({ type: 'interrupt' });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pause();
    };
    document.addEventListener('keydown', onKey);
    const map = document.querySelector<HTMLElement>(MAP_SELECTOR);
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      // Zoom / compass buttons move the camera too.
      if (e.target instanceof Element && e.target.closest('.maplibregl-ctrl')) pause();
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) {
        down = null;
        pause();
      }
    };
    const onUp = () => {
      down = null;
    };
    const onMapKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Tab') pause();
    };
    map?.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    map?.addEventListener('wheel', pause, { passive: true });
    map?.addEventListener('keydown', onMapKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      map?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      map?.removeEventListener('wheel', pause);
      map?.removeEventListener('keydown', onMapKey);
    };
  }, [active]);

  if (!active) return null;
  const stops = tourDriver().stops();
  const stop = stops[tour.index];
  if (!stop) return null;

  const count = stops.length;
  const playing = tour.status === 'playing';
  const atEnd = isAtEnd(tour, count);
  const dispatch = tourDriver().dispatch;

  const end = () => {
    dispatch({ type: 'stop' });
    onOverview();
    document.querySelector<HTMLElement>('[data-testid="tour-button"]')?.focus();
  };
  // Esc inside the panel only pauses: keep the info card open (App closes it on an unhandled Esc).
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch({ type: 'interrupt' });
    }
  };

  let playLabel = playing ? 'Pause' : atEnd ? 'Replay' : 'Play';
  if (reducedMotion && !playing) playLabel = 'Play';

  return (
    <section
      className="tour-panel overlay-panel"
      data-testid="tour-panel"
      aria-label="Guided tour"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div aria-live="polite" aria-atomic="true">
        <p className="tour-panel__count">
          Stop {tour.index + 1} of {count}
          {atEnd && !playing ? ' · end of tour' : ''}
        </p>
        <h2 className="tour-panel__title">{stop.nation.name}</h2>
        <p className="tour-panel__narration" data-testid="tour-narration">
          {narration(stop)}
        </p>
      </div>
      <div className="tour-panel__controls">
        <button
          type="button"
          className="btn"
          data-testid="tour-prev"
          onClick={() => dispatch({ type: 'prev' })}
          disabled={tour.index === 0}
          aria-label="Previous stop"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="btn"
          data-testid="tour-pause"
          onClick={() => dispatch({ type: 'toggle' })}
          disabled={reducedMotion && !playing}
          title={reducedMotion ? 'Auto-play is off while reduced motion is on' : undefined}
        >
          {playLabel}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="tour-next"
          onClick={() => dispatch({ type: 'next' })}
          disabled={atEnd}
          aria-label="Next stop"
        >
          Next ›
        </button>
        <button type="button" className="btn" data-testid="tour-stop" onClick={end}>
          End tour
        </button>
      </div>
      <p className="tour-panel__note">Approximate locations from AUSTLANG.</p>
    </section>
  );
}
