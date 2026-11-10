import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { STATE_CODES, STATE_NAMES } from '../types/nation';
import type { StateFilter } from './filter';
import './ui.css';

export const SEARCH_DEBOUNCE_MS = 120;

export interface SearchBoxProps {
  /** Committed query (store `query`). */
  value: string;
  /** Called 120 ms after typing stops, or immediately on clear / Esc. */
  onChange(query: string): void;
  stateFilter: StateFilter;
  onStateFilter(f: StateFilter): void;
  /** Called on every keystroke (before the debounce), e.g. to expand the mobile sheet. */
  onInput?(): void;
  /** Lets the list take focus on ↓ from the search field. */
  onArrowDown?(): void;
  /** id of the element the search filters (for `aria-controls`). */
  controls?: string;
}

export function SearchBox({
  value,
  onChange,
  stateFilter,
  onStateFilter,
  onInput,
  onArrowDown,
  controls,
}: SearchBoxProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [lastSent, setLastSent] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow external changes (URL restore, "Clear search" button) without clobbering typing:
  // a value we committed ourselves is ignored.
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== lastSent) {
      setLastSent(value);
      setDraft(value);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (q: string) => {
    clearTimeout(timer.current);
    setLastSent(q);
    onChange(q);
  };

  const handleChange = (q: string) => {
    setDraft(q);
    onInput?.();
    clearTimeout(timer.current);
    if (q === '') {
      commit('');
      return;
    }
    timer.current = setTimeout(() => commit(q), SEARCH_DEBOUNCE_MS);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && draft !== '') {
      e.preventDefault();
      e.stopPropagation();
      setDraft('');
      commit('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft); // skip the debounce
    } else if (e.key === 'ArrowDown' && onArrowDown) {
      e.preventDefault();
      commit(draft);
      onArrowDown();
    }
  };

  return (
    <div className="cm-search" role="search">
      <div className="cm-search__field">
        <label htmlFor={`${id}-q`} className="cm-visually-hidden">
          Search nations, language groups and places
        </label>
        <svg className="cm-search__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id={`${id}-q`}
          data-testid="search-input"
          className="cm-input cm-search__input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Name or place"
          value={draft}
          aria-controls={controls}
          aria-describedby={`${id}-hint`}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {draft !== '' && (
          <button
            type="button"
            className="cm-icon-button cm-search__clear"
            aria-label="Clear search"
            onClick={() => {
              setDraft('');
              commit('');
            }}
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
        )}
        <span id={`${id}-hint`} className="cm-visually-hidden">
          Matches ignore accents; type ng for ŋ. Press Escape to clear, Down arrow to move to the
          results.
        </span>
      </div>
      <label className="cm-visually-hidden" htmlFor={`${id}-state`}>
        State or territory
      </label>
      <select
        id={`${id}-state`}
        data-testid="state-filter"
        className="cm-input cm-select"
        value={stateFilter}
        aria-controls={controls}
        onChange={(e) => onStateFilter(e.target.value as StateFilter)}
      >
        <option value="ALL">All states</option>
        {STATE_CODES.map((code) => (
          <option key={code} value={code} title={STATE_NAMES[code]}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}
