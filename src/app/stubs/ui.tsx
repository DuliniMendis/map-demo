// TEMPORARY STUBS (WS5) for WS4's `src/ui/{SidePanel,InfoCard,Disclaimer}.tsx`. Delete when WS4
// lands; see ./README.md. Props and data-testids match docs/contracts.md; behaviour is minimal
// (no virtualisation, no keyboard roving, no debounce).
import { useState } from 'react';
import './stubs.css';
import { useAppStore } from '../../store/useAppStore';
import { STATE_CODES, type Nation } from '../../types/nation';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function filterNations(nations: Nation[], query: string, stateFilter: string): Nation[] {
  const q = fold(query.trim());
  return nations.filter(
    (n) =>
      (stateFilter === 'ALL' || n.modern.stateCode === stateFilter) &&
      (!q ||
        [n.name, ...n.synonyms, n.modern.locality, n.modern.state].some((t) =>
          fold(t).includes(q),
        )),
  );
}

/** Container: reads the store itself (contract). */
export function SidePanel() {
  const nations = useAppStore((s) => s.nations);
  const query = useAppStore((s) => s.query);
  const stateFilter = useAppStore((s) => s.stateFilter);
  const selectedId = useAppStore((s) => s.selectedId);
  const { setQuery, setStateFilter, select, setHovered } = useAppStore.getState();
  const items = filterNations(nations, query, stateFilter);

  return (
    <div className="stub-panel" data-testid="side-panel">
      <h1 className="stub-panel__title">Nations &amp; language groups</h1>
      <div className="stub-panel__search">
        <input
          type="search"
          aria-label="Search nations, language groups or places"
          placeholder="Search nations, places…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="search-input"
        />
        <select
          aria-label="Filter by state or territory"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
          data-testid="state-filter"
        >
          <option value="ALL">All</option>
          {STATE_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <ul className="stub-panel__list" role="listbox" aria-label="Nations & language groups">
        {items.map((n) => (
          <li
            key={n.id}
            role="option"
            aria-selected={n.id === selectedId}
            tabIndex={0}
            data-testid={`nation-item-${n.id}`}
            onClick={() => select(n.id)}
            onKeyDown={(e) => e.key === 'Enter' && select(n.id)}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <span>{n.name}</span>
            <small>
              {n.modern.locality}, {n.modern.stateCode}
            </small>
          </li>
        ))}
      </ul>
      <p className="stub-panel__footer">{nations.length} language groups · AUSTLANG © AIATSIS</p>
    </div>
  );
}

export function InfoCard({ nation, onClose }: { nation: Nation; onClose: () => void }) {
  return (
    <section className="stub-card" data-testid="info-card" aria-label={nation.name}>
      <button type="button" className="stub-card__close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2>{nation.peopleName ?? nation.name}</h2>
      {nation.peopleName && <p className="stub-card__lang">Language: {nation.name}</p>}
      <p>
        <strong>Country today:</strong>{' '}
        <span data-testid="info-locality">{nation.modern.locality}</span>,{' '}
        <span data-testid="info-state">{nation.modern.state}</span>
      </p>
      <p>
        <a href={nation.links.austlang} target="_blank" rel="noreferrer">
          AUSTLANG entry
        </a>
      </p>
      <Disclaimer variant="inline" />
    </section>
  );
}

const DISMISS_KEY = 'country-map:disclaimer-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function Disclaimer({ variant }: { variant: 'banner' | 'inline' }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const text =
    'Locations are approximate single points from AUSTLANG and do not represent boundaries or native title.';
  if (variant === 'inline') return <p className="stub-disclaimer--inline">{text}</p>;
  if (dismissed) return null;
  return (
    <div className="stub-disclaimer--banner" role="note">
      <span>{text}</span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* storage unavailable: dismiss for this session only */
          }
          setDismissed(true);
        }}
      >
        OK
      </button>
    </div>
  );
}
