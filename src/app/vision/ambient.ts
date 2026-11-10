// Ambient sound on/off for the whole app: remembers the choice, starts on the first user gesture
// (browsers block audio before one), and goes quiet while the tab is hidden.
import { useSyncExternalStore } from 'react';
import { createSoundEngine, type SoundEngine } from './soundscape';

/** `localStorage` key: "1" when the visitor turned the sound off. */
export const SOUND_MUTED_KEY = 'country-map:sound-muted';

export interface AmbientState {
  /** The visitor's choice (persisted). Sound is on unless they turned it off. */
  muted: boolean;
  /** Sound is actually playing (on, started by a gesture, and the browser allowed it). */
  playing: boolean;
  /** This browser can't play it (no Web Audio). */
  unsupported: boolean;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(SOUND_MUTED_KEY, '1');
    else window.localStorage.removeItem(SOUND_MUTED_KEY);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}

const GESTURES = ['pointerup', 'keydown', 'touchend', 'click'] as const;

export interface Ambient {
  getState(): AmbientState;
  subscribe(cb: () => void): () => void;
  /** Call from a click/key handler: starts the sound if it is on. */
  play(): void;
  setMuted(muted: boolean): void;
  toggle(): void;
  /** Start on the first gesture anywhere on the page (if on). Returns a cleanup. */
  armOnFirstGesture(): () => void;
}

export function createAmbient(makeEngine: () => SoundEngine | null = createSoundEngine): Ambient {
  let engine: SoundEngine | null | undefined; // undefined: not created yet
  let state: AmbientState = { muted: readMuted(), playing: false, unsupported: false };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<AmbientState>) => {
    const next = { ...state, ...patch };
    if (
      next.muted === state.muted &&
      next.playing === state.playing &&
      next.unsupported === state.unsupported
    )
      return;
    state = next;
    for (const l of listeners) l();
  };

  const getEngine = () => {
    if (engine === undefined) {
      engine = makeEngine();
      if (!engine) set({ unsupported: true });
    }
    return engine;
  };

  const onVisibility = () => {
    const e = engine;
    if (!e || state.muted) return;
    if (document.hidden) e.pause();
    else e.resume();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  const play = () => {
    if (state.muted) return;
    const e = getEngine();
    if (!e) return;
    e.start();
    // resume() is async and may be refused until a gesture; armOnFirstGesture keeps retrying until
    // the context runs, so the button can show "on" straight away.
    set({ playing: true });
  };

  const setMuted = (muted: boolean) => {
    writeMuted(muted);
    set({ muted });
    if (muted) {
      engine?.stop();
      set({ playing: false });
    } else {
      play();
    }
  };

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    play,
    setMuted,
    toggle: () => setMuted(!state.muted),
    armOnFirstGesture() {
      if (typeof window === 'undefined') return () => {};
      const onGesture = () => {
        if (state.muted) return; // stay armed: turning sound on later goes through setMuted
        play();
        if (engine === null || engine?.running()) disarm();
      };
      const disarm = () => {
        for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
      };
      for (const g of GESTURES) window.addEventListener(g, onGesture, true);
      return disarm;
    },
  };
}

let shared: Ambient | null = null;
/** The app's one ambient-sound controller. */
export function ambient(): Ambient {
  shared ??= createAmbient();
  return shared;
}

export function useAmbient(a: Ambient = ambient()): AmbientState {
  return useSyncExternalStore(a.subscribe, a.getState, a.getState);
}
