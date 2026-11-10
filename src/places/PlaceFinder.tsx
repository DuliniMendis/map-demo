// "Find a suburb or address" box plus the "Whose Country is this?" panel (docs/places.md).
// Search: Photon (OpenStreetMap). Country: Native Land Digital territories at the searched place,
// or at the map centre once you zoom in to COUNTRY_MIN_ZOOM.
import type * as maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { NATIVE_LAND_SITE, nativeLandKey, territoriesAt, type Territory } from './nativeLand';
import { MIN_QUERY_LENGTH, searchPlaces, type PlaceResult } from './photon';
import { createPlacePin, setTerritories } from './territoryLayer';
import './places.css';

/** Zoomed in at least this far, the panel follows the map centre. */
export const COUNTRY_MIN_ZOOM = 9;
const SEARCH_DEBOUNCE_MS = 350;
const LOOKUP_DEBOUNCE_MS = 500;

type Focus =
  | { kind: 'place'; lng: number; lat: number; label: string }
  | { kind: 'centre'; lng: number; lat: number };

type Lookup =
  | { status: 'loading' }
  | { status: 'ok'; territories: Territory[] }
  | { status: 'error'; message: string }
  | { status: 'nokey' };

export interface PlaceFinderProps {
  map: maplibregl.Map | null;
  /** Layout class for the overlay slot (set by the app shell). */
  className?: string;
}

export function PlaceFinder({ map, className }: PlaceFinderProps) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [retry, setRetry] = useState(0);
  /** True while a camera move we started is running, so its `moveend` doesn't drop the place. */
  const ourFlight = useRef(false);

  // Follow the map: after any move that isn't our own flight, use the centre (or nothing when far out).
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMoveEnd = (e: { originalEvent?: unknown }) => {
      const ours = ourFlight.current && !e.originalEvent;
      ourFlight.current = false;
      if (ours) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (map.getZoom() < COUNTRY_MIN_ZOOM) {
          setFocus((f) => (f === null ? f : null));
          return;
        }
        const c = map.getCenter();
        setFocus({ kind: 'centre', lng: c.lng, lat: c.lat });
      }, LOOKUP_DEBOUNCE_MS);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      clearTimeout(timer);
      map.off('moveend', onMoveEnd);
    };
  }, [map]);

  // Look up the territories at the focus point.
  useEffect(() => {
    if (!focus) return;
    const key = nativeLandKey();
    const ctrl = new AbortController();
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      if (!key) {
        setLookup({ status: 'nokey' });
        return;
      }
      setLookup({ status: 'loading' });
      territoriesAt(focus.lng, focus.lat, { key, signal: ctrl.signal }).then(
        (territories) => setLookup({ status: 'ok', territories }),
        (err: unknown) => {
          if (ctrl.signal.aborted) return;
          setLookup({
            status: 'error',
            message: err instanceof Error ? err.message : 'Lookup failed',
          });
        },
      );
    });
    return () => ctrl.abort();
  }, [focus, retry]);

  // Draw the shapes for the current answer; clear them when there's no focus.
  const shown = focus && lookup?.status === 'ok' ? lookup.territories : null;
  useEffect(() => {
    if (map) setTerritories(map, shown ?? []);
  }, [map, shown]);

  // Pin on the searched place; it stays (as a reference) until the search is cleared.
  const [pinned, setPinned] = useState<PlaceResult | null>(null);
  useEffect(() => {
    if (!map || !pinned) return;
    const pin = createPlacePin().setLngLat([pinned.lng, pinned.lat]).addTo(map);
    return () => {
      pin.remove();
    };
  }, [map, pinned]);

  const goTo = useCallback(
    (place: PlaceResult) => {
      const store = useAppStore.getState();
      store.select(null);
      if (store.tour.status === 'playing') store.setTour({ status: 'paused' });
      setDismissed(false);
      setPinned(place);
      setFocus({ kind: 'place', lng: place.lng, lat: place.lat, label: place.label });
      if (!map) return;
      const duration = store.reducedMotion ? 0 : 2400;
      const pitch = Math.max(map.getPitch(), 45);
      ourFlight.current = true;
      if (place.bounds) {
        map.fitBounds(place.bounds, { padding: 80, maxZoom: 15, pitch, duration });
      } else {
        map.flyTo({ center: [place.lng, place.lat], zoom: 16, pitch, duration });
      }
    },
    [map],
  );

  const clearPlace = useCallback(() => {
    setPinned(null);
    setFocus((f) => {
      if (f?.kind !== 'place') return f;
      if (map && map.getZoom() >= COUNTRY_MIN_ZOOM) {
        const c = map.getCenter();
        return { kind: 'centre', lng: c.lng, lat: c.lat };
      }
      return null;
    });
  }, [map]);

  // Without a key, only say so after an actual search (don't nag on every zoom).
  const showPanel =
    focus !== null &&
    lookup !== null &&
    !dismissed &&
    !(lookup.status === 'nokey' && focus.kind === 'centre');

  return (
    <>
      <div className={`places ${className ?? ''}`} data-testid="place-finder">
        <PlaceSearch onPick={goTo} onClear={clearPlace} />
        {showPanel && (
          <CountryPanel
            focus={focus}
            lookup={lookup}
            onClose={() => setDismissed(true)}
            onRetry={() => setRetry((r) => r + 1)}
          />
        )}
      </div>
      {/* Sibling of the slot so it centres on the map, not the slot. */}
      {showPanel && focus.kind === 'centre' && (
        <div className="places__crosshair" aria-hidden="true" />
      )}
    </>
  );
}

