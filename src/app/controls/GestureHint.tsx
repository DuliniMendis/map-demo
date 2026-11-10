// First-load hint: how to move the 3D map (mouse/trackpad or touch). Shown once per browser, after the
// Vision modal, and gone as soon as the visitor moves the map or presses "Got it".
import type * as maplibregl from 'maplibre-gl';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import './controls.css';

/** `localStorage` key: "1" once the hint has been dismissed. */
export const GESTURES_SEEN_KEY = 'country-map:gestures-seen';

export function hasSeenGestures(): boolean {
  try {
    return window.localStorage.getItem(GESTURES_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markGesturesSeen(): void {
  try {
    window.localStorage.setItem(GESTURES_SEEN_KEY, '1');
  } catch {
    // ignore: the hint shows again next visit
  }
}

const COARSE = '(pointer: coarse)';
function subscribeCoarse(cb: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isCoarse = () => typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches;

interface Gesture {
  key: string;
  label: string;
  icon: ReactNode;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ICONS = {
  drag: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
    </svg>
  ),
  scroll: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v3" />
    </svg>
  ),
  pinch: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 4l5 5M4 4v4M4 4h4M20 20l-5-5M20 20v-4M20 20h-4" />
      <circle cx="12" cy="12" r="1.6" />
    </svg>
  ),
  tilt: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 17l6-9 4 5 3-3 5 7z" />
      <path d="M16 3.5a5 5 0 0 1 4 3.5M20 7l.3-2.6M20 7l-2.5-.6" />
    </svg>
  ),
};

function gestures(touch: boolean): Gesture[] {
  return touch
    ? [
        { key: 'drag', label: 'Drag to move', icon: ICONS.drag },
        { key: 'pinch', label: 'Pinch to zoom', icon: ICONS.pinch },
        { key: 'tilt', label: 'Two fingers up or down to tilt; twist to turn', icon: ICONS.tilt },
      ]
    : [
        { key: 'drag', label: 'Drag to move', icon: ICONS.drag },
        { key: 'scroll', label: 'Scroll to zoom', icon: ICONS.scroll },
        { key: 'tilt', label: 'Right-drag or Ctrl + drag to tilt and turn', icon: ICONS.tilt },
      ];
}

type HintMap = Pick<maplibregl.Map, 'getCanvasContainer'>;

interface GestureHintProps {
  map: HintMap | null;
  /** Hold the hint back (e.g. while a dialog is open). */
  suppressed: boolean;
}

export function GestureHint({ map, suppressed }: GestureHintProps) {
  const [dismissed, setDismissed] = useState(hasSeenGestures);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const visible = !dismissed && !suppressed && map !== null;

  const dismiss = () => {
    markGesturesSeen();
    setDismissed(true);
  };

  // Picking a nation or starting the tour means they're under way (and the card needs the space).
  useEffect(() => {
    if (dismissed) return;
    const engaged = (s: ReturnType<typeof useAppStore.getState>) =>
      s.selectedId !== null || s.tour.status !== 'off';
    const done = () => {
      markGesturesSeen();
      setDismissed(true);
    };
    if (engaged(useAppStore.getState())) {
      queueMicrotask(done); // e.g. a deep link that selected a nation before the map was ready
      return;
    }
    return useAppStore.subscribe((s) => {
      if (engaged(s)) done();
    });
  }, [dismissed]);

  // Using the map is the best "got it".
  useEffect(() => {
    if (!visible || !map) return;
    const el = map.getCanvasContainer();
    const onUse = () => {
      markGesturesSeen();
      setDismissed(true);
    };
    const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
    for (const e of events) el.addEventListener(e, onUse, { passive: true });
    return () => {
      for (const e of events) el.removeEventListener(e, onUse);
    };
  }, [visible, map]);

  if (!visible) return null;

  return (
    <div
      className="gesture-hint overlay-panel"
      role="status"
      aria-label="How to move the map"
      data-testid="gesture-hint"
    >
      <ul className="gesture-hint__list">
        {gestures(touch).map((g) => (
          <li key={g.key} data-gesture={g.key}>
            <span className="gesture-hint__icon" aria-hidden="true">
              {g.icon}
            </span>
            {g.label}
          </li>
        ))}
      </ul>
      {!touch && (
        <p className="gesture-hint__keys">
          Keyboard: Tab to the map, then arrows move, + and − zoom, Shift + arrows tilt and turn.
        </p>
      )}
      <button type="button" className="btn" onClick={dismiss} data-testid="gesture-hint-dismiss">
        Got it
      </button>
    </div>
  );
}
