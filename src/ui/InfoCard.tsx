import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Nation } from '../types/nation';
import { Disclaimer } from './Disclaimer';
import './ui.css';

/** Synonym chips shown before "+n more". */
export const MAX_SYNONYMS = 8;

export interface InfoCardProps {
  nation: Nation;
  /** Close (×) button and Esc inside the card. */
  onClose(): void;
  /** "Back to overview" button; omitted → no button. */
  onBackToOverview?(): void;
  className?: string;
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(2)}° ${value < 0 ? neg : pos}`;
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="cm-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="cm-visually-hidden"> (opens in a new tab)</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="cm-link__icon">
        <path
          d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

export function InfoCard({ nation, onClose, onBackToOverview, className }: InfoCardProps) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const [prevId, setPrevId] = useState(nation.id);
  if (nation.id !== prevId) {
    setPrevId(nation.id);
    setShowAll(false);
  }

  const title = nation.peopleName || nation.name;
  const synonyms = showAll ? nation.synonyms : nation.synonyms.slice(0, MAX_SYNONYMS);
  const hidden = nation.synonyms.length - MAX_SYNONYMS;

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <section
      className={['cm-info-card', className].filter(Boolean).join(' ')}
      data-testid="info-card"
      aria-labelledby={`${id}-title`}
      onKeyDown={handleKeyDown}
    >
      <header className="cm-info-card__header">
        <div>
          <p className="cm-eyebrow">
            AUSTLANG <span className="cm-code">{nation.id}</span>
          </p>
          <h2 id={`${id}-title`} className="cm-info-card__title">
            {title}
          </h2>
          {nation.peopleName && nation.peopleName !== nation.name && (
            <p className="cm-info-card__subtitle">
              <span className="cm-muted">Language:</span> {nation.name}
            </p>
          )}
        </div>
        <button
          type="button"
          className="cm-icon-button"
          aria-label={`Close details for ${title}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path
              d="m5.5 5.5 9 9m0-9-9 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <dl className="cm-info-card__facts">
        <div className="cm-fact cm-fact--today">
          <dt>Country today</dt>
          <dd>
            <span className="cm-place">
              <span data-testid="info-locality">{nation.modern.locality}</span>,{' '}
              <span data-testid="info-state">{nation.modern.state}</span>
            </span>
            <span className="cm-fact__note">Suburb/locality boundary from ABS 2021</span>
          </dd>
        </div>
        <div className="cm-fact">
          <dt>Approximate centre</dt>
          <dd>
            {formatCoord(nation.lat, 'N', 'S')}, {formatCoord(nation.lng, 'E', 'W')}
          </dd>
        </div>
        {nation.synonyms.length > 0 && (
          <div className="cm-fact">
            <dt id={`${id}-syn`}>Also known as</dt>
            <dd>
              <ul className="cm-chips" aria-labelledby={`${id}-syn`}>
                {synonyms.map((s, i) => (
                  <li key={`${i}-${s}`} className="cm-chip">
                    {s}
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button
                  type="button"
                  className="cm-text-button"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? 'Show fewer' : `+${hidden} more`}
                  <span className="cm-visually-hidden"> names</span>
                </button>
              )}
            </dd>
          </div>
        )}
      </dl>

      <ul className="cm-info-card__links">
        <li>
          <ExternalLink href={nation.links.austlang}>AUSTLANG entry</ExternalLink>
        </li>
        {nation.links.wikipedia && (
          <li>
            <ExternalLink href={nation.links.wikipedia}>Wikipedia</ExternalLink>
          </li>
        )}
      </ul>

      <Disclaimer variant="inline" />

      {onBackToOverview && (
        <div className="cm-info-card__actions">
          <button type="button" className="cm-button" onClick={onBackToOverview}>
            Back to overview
          </button>
        </div>
      )}
    </section>
  );
}
