// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTerritoryCache } from './nativeLand';
import { PlaceFinder } from './PlaceFinder';

const PHOTON = {
  features: [
    {
      properties: { osm_type: 'R', osm_id: 1, name: 'Newtown', city: 'Sydney', countrycode: 'AU' },
      geometry: { type: 'Point', coordinates: [151.18, -33.896] },
    },
  ],
};
const TERRITORIES = [
  {
    type: 'Feature',
    properties: { Name: 'Sample Country', Slug: 'sample', color: '#2b8a3e' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [151, -34],
          [152, -34],
          [152, -33],
          [151, -34],
        ],
      ],
    },
  },
];

function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (u: string) => {
    calls.push(String(u));
    return Response.json(String(u).includes('native-land') ? TERRITORIES : PHOTON);
  });
  return calls;
}

async function searchAndPick() {
  const input = screen.getByTestId('place-search-input');
  fireEvent.change(input, { target: { value: 'Newtown' } });
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(screen.getByRole('option', { name: /Newtown/ })).toBeTruthy();
  fireEvent.keyDown(input, { key: 'Enter' });
  await act(() => vi.advanceTimersByTimeAsync(0));
}

describe('PlaceFinder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearTerritoryCache();
  });

  it('does not search until 3 characters', async () => {
    const calls = stubFetch();
    render(h(PlaceFinder, { map: null }));
    fireEvent.change(screen.getByTestId('place-search-input'), { target: { value: 'Ne' } });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(calls).toEqual([]);
  });

  it('searches, picks with Enter, and shows the Native Land territories there', async () => {
    vi.stubEnv('VITE_NATIVE_LAND_KEY', 'test-key');
    const calls = stubFetch();
    render(h(PlaceFinder, { map: null }));
    await searchAndPick();
    expect(calls[0]).toContain('photon.komoot.io');
    expect(calls[1]).toContain('position=-33.90%2C151.18');
    const panel = screen.getByTestId('country-panel');
    expect(panel.textContent).toContain('Newtown');
    expect(panel.textContent).toContain('Sample Country');
    expect(panel.textContent).toContain('Not official or legal boundaries');
  });

  it('explains when no Native Land key is configured', async () => {
    vi.stubEnv('VITE_NATIVE_LAND_KEY', '');
    const calls = stubFetch();
    render(h(PlaceFinder, { map: null }));
    await searchAndPick();
    expect(calls.some((c) => c.includes('native-land'))).toBe(false);
    expect(screen.getByTestId('country-panel').textContent).toContain('VITE_NATIVE_LAND_KEY');
  });
});
