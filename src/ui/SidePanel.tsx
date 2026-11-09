import { useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { STATE_NAMES } from '../types/nation';
import { useCardState } from './cardState';
import { Disclaimer } from './Disclaimer';
import { filterNations } from './filter';
import { NationList } from './NationList';
import type { NationListHandle } from './NationList';
import { SearchBox } from './SearchBox';
import { SHEET_QUERY, useMediaQuery } from './useMediaQuery';
import './ui.css';

const DRAG_SNAP_PX = 40;
const fmt = new Intl.NumberFormat('en-AU');

export interface SidePanelProps {
  /** Show the first-visit disclaimer banner at the top of the panel. Default true. */
  showDisclaimerBanner?: boolean;
  className?: string;
}

interface Drag {
  pointerId: number;
  startY: number;
  startHeight: number;
  moved: boolean;
}

/**
 * Container: reads and writes the app store. Renders its own `<aside data-testid="side-panel">`, so
 * place it directly in the layout (don't wrap it in another `<aside>`). Below 900 px it becomes a
 * bottom sheet with a drag handle.
 */
export function SidePanel({ showDisclaimerBanner = true, className }: SidePanelProps) {
  const id = useId();
  const nations = useAppStore((s) => s.nations);
  const query = useAppStore((s) => s.query);
  const stateFilter = useAppStore((s) => s.stateFilter);
  const selectedId = useAppStore((s) => s.selectedId);
  const { select, setHovered, setQuery, setStateFilter } = useAppStore.getState();

  const items = useMemo(
    () => filterNations(nations, query, stateFilter),
    [nations, query, stateFilter],
  );
  const listRef = useRef<NationListHandle>(null);

  const sheet = useMediaQuery(SHEET_QUERY);
  const [expanded, setExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const collapsed = sheet && !expanded;

  const filtered = query.trim() !== '' || stateFilter !== 'ALL';
  const loading = nations.length === 0;
  const where = stateFilter === 'ALL' ? '' : ` in ${STATE_NAMES[stateFilter]}`;
  let status = '';
  if (loading) status = 'Loading nations and language groups…';
  else if (filtered && items.length === 0) status = 'No matches';
  else if (filtered)
    status = `Showing ${fmt.format(items.length)} of ${fmt.format(nations.length)}`;

  const handleSelect = (nationId: string) => {
    select(nationId);
    useCardState.getState().reopen();
    if (sheet) setExpanded(false); // reveal the map and the info card
  };

  const clearAll = () => {
    setQuery('');
    setStateFilter('ALL');
  };

  // --- bottom-sheet drag handle -------------------------------------------------------------
  const onHandlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!panelRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: panelRef.current.getBoundingClientRect().height,
      moved: false,
    };
  };
  const onHandlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const max = window.innerHeight * 0.85;
    setDragHeight(Math.max(120, Math.min(max, d.startHeight - dy)));
  };
  const onHandlePointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragHeight(null);
    if (!d.moved) return; // a tap: the click handler toggles
    suppressClick.current = true;
    const dy = e.clientY - d.startY;
    if (dy < -DRAG_SNAP_PX) setExpanded(true);
    else if (dy > DRAG_SNAP_PX) setExpanded(false);
  };

  const classes = ['cm-panel', sheet && 'cm-panel--sheet', className].filter(Boolean).join(' ');

  return (
    <aside
      ref={panelRef}
      className={classes}
      data-testid="side-panel"
      data-expanded={sheet ? String(expanded) : undefined}
      data-dragging={dragHeight !== null ? 'true' : undefined}
      aria-labelledby={`${id}-title`}
      style={dragHeight !== null ? { height: dragHeight } : undefined}
    >
      {sheet && (
        <button
          type="button"
          className="cm-sheet-handle"
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          aria-label={expanded ? 'Collapse list' : 'Expand list'}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setExpanded((v) => !v);
          }}
        >
          <span className="cm-sheet-handle__bar" aria-hidden="true" />
        </button>
      )}

      <header className="cm-panel__header">
        <h2 id={`${id}-title`} className="cm-panel__title">
          Nations &amp; language groups
        </h2>
      </header>

      {showDisclaimerBanner && !collapsed && <Disclaimer variant="banner" />}

      <SearchBox
        value={query}
        onChange={setQuery}
        stateFilter={stateFilter}
        onStateFilter={(f) => {
          setStateFilter(f);
          if (sheet) setExpanded(true);
        }}
        onInput={() => {
          if (sheet) setExpanded(true);
        }}
        onArrowDown={() => {
          if (sheet) setExpanded(true);
          listRef.current?.focus();
        }}
        controls={`${id}-list`}
      />

      <p className="cm-panel__status" role="status">
        {status}
      </p>

      <div id={`${id}-body`} className="cm-panel__body" inert={collapsed}>
        {loading ? (
          <div className="cm-skeleton" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="cm-skeleton__row" />
            ))}
          </div>
        ) : (
          <NationList
            ref={listRef}
            id={`${id}-list`}
            items={items}
            nations={nations}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHover={setHovered}
            empty={
              <div className="cm-empty">
                <p>
                  No nations or language groups match
                  {query.trim() ? ` “${query.trim()}”` : ' this filter'}
                  {where}.
                </p>
                <button type="button" className="cm-button" onClick={clearAll}>
                  Clear search and filter
                </button>
              </div>
            }
          />
        )}
        <footer className="cm-panel__footer">
          {loading
            ? ''
            : `${fmt.format(nations.length)} ${nations.length === 1 ? 'language group' : 'language groups'} · `}
          AUSTLANG © AIATSIS
        </footer>
      </div>
    </aside>
  );
}