// ---- Search box (ARIA 1.2 combobox with a listbox popup) ----

function PlaceSearch({
  onPick,
  onClear,
}: {
  onPick: (p: PlaceResult) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle');
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setStatus('searching');
      searchPlaces(q, { signal: ctrl.signal }).then(
        (r) => {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setStatus(r.length ? 'idle' : 'empty');
        },
        () => {
          if (!ctrl.signal.aborted) setStatus('error');
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const tooShort = query.trim().length < MIN_QUERY_LENGTH;
  const list = tooShort ? [] : results;
  const expanded = open && !tooShort && (list.length > 0 || status !== 'idle');

  const pick = (p: PlaceResult) => {
    setQuery(p.label);
    setOpen(false);
    onPick(p);
  };
  const clear = () => {
    setQuery('');
    setResults([]);
    setStatus('idle');
    onClear();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % list.length);
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? list.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      const p = list[active] ?? list[0];
      if (p) {
        e.preventDefault();
        pick(p);
      }
    } else if (e.key === 'Escape') {
      if (expanded) setOpen(false);
      else if (query) clear();
      else return;
      e.preventDefault();
    }
  };

  return (
    <div className="places__search overlay-panel">
      <label htmlFor={inputId} className="visually-hidden">
        Find a suburb or address
      </label>
      <svg className="places__icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        id={inputId}
        type="text"
        className="places__input"
        placeholder="Find a suburb or address"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        data-testid="place-search-input"
      />
      {query && (
        <button type="button" className="places__clear" onClick={clear} aria-label="Clear search">
          ×
        </button>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="Places"
        className="places__results"
        hidden={!expanded}
        data-testid="place-search-results"
      >
        {list.map((p, i) => (
          <li
            key={p.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className="places__result"
            // mousedown, not click: the input's blur would close the list first.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(p);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className="places__result-label">{p.label}</span>
            {p.detail && <span className="places__result-detail">{p.detail}</span>}
          </li>
        ))}
        {list.length === 0 && status !== 'idle' && (
          <li className="places__note" role="presentation">
            {status === 'searching'
              ? 'Searching…'
              : status === 'empty'
                ? 'No places found in Australia'
                : 'Search is unavailable right now'}
          </li>
        )}
      </ul>
    </div>
  );
}

// ---- "Whose Country is this?" ----

function CountryPanel({
  focus,
  lookup,
  onClose,
  onRetry,
}: {
  focus: Focus;
  lookup: Lookup;
  onClose: () => void;
  onRetry: () => void;
}) {
  const where = focus.kind === 'place' ? focus.label : 'Centre of the map';
  return (
    <section className="country-panel overlay-panel" aria-live="polite" data-testid="country-panel">
      <div className="country-panel__head">
        <h2 className="country-panel__title">
          Whose Country? <span className="country-panel__where">{where}</span>
        </h2>
        <button
          type="button"
          className="country-panel__close"
          onClick={onClose}
          aria-label="Close Country panel"
        >
          ×
        </button>
      </div>

      {lookup.status === 'loading' && <p className="country-panel__note">Looking this up…</p>}
      {lookup.status === 'nokey' && (
        <p className="country-panel__note">
          The territory overlay isn’t set up on this site yet: it needs a free{' '}
          <a href="https://native-land.ca/" target="_blank" rel="noreferrer">
            Native Land Digital
          </a>{' '}
          API key (<code>VITE_NATIVE_LAND_KEY</code>).
        </p>
      )}
      {lookup.status === 'error' && (
        <p className="country-panel__note">
          {lookup.message}.{' '}
          <button type="button" className="cm-text-button" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
      {lookup.status === 'ok' &&
        (lookup.territories.length === 0 ? (
          <p className="country-panel__note">Native Land Digital has no territory mapped here.</p>
        ) : (
          <ul className="country-panel__list" data-testid="country-list">
            {lookup.territories.map((t) => (
              <li key={t.slug} className="country-panel__item">
                <span
                  className="country-panel__swatch"
                  style={{ background: t.color }}
                  aria-hidden="true"
                />
                <a href={t.url} target="_blank" rel="noreferrer">
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        ))}

      {lookup.status !== 'nokey' && (
        <p className="country-panel__fine">
          From{' '}
          <a href={NATIVE_LAND_SITE} target="_blank" rel="noreferrer">
            Native Land Digital
          </a>
          , a community-sourced map. Not official or legal boundaries; overlaps are normal and
          borders are often contested. Traditional Owners and local Land Councils are the authority.
        </p>
      )}
    </section>
  );
}
