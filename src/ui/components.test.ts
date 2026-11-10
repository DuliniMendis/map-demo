// @vitest-environment jsdom
// Component tests are .ts (not .tsx) because vite.config's test include is `src/**/*.test.ts`.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mock from '../data/mock-nations.json';
import { useAppStore } from '../store/useAppStore';
import type { Nation } from '../types/nation';
import { useCardState } from './cardState';
import { Disclaimer, DISCLAIMER_STORAGE_KEY, DISCLAIMER_TEXT } from './Disclaimer';
import { InfoCard, MAX_SYNONYMS } from './InfoCard';
import { NationList, VIRTUALISE_OVER } from './NationList';
import { SearchBox, SEARCH_DEBOUNCE_MS } from './SearchBox';
import { SelectedNationCard } from './SelectedNationCard';
import { SidePanel } from './SidePanel';

const nations = mock.nations as Nation[];
const byId = (id: string) => nations.find((n) => n.id === id)!;
const initialStore = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialStore, true);
  useCardState.setState({ dismissedId: null });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SearchBox', () => {
  const setup = (value = '') => {
    const onChange = vi.fn();
    const onStateFilter = vi.fn();
    render(h(SearchBox, { value, onChange, stateFilter: 'ALL', onStateFilter }));
    return { onChange, onStateFilter, input: screen.getByTestId('search-input') };
  };

  it('debounces typing by 120 ms', () => {
    vi.useFakeTimers();
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: 'ka' } });
    fireEvent.change(input, { target: { value: 'kau' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('kau');
  });

  it('clears immediately on Escape', () => {
    vi.useFakeTimers();
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: 'dharug' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect((input as HTMLInputElement).value).toBe('');
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledTimes(1); // pending debounce was cancelled
  });

  it('offers ALL plus every state code, and reports changes', () => {
    const { onStateFilter } = setup();
    const select = screen.getByTestId('state-filter') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      'ALL',
      'NSW',
      'VIC',
      'QLD',
      'SA',
      'WA',
      'TAS',
      'NT',
      'ACT',
      'OT',
    ]);
    fireEvent.change(select, { target: { value: 'TAS' } });
    expect(onStateFilter).toHaveBeenCalledWith('TAS');
  });

  it('has accessible names for both controls', () => {
    setup();
    expect(screen.getByRole('searchbox', { name: /search nations/i })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /state or territory/i })).toBeTruthy();
  });
});

