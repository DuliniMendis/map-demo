import { useEffect, useRef, type RefObject } from 'react';
import type { Nation } from '../types/nation';
import type { AttributionEntry } from './attributionData';

/** PLACEHOLDER: the maintainer replaces this with their real address before launch. */
export const CORRECTIONS_EMAIL = 'corrections@example.org';

export function correctionMailto(nation: Nation | null): string {
  const subject = nation
    ? `Country map correction: ${nation.name} (${nation.id})`
    : 'Country map correction';
  const body = nation
    ? `Nation / language group: ${nation.name} (AUSTLANG ${nation.id})\nShown as: ${nation.modern.locality}, ${nation.modern.state}\n\nWhat should change, and the source:\n`
    : 'What should change, and the source:\n';
  return `mailto:${CORRECTIONS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

interface AboutProps {
  open: boolean;
  onClose: () => void;
  /** Focused when the dialog closes (the About button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  attribution: AttributionEntry[];
  /** Currently selected nation, pre-filled into the correction email. */
  nation: Nation | null;
}

/** About & Acknowledgement of Country (modal `<dialog>`: focus trap and Esc come for free). */
export function About({ open, onClose, returnFocusRef, attribution, nation }: AboutProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open && wasOpen.current) returnFocusRef?.current?.focus();
    wasOpen.current = open;
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={ref}
      className="about"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      <div className="about__inner">
        <header className="about__header">
          <h2 id="about-title">About this map</h2>
          <button type="button" className="about__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <section aria-labelledby="ack-title" className="about__ack">
          <h3 id="ack-title">Acknowledgement of Country</h3>
          <p>
            We acknowledge the Traditional Custodians of Country throughout Australia and their
            continuing connection to land, waters, sky and culture. We pay our respects to Elders
            past and present, and extend that respect to all Aboriginal and Torres Strait Islander
            peoples.
          </p>
        </section>

        <section>
          <h3>What this is</h3>
          <p>
            A 3D terrain map of Australia showing where Aboriginal and Torres Strait Islander
            nations and language groups are recorded, and what those places are called today. Pick a
            nation from the list or a marker on the map to fly to its Country.
          </p>
        </section>

        <section>
          <h3>Where the locations come from</h3>
          <ul>
            <li>
              Each language group is one <strong>approximate point</strong> from AUSTLANG, the
              Australian Indigenous languages database of AIATSIS (CC BY 4.0, via TLCMap). AUSTLANG
              records a single representative location for each language variety.
            </li>
            <li>
              “Country today” is the ABS 2021 suburb or locality (ASGS Edition 3) and the state or
              territory that the point falls in. It is a modern reference only.
            </li>
            <li>Names and spellings follow AUSTLANG; other spellings are listed as synonyms.</li>
          </ul>
        </section>

        <section>
          <h3>What this is not</h3>
          <p>
            The points do <strong>not</strong> show boundaries, the extent of anyone’s Country, or
            who speaks for a place. They are not suitable for native title, land claims or any legal
            purpose. Many nations’ Countries are far larger than a single point, and neighbouring
            groups’ Countries overlap and are understood differently by different communities.
          </p>
        </section>

        <section>
          <h3>Learn more</h3>
          <ul>
            <li>
              <a
                href="https://aiatsis.gov.au/explore/map-indigenous-australia"
                target="_blank"
                rel="noreferrer"
              >
                AIATSIS Map of Indigenous Australia
              </a>
            </li>
            <li>
              <a
                href="https://collection.aiatsis.gov.au/austlang/search"
                target="_blank"
                rel="noreferrer"
              >
                AUSTLANG — Australian Indigenous languages database
              </a>
            </li>
            <li>
              <a href="https://gambay.com.au/" target="_blank" rel="noreferrer">
                Gambay — First Languages Australia map
              </a>
            </li>
          </ul>
          <p>
            Spotted something wrong or missing?{' '}
            <a href={correctionMailto(nation)} data-testid="correction-mailto">
              Suggest a correction
            </a>
            .
          </p>
        </section>

        <section>
          <h3>Data &amp; map credits</h3>
          <ul className="about__credits">
            {attribution.map((e) => (
              <li key={e.id}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.text}
                  </a>
                ) : (
                  e.text
                )}
                {e.licence && !e.text.includes(e.licence) ? ` (${e.licence})` : null}
                {e.usedFor ? <span className="about__used-for"> — {e.usedFor}</span> : null}
              </li>
            ))}
          </ul>
          <p className="about__fineprint" data-testid="about-odbl">
            The nearby towns and landmarks on each card are © OpenStreetMap contributors and
            available under the{' '}
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noreferrer"
            >
              Open Database License (ODbL)
            </a>
            .
          </p>
          <p className="about__fineprint">
            No analytics and no cookies. Your browser only remembers that you dismissed the
            disclaimer.
          </p>
        </section>
      </div>
    </dialog>
  );
}
