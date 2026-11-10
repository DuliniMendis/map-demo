// Landing "Vision" modal (shown on a first visit, reopened from the Vision button) and the sound toggle.
import { useEffect, useRef, type RefObject } from 'react';
import { ambient, useAmbient, type Ambient } from './ambient';
import landscapeUrl from './landscape.svg';
import './vision.css';

/** `localStorage` key: "1" once the visitor has closed the Vision modal. */
export const VISION_SEEN_KEY = 'country-map:vision-seen';

export function hasSeenVision(): boolean {
  try {
    return window.localStorage.getItem(VISION_SEEN_KEY) === '1';
  } catch {
    return false; // storage blocked: show it (it is only shown once per visit then)
  }
}

export function markVisionSeen(): void {
  try {
    window.localStorage.setItem(VISION_SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

interface VisionProps {
  open: boolean;
  onClose: () => void;
  /** Close and start the guided tour; omitted (button hidden) until nations have loaded. */
  onStartTour?: () => void;
  /** Focused when the dialog closes (the Vision button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** For tests. */
  sound?: Ambient;
}

export function Vision({
  open,
  onClose,
  onStartTour,
  returnFocusRef,
  sound = ambient(),
}: VisionProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);
  const { muted, unsupported } = useAmbient(sound);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // jsdom has no showModal; browsers all do.
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
    if (!open && wasOpen.current) returnFocusRef?.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, returnFocusRef]);

  const enter = () => {
    sound.play(); // a click: browsers allow audio to start here
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="vision"
      aria-labelledby="vision-title"
      aria-describedby="vision-lede"
      data-testid="vision-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      <figure className="vision__art">
        <img
          src={landscapeUrl}
          alt="Drawing of a low yellow sun over red-earth ranges, with a river winding out of the hills between river red gums."
          width={1200}
          height={560}
          decoding="async"
        />
        <button type="button" className="vision__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </figure>

      <div className="vision__body">
        <p className="vision__eyebrow">The vision</p>
        <h2 id="vision-title">Every part of this land is Country</h2>
        <p id="vision-lede" className="vision__lede">
          Long before the names on today’s maps, this continent was — and still is — the Country of
          hundreds of Aboriginal and Torres Strait Islander nations, each with its own languages,
          law, stories and connection to land, waters and sky.
        </p>

        <ul className="vision__pillars">
          <li>
            <strong>See the land</strong>
            <span>
              Fly across the ranges, rivers and deserts in 3D, and arrive where a nation’s Country
              is recorded.
            </span>
          </li>
          <li>
            <strong>Learn the names</strong>
            <span>
              Put the nations and language groups next to the towns and places you already know.
            </span>
          </li>
          <li>
            <strong>Listen with respect</strong>
            <span>
              This map is a starting point. The points are approximate, and the knowledge belongs to
              communities — seek out their own voices and language centres.
            </span>
          </li>
        </ul>

        {!unsupported && (
          <label className="vision__sound">
            <input
              type="checkbox"
              role="switch"
              checked={!muted}
              onChange={(e) => sound.setMuted(!e.currentTarget.checked)}
              data-testid="vision-sound"
            />
            <span>
              <strong>Sounds of Country</strong> — birdsong, a running creek and wind. Turn it off
              any time with the speaker button.
            </span>
          </label>
        )}

        <div className="vision__actions">
          <button
            type="button"
            className="vision__primary"
            onClick={enter}
            data-testid="vision-enter"
          >
            Explore the map
          </button>
          {onStartTour && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                sound.play();
                onStartTour();
              }}
              data-testid="vision-tour"
            >
              Take the tour
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** Speaker button over the map: turns the ambient sound on and off. */
export function SoundToggle({ sound = ambient() }: { sound?: Ambient }) {
  const { muted, playing, unsupported } = useAmbient(sound);
  if (unsupported) return null;
  const on = !muted;
  return (
    <button
      type="button"
      className="btn overlay-panel sound-toggle"
      aria-pressed={on}
      aria-label={on ? 'Turn ambient sound off' : 'Turn ambient sound on'}
      title={on ? 'Sound on — birds, water and wind' : 'Sound off'}
      data-testid="sound-toggle"
      data-playing={playing}
      onClick={() => sound.toggle()}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {on ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
            <path d="M18.2 6.5a8 8 0 0 1 0 11" />
          </g>
        ) : (
          <path
            d="M16 9.5l5 5m0-5l-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