describe('NationList', () => {
  const setup = (selectedId: string | null = null, items = nations) => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    const utils = render(h(NationList, { items, selectedId, onSelect, onHover }));
    return { onSelect, onHover, ...utils };
  };

  it('renders a listbox with one option per nation, testids and aria-selected', () => {
    setup('S64');
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(nations.length);
    expect(screen.getByTestId('nation-item-S64').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('nation-item-D62').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('nation-item-S64').textContent).toContain('Jenolan, NSW');
  });

  it('roving tabindex: only the selected (or first) row is tabbable', () => {
    setup('S64');
    const tabbable = screen.getAllByRole('option').filter((o) => o.tabIndex === 0);
    expect(tabbable.map((o) => o.dataset.nationId)).toEqual(['S64']);
  });

  it('arrow keys / Home / End move focus; Enter selects', () => {
    const { onSelect } = setup();
    const list = screen.getByRole('listbox');
    const first = screen.getAllByRole('option')[0];
    first.focus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getAllByRole('option')[1]);
    fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(screen.getAllByRole('option')[nations.length - 1]);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getAllByRole('option')[0]);
    fireEvent.keyDown(list, { key: 'ArrowUp' }); // clamps at the top
    expect(document.activeElement).toBe(screen.getAllByRole('option')[0]);
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(nations[0].id);
  });

  it('type-ahead jumps to the next name starting with the typed letter', () => {
    setup();
    const list = screen.getByRole('listbox');
    screen.getAllByRole('option')[0].focus();
    fireEvent.keyDown(list, { key: 'k' });
    expect((document.activeElement as HTMLElement).dataset.nationId).toBe('L3'); // Kaurna
  });

  it('click selects; hover reports ids and null on leave', () => {
    const { onSelect, onHover } = setup();
    fireEvent.click(screen.getByTestId('nation-item-N198'));
    expect(onSelect).toHaveBeenCalledWith('N198');
    fireEvent.mouseEnter(screen.getByTestId('nation-item-D62'));
    expect(onHover).toHaveBeenLastCalledWith('D62');
    fireEvent.mouseLeave(screen.getByRole('listbox'));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('renders the empty slot when there are no items', () => {
    render(
      h(NationList, {
        items: [],
        selectedId: null,
        onSelect: () => {},
        empty: h('p', null, 'Nothing here'),
      }),
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it(`virtualises lists longer than ${VIRTUALISE_OVER}`, () => {
    // jsdom has no layout; give the scroll container a size so the virtualiser renders a window.
    const proto = HTMLElement.prototype;
    const hSpy = vi.spyOn(proto, 'clientHeight', 'get').mockReturnValue(560);
    const wSpy = vi.spyOn(proto, 'clientWidth', 'get').mockReturnValue(360);
    const many = Array.from({ length: 455 }, (_, i) => ({
      ...nations[i % nations.length],
      id: `T${i}`,
      name: `Test ${String(i).padStart(3, '0')}`,
    }));
    setup(null, many);
    const rendered = screen.getAllByRole('option');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
    expect(rendered[0].getAttribute('aria-setsize')).toBe('455');
    hSpy.mockRestore();
    wSpy.mockRestore();
  });
});

describe('InfoCard', () => {
  it('shows names, Country today, links and the inline disclaimer', () => {
    render(h(InfoCard, { nation: byId('S64'), onClose: () => {} }));
    const card = screen.getByTestId('info-card');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe(
      'Dharug / Darug people',
    );
    expect(card.textContent).toContain('Language: Dharug / Darug');
    expect(screen.getByTestId('info-locality').textContent).toBe('Jenolan');
    expect(screen.getByTestId('info-state').textContent).toBe('New South Wales');
    expect(card.textContent).toContain('Suburb/locality boundary from ABS 2021');
    const link = within(card).getByRole('link', { name: /AUSTLANG entry/ });
    expect(link.getAttribute('href')).toBe(
      'https://collection.aiatsis.gov.au/austlang/language/s64',
    );
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(card.textContent).toContain(DISCLAIMER_TEXT);
    expect(within(card).queryByRole('link', { name: /Wikipedia/ })).toBeNull();
    expect(within(card).queryByRole('button', { name: /overview/i })).toBeNull();
  });

  it(`shows at most ${MAX_SYNONYMS} synonym chips with "+n more" to expand`, () => {
    const n = byId('S64');
    render(h(InfoCard, { nation: n, onClose: () => {} }));
    expect(screen.getAllByRole('listitem').filter((li) => li.className === 'cm-chip')).toHaveLength(
      MAX_SYNONYMS,
    );
    const more = screen.getByRole('button', {
      name: new RegExp(`^\\+${n.synonyms.length - MAX_SYNONYMS} more`),
    });
    fireEvent.click(more);
    expect(screen.getAllByRole('listitem').filter((li) => li.className === 'cm-chip')).toHaveLength(
      n.synonyms.length,
    );
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('falls back to the language name when there is no peopleName', () => {
    render(h(InfoCard, { nation: byId('D62'), onClose: () => {} }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Canberra language');
    expect(screen.queryByText(/^Language:/)).toBeNull();
  });

  it('close button, Esc and "Back to overview" call back', () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(h(InfoCard, { nation: byId('D62'), onClose, onBackToOverview: onBack }));
    fireEvent.click(screen.getByRole('button', { name: /close details/i }));
    fireEvent.keyDown(screen.getByTestId('info-card'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Disclaimer', () => {
  it('inline variant is the one-sentence disclaimer', () => {
    render(h(Disclaimer, { variant: 'inline' }));
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeTruthy();
  });

  it('banner variant remembers dismissal in localStorage', () => {
    const { unmount } = render(h(Disclaimer, { variant: 'banner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByTestId('disclaimer-banner')).toBeNull();
    expect(localStorage.getItem(DISCLAIMER_STORAGE_KEY)).toBe('1');
    unmount();
    render(h(Disclaimer, { variant: 'banner' }));
    expect(screen.queryByTestId('disclaimer-banner')).toBeNull();
  });

  it('banner still shows (and dismisses) when localStorage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(h(Disclaimer, { variant: 'banner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByTestId('disclaimer-banner')).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('SidePanel + SelectedNationCard (store round-trip)', () => {
  const renderApp = () => {
    useAppStore.getState().setNations(nations);
    render(h('div', null, h(SidePanel), h(SelectedNationCard)));
  };

  it('renders the heading, testids and a footer count from the data', () => {
    renderApp();
    const panel = screen.getByTestId('side-panel');
    expect(within(panel).getByRole('heading', { name: 'Nations & language groups' })).toBeTruthy();
    expect(screen.getByTestId('search-input')).toBeTruthy();
    expect(screen.getByTestId('state-filter')).toBeTruthy();
    expect(panel.textContent).toContain(`${nations.length} language groups · AUSTLANG © AIATSIS`);
  });

  it('list click → store → info card', () => {
    renderApp();
    expect(screen.queryByTestId('info-card')).toBeNull();
    fireEvent.click(screen.getByTestId('nation-item-L3'));
    expect(useAppStore.getState().selectedId).toBe('L3');
    expect(screen.getByTestId('info-locality').textContent).toBe(byId('L3').modern.locality);
  });

  it('store change ("map click") → row highlighted and card updated; hidden while flying', () => {
    renderApp();
    act(() => {
      useAppStore.getState().select('W9');
      useAppStore.getState().setCameraState('flying');
    });
    expect(screen.getByTestId('nation-item-W9').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('info-card')).toBeNull();
    act(() => useAppStore.getState().setCameraState('idle'));
    expect(screen.getByTestId('info-state').textContent).toBe('Western Australia');
  });

  it('close keeps the selection; re-selecting reopens; Back to overview clears it', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('nation-item-S64'));
    fireEvent.click(screen.getByRole('button', { name: /close details/i }));
    expect(screen.queryByTestId('info-card')).toBeNull();
    expect(useAppStore.getState().selectedId).toBe('S64');
    fireEvent.click(screen.getByTestId('nation-item-S64'));
    expect(screen.getByTestId('info-card')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
    expect(useAppStore.getState().selectedId).toBeNull();
    expect(screen.queryByTestId('info-card')).toBeNull();
  });

  it('search and state filter go through the store and filter the list', () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'jenolan' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(useAppStore.getState().query).toBe('jenolan');
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.dataset.nationId),
    ).toEqual(['S64']);
    expect(screen.getByRole('status').textContent).toBe(`Showing 1 of ${nations.length}`);

    fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Escape' });
    fireEvent.change(screen.getByTestId('state-filter'), { target: { value: 'WA' } });
    expect(useAppStore.getState().stateFilter).toBe('WA');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzz' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filter' }));
    expect(useAppStore.getState().query).toBe('');
    expect(useAppStore.getState().stateFilter).toBe('ALL');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(nations.length);
    expect((screen.getByTestId('search-input') as HTMLInputElement).value).toBe('');
  });

  it('never says "tribe" in its own copy', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('nation-item-D62')); // no synonyms containing "tribe"
    expect(document.body.textContent?.toLowerCase()).not.toContain('tribe');
  });
});
