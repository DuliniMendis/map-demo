import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import type { Nation } from '../types/nation';
import { normalizeForSearch } from './filter';
import './ui.css';

/** Lists longer than this are virtualised. */
export const VIRTUALISE_OVER = 100;
/** Fixed row height in px (keep in sync with `.cm-row` in `ui.css`). */
export const ROW_HEIGHT = 56;
const PAGE_STEP = 10;
const TYPEAHEAD_RESET_MS = 700;

export interface NationListHandle {
  /** Focus the active row (the selected one, else the first), scrolling it into view. */
  focus(): void;
}

export interface NationListProps {
  /** Rows to show, already filtered and ordered (e.g. `filterNations(...)`). */
  items: Nation[];
  /** Full data set. Optional; only used to say "showing x of y" to screen readers. */
  nations?: Nation[];
  selectedId: string | null;
  onSelect(id: string): void;
  /** Pointer hover or keyboard focus on a row → id; leaving the list → null. */
  onHover?(id: string | null): void;
  /** Accessible name of the listbox. */
  label?: string;
  /** DOM id of the listbox (for `aria-controls` on the search box). */
  id?: string;
  /** Rendered instead of the listbox when `items` is empty. */
  empty?: ReactNode;
  ref?: Ref<NationListHandle>;
}

export function NationList({
  items,
  nations,
  selectedId,
  onSelect,
  onHover,
  label = 'Nations & language groups',
  id,
  empty,
  ref,
}: NationListProps) {
  const autoId = useId();
  const listId = id ?? `${autoId}-list`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > VIRTUALISE_OVER;
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unmemoisable functions; this component is not compiled.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    enabled: virtual,
    getItemKey: (i) => items[i]?.id ?? i,
  });

  // Roving tabindex: exactly one row is tabbable. Tracked by id so it survives filtering.
  const [activeId, setActiveId] = useState<string | null>(selectedId);
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) setActiveId(selectedId);
  }
  let activeIndex = activeId ? items.findIndex((n) => n.id === activeId) : -1;
  if (activeIndex < 0) activeIndex = selectedId ? items.findIndex((n) => n.id === selectedId) : -1;
  if (activeIndex < 0) activeIndex = 0;

  const pendingFocus = useRef(false);
  const typeahead = useRef({ buffer: '', at: 0 });

  const rowEl = (index: number) =>
    scrollRef.current?.querySelector<HTMLElement>(`[role="option"][data-index="${index}"]`) ?? null;

  const isRowFullyVisible = (index: number) => {
    const el = rowEl(index);
    const box = scrollRef.current?.getBoundingClientRect();
    if (!el || !box) return false;
    const r = el.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom;
  };

  /** `nearest`: minimal scroll (keyboard). `center`: jump with context (selection from the map). */
  const scrollToIndex = (index: number, align: 'nearest' | 'center' = 'nearest') => {
    if (virtual)
      virtualizer.scrollToIndex(index, { align: align === 'nearest' ? 'auto' : 'center' });
    else rowEl(index)?.scrollIntoView?.({ block: align });
  };

  const moveTo = (index: number) => {
    const n = items[Math.max(0, Math.min(items.length - 1, index))];
    if (!n) return;
    setActiveId(n.id);
    pendingFocus.current = true;
    scrollToIndex(items.indexOf(n));
    forceRender();
  };

  // Move DOM focus once the target row is rendered (virtual rows may need a scroll first).
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const el = rowEl(activeIndex);
    if (el) {
      pendingFocus.current = false;
      el.focus({ preventScroll: true });
    }
  });

  // New result set → start at the top. (Declared before the selection effect so a
  // selection restored on mount still wins.)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [items]);

  // Selection changed elsewhere (map click, URL restore) → bring that row into view.
  useEffect(() => {
    if (!selectedId) return;
    const index = items.findIndex((n) => n.id === selectedId);
    if (index >= 0 && !isRowFullyVisible(index)) scrollToIndex(index, 'center');
    // Only on selection changes; filtering is handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useImperativeHandle(ref, () => ({ focus: () => moveTo(activeIndex) }));

  const handleTypeahead = (ch: string) => {
    const now = Date.now();
    const t = typeahead.current;
    t.buffer = (now - t.at < TYPEAHEAD_RESET_MS ? t.buffer : '') + ch;
    t.at = now;
    const needle = normalizeForSearch(t.buffer);
    if (!needle) return;
    // A fresh single letter cycles to the *next* match; a longer buffer refines from the current row.
    const start = t.buffer.length === 1 ? activeIndex + 1 : activeIndex;
    for (let k = 0; k < items.length; k++) {
      const i = (start + k) % items.length;
      if (normalizeForSearch(items[i].name).startsWith(needle)) {
        moveTo(i);
        return;
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowDown':
        moveTo(activeIndex + 1);
        break;
      case 'ArrowUp':
        moveTo(activeIndex - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(items.length - 1);
        break;
      case 'PageDown':
        moveTo(activeIndex + PAGE_STEP);
        break;
      case 'PageUp':
        moveTo(activeIndex - PAGE_STEP);
        break;
      case 'Enter':
      case ' ': {
        const n = items[activeIndex];
        if (n) onSelect(n.id);
        break;
      }
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          handleTypeahead(e.key);
          break;
        }
        return; // let Tab etc. through
    }
    e.preventDefault();
  };

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      // Tabbed onto the listbox itself because the active row is scrolled out of the virtual window.
      moveTo(activeIndex);
      return;
    }
    const rowId = (e.target as HTMLElement).dataset.nationId;
    if (rowId) onHover?.(rowId);
  };

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover?.(null);
  };

  if (items.length === 0) {
    // Keep the id so the search box's aria-controls still points at something.
    return (
      <div id={listId} className="cm-list-empty">
        {empty}
      </div>
    );
  }

  const virtualItems = virtual ? virtualizer.getVirtualItems() : [];
  const activeRendered = !virtual || virtualItems.some((v) => v.index === activeIndex);
  const total = nations?.length;
  const ariaLabel =
    total !== undefined && total !== items.length
      ? `${label}, showing ${items.length} of ${total}`
      : label;

  const renderRow = (n: Nation, index: number, style?: CSSProperties) => {
    const selected = n.id === selectedId;
    return (
      <div
        key={n.id}
        role="option"
        id={`${listId}-${n.id}`}
        data-testid={`nation-item-${n.id}`}
        data-index={index}
        data-nation-id={n.id}
        aria-selected={selected}
        aria-setsize={items.length}
        aria-posinset={index + 1}
        tabIndex={index === activeIndex ? 0 : -1}
        className={selected ? 'cm-row cm-row--selected' : 'cm-row'}
        style={style}
        onClick={() => {
          setActiveId(n.id);
          onSelect(n.id);
        }}
        onMouseEnter={() => onHover?.(n.id)}
      >
        <span className="cm-row__text">
          <span className="cm-row__name">{n.name}</span>
          <span className="cm-row__meta">{n.modern.locality}</span>
        </span>
        <span className="cm-badge cm-badge--soft cm-row__state" title={n.modern.state}>
          <span className="cm-visually-hidden">, </span>
          {n.modern.stateCode}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      id={listId}
      className="cm-list"
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={activeRendered ? -1 : 0}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseLeave={() => onHover?.(null)}
    >
      {virtual ? (
        <div
          role="presentation"
          className="cm-list__sizer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((v) =>
            renderRow(items[v.index], v.index, {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
              transform: `translateY(${v.start}px)`,
            }),
          )}
        </div>
      ) : (
        items.map((n, i) => renderRow(n, i))
      )}
    </div>
  );
}
