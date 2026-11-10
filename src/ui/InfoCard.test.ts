// @vitest-environment jsdom
// WS8: the "nearby town / landmark" lines in the info card's "Country today" block.
import { cleanup, render, screen, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import mock from '../data/mock-nations.json';
import type { Nation } from '../types/nation';
import { formatNearby, formatNearbyDistance, InfoCard } from './InfoCard';

const nations = mock.nations as Nation[];
const base = nations.find((n) => n.id === 'D62')!;

afterEach(cleanup);

describe('InfoCard nearby', () => {
  it('formats distance and bearing', () => {
    expect(formatNearbyDistance({ distanceKm: 12.4, bearing: 'NE' })).toBe('12 km NE');
    expect(formatNearbyDistance({ distanceKm: 7.5, bearing: 'W' })).toBe('8 km W');
    expect(formatNearbyDistance({ distanceKm: 0.6, bearing: 'S' })).toBe('under 1 km');
    expect(
      formatNearby({ name: 'Uluru / Ayers Rock', kind: 'peak', distanceKm: 8.2, bearing: 'W' }),
    ).toBe('Uluru / Ayers Rock (peak, 8 km W)');
    expect(
      formatNearby({ name: 'Yuendumu', kind: 'village', distanceKm: 12.2, bearing: 'NE' }),
    ).toBe('Yuendumu (village, 12 km NE)');
  });

  it('shows the town and landmark lines inside "Country today"', () => {
    const nation: Nation = {
      ...base,
      nearby: {
        town: { name: 'Alice Springs', kind: 'town', distanceKm: 12.3, bearing: 'NE' },
        landmark: { name: 'Mount Sonder', kind: 'peak', distanceKm: 8.1, bearing: 'W' },
      },
    };
    render(h(InfoCard, { nation, onClose: () => {} }));
    const el = screen.getByTestId('info-nearby');
    const items = within(el)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual([
      'Near Alice Springs, town, 12 km NE',
      'Landmark Mount Sonder, peak, 8 km W',
    ]);
    expect(el.textContent).toMatch(/for orientation only \(OpenStreetMap\)/);
    // It sits in the "Country today" fact, after the ABS locality.
    const today = screen.getByTestId('info-locality').closest('dd')!;
    expect(today.contains(el)).toBe(true);
  });

  it('omits each line when absent, and the block when both are', () => {
    const town = { name: 'Queanbeyan', kind: 'city', distanceKm: 31.2, bearing: 'NE' } as const;
    const { unmount } = render(
      h(InfoCard, { nation: { ...base, nearby: { town } }, onClose() {} }),
    );
    const items = within(screen.getByTestId('info-nearby')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Near Queanbeyan, city, 31 km NE']);
    unmount();

    const landmark = {
      name: 'Murrumbidgee River',
      kind: 'river',
      distanceKm: 0.3,
      bearing: 'N',
    } as const;
    render(h(InfoCard, { nation: { ...base, nearby: { landmark } }, onClose() {} }));
    expect(screen.getByTestId('info-nearby').textContent).toContain(
      'Landmark Murrumbidgee River, river, under 1 km',
    );
    expect(screen.getByTestId('info-nearby').textContent).not.toContain('Near ');
    cleanup();

    const without: Nation = { ...base };
    delete without.nearby;
    render(h(InfoCard, { nation: without, onClose() {} }));
    expect(screen.queryByTestId('info-nearby')).toBeNull();
    cleanup();
    render(h(InfoCard, { nation: { ...base, nearby: {} }, onClose() {} }));
    expect(screen.queryByTestId('info-nearby')).toBeNull();
  });

  it('mock data carries nearby for a few entries so dev/test shows it', () => {
    expect(nations.filter((n) => n.nearby).length).toBeGreaterThanOrEqual(3);
  });
});

describe('InfoCard image', () => {
  it('shows the illustration with alt text and credit, and switches to the wide layout', () => {
    const nation: Nation = {
      ...base,
      image: {
        src: `images/nations/${base.id}.webp`,
        alt: 'Pencil sketch of a dry riverbed lined with river red gums',
        credit: 'Pencil illustration, AI-generated',
      },
    };
    render(h(InfoCard, { nation, onClose() {} }));
    const fig = screen.getByTestId('info-image');
    const img = within(fig).getByRole('img');
    expect(img.getAttribute('alt')).toBe(nation.image!.alt);
    expect(img.getAttribute('src')).toMatch(new RegExp(`images/nations/${base.id}\\.webp$`));
    expect(fig.textContent).toContain('Pencil illustration, AI-generated');
    expect(screen.getByTestId('info-card').classList).toContain('cm-info-card--with-image');
  });

  it('keeps the single-column card when there is no image', () => {
    const without: Nation = { ...base };
    delete without.image;
    render(h(InfoCard, { nation: without, onClose() {} }));
    expect(screen.queryByTestId('info-image')).toBeNull();
    expect(screen.getByTestId('info-card').classList).not.toContain('cm-info-card--with-image');
  });
});
