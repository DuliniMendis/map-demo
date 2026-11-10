import { useState } from 'react';
import './ui.css';

export const DISCLAIMER_TEXT =
  'Locations are approximate single points from AUSTLANG and do not represent boundaries or native title.';

/** `localStorage` key for the banner dismissal (the app also stores the Vision and sound choices). */
export const DISCLAIMER_STORAGE_KEY = 'country-map:disclaimer-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISCLAIMER_STORAGE_KEY) === '1';
  } catch {
    return false; // storage blocked (private mode, sandboxed iframe…): show the banner
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1');
  } catch {
    // ignore: the banner just comes back next visit
  }
}

export interface DisclaimerProps {
  /** `banner`: first-visit notice with a dismiss button (remembered). `inline`: one sentence. */
  variant: 'banner' | 'inline';
  className?: string;
}

export function Disclaimer({ variant, className }: DisclaimerProps) {
  const [dismissed, setDismissed] = useState(() => variant === 'banner' && readDismissed());

  if (variant === 'inline') {
    return (
      <p className={['cm-disclaimer-inline', className].filter(Boolean).join(' ')}>
        {DISCLAIMER_TEXT}
      </p>
    );
  }
  if (dismissed) return null;

  return (
    <div
      className={['cm-disclaimer-banner', className].filter(Boolean).join(' ')}
      role="note"
      aria-label="About these locations"
      data-testid="disclaimer-banner"
    >
      <p>
        <strong>Approximate locations.</strong> {DISCLAIMER_TEXT} Names and spellings follow
        AUSTLANG.
      </p>
      <button
        type="button"
        className="cm-button cm-button--quiet"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
      >
        Got it
      </button>
    </div>
  );
}
