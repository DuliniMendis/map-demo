import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_LAND_ENTRY, PHOTON_ENTRY, compactLabel, withPlaces } from '../app/attributionData';
import {
  buildTerritoriesUrl,
  clearTerritoryCache,
  NativeLandError,
  parseTerritories,
  positionKey,
  territoriesAt,
} from './nativeLand';
import { buildPhotonUrl, parsePhoton } from './photon';
import { territoriesToGeoJSON } from './territoryLayer';

const square = (x: number, y: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x, y],
    ],
  ],
});

describe('photon', () => {
  it('builds a URL limited to Australia', () => {
    const u = new URL(buildPhotonUrl('  Newtown '));
    expect(u.origin + u.pathname).toBe('https://photon.komoot.io/api/');
    expect(u.searchParams.get('q')).toBe('Newtown');
    expect(u.searchParams.get('bbox')).toBe('112.5,-44.5,154.5,-9.5');
    expect(u.searchParams.get('lang')).toBe('en');
  });

  it('parses suburbs (with bounds) and addresses, and drops other countries', () => {
    const results = parsePhoton({
      features: [
        {
          properties: {
            osm_type: 'R',
            osm_id: 5688724,
            name: 'Newtown',
            type: 'district',
            city: 'Sydney',
            state: 'New South Wales',
            postcode: '2042',
            countrycode: 'AU',
            extent: [151.171, -33.89, 151.189, -33.908],
          },
          geometry: { type: 'Point', coordinates: [151.18, -33.896] },
        },
        {
          properties: {
            osm_type: 'N',
            osm_id: 1,
            housenumber: '12',
            street: 'King Street',
            district: 'Newtown',
            city: 'Sydney',
            state: 'New South Wales',
            countrycode: 'AU',
            type: 'house',
          },
          geometry: { type: 'Point', coordinates: [151.17, -33.9] },
        },
        {
          properties: { name: 'Newtown', countrycode: 'NZ' },
          geometry: { type: 'Point', coordinates: [174.7, -41.3] },
        },
        { properties: { name: 'No geometry' } },
      ],
    });
    expect(results).toEqual([
      {
        id: 'R5688724',
        label: 'Newtown',
        detail: 'Sydney, New South Wales 2042',
        lng: 151.18,
        lat: -33.896,
        bounds: [
          [151.171, -33.908],
          [151.189, -33.89],
        ],
        kind: 'district',
      },
      {
        id: 'N1',
        label: '12 King Street',
        detail: 'Newtown, Sydney, New South Wales',
        lng: 151.17,
        lat: -33.9,
        bounds: undefined,
        kind: 'house',
      },
    ]);
  });

  it('tolerates junk', () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: 'x' })).toEqual([]);
  });
});

describe('nativeLand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTerritoryCache();
  });

  it('rounds the position to ~1 km and builds the territories URL', () => {
    expect(positionKey(151.1801, -33.8961)).toBe('-33.90,151.18');
    const u = new URL(buildTerritoriesUrl(151.1801, -33.8961, 'k'));
    expect(u.origin + u.pathname).toBe('https://native-land.ca/api/index.php');
    expect(u.searchParams.get('maps')).toBe('territories');
    expect(u.searchParams.get('position')).toBe('-33.90,151.18');
    expect(u.searchParams.get('key')).toBe('k');
  });

  it('parses a bare array or a FeatureCollection, sorted, deduped, with safe colours and links', () => {
    const features = [
      {
        type: 'Feature',
        properties: {
          Name: 'Zeta',
          Slug: 'zeta',
          color: '#123456',
          description: 'https://native-land.ca/maps/territories/zeta',
        },
        geometry: square(0, 0),
      },
      {
        type: 'Feature',
        properties: {
          Name: 'Alpha',
          Slug: 'alpha',
          color: 'red;}',
          description: 'javascript:alert(1)',
        },
        geometry: square(1, 1),
      },
      { type: 'Feature', properties: { Name: 'Zeta', Slug: 'zeta' }, geometry: square(0, 0) },
      {
        type: 'Feature',
        properties: { Name: 'Point' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ];
    const a = parseTerritories(features);
    expect(a.map((t) => t.name)).toEqual(['Alpha', 'Zeta']);
    expect(a[0].color).toBe('#e03c31');
    expect(a[0].url).toBe('https://native-land.ca/maps/territories/alpha');
    expect(a[1].color).toBe('#123456');
    expect(parseTerritories({ type: 'FeatureCollection', features })).toEqual(a);
    expect(parseTerritories({ error: 'nope' })).toEqual([]);
  });

  it('caches by rounded position and surfaces API errors', async () => {
    const ok = vi.fn(async () =>
      Response.json([{ type: 'Feature', properties: { Name: 'A' }, geometry: square(0, 0) }]),
    );
    vi.stubGlobal('fetch', ok);
    await territoriesAt(151.1801, -33.8961, { key: 'k' });
    const again = await territoriesAt(151.1799, -33.8959, { key: 'k' });
    expect(again.map((t) => t.name)).toEqual(['A']);
    expect(ok).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'Invalid API key' }, { status: 401 }),
    );
    await expect(territoriesAt(140, -30, { key: 'bad' })).rejects.toThrow(
      new NativeLandError('Invalid API key', 401),
    );
  });

  it('turns territories into GeoJSON for the map', () => {
    const t = parseTerritories([
      { type: 'Feature', properties: { Name: 'A', color: '#abc' }, geometry: square(0, 0) },
    ]);
    expect(territoriesToGeoJSON(t).features[0]).toMatchObject({
      id: 0,
      properties: { name: 'A', slug: 'a', color: '#abc' },
    });
  });
});

describe('place attribution', () => {
  it('credits Photon always and Native Land only when it is on', () => {
    const base = [{ id: 'x', text: 'X' }];
    expect(withPlaces(base, false)).toEqual([...base, PHOTON_ENTRY]);
    expect(withPlaces(base, true)).toEqual([...base, PHOTON_ENTRY, NATIVE_LAND_ENTRY]);
    expect(compactLabel(NATIVE_LAND_ENTRY)).toBe('Territories © Native Land Digital');
    expect(compactLabel(PHOTON_ENTRY)).toBe('Search: Photon (© OpenStreetMap)');
  });
});
