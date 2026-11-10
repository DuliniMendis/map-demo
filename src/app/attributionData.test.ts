import { describe, expect, it, vi } from 'vitest';
import { correctionMailto } from './About';
import {
  compactLabel,
  DEFAULT_ATTRIBUTION,
  loadAttribution,
  MAPLIBRE_ENTRY,
  parseAttribution,
  withMapLibre,
} from './attributionData';
import { MAX_BOUNDS, padBounds } from './mapSetup';

describe('parseAttribution', () => {
  it("reads WS3's attribution.json shape", () => {
    const file = {
      generatedAt: '2026-11-09',
      disclaimer: 'Locations are approximate…',
      items: [
        {
          id: 'austlang',
          text: 'AUSTLANG © AIATSIS, CC BY 4.0, via TLCMap',
          url: 'https://collection.aiatsis.gov.au/austlang/search',
          licence: 'CC BY 4.0',
          licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
          usedFor: 'Language locations',
          kind: 'data',
        },
        {
          id: 'mapterhorn',
          text: '© Mapterhorn',
          url: 'https://mapterhorn.com/attribution',
          usedFor: 'Terrain',
          kind: 'terrain',
        },
      ],
    };
    expect(parseAttribution(file)).toEqual(file.items);
  });

  it('tolerates a bare array and assorted field names', () => {
    expect(
      parseAttribution([
        { id: 'austlang', text: 'AUSTLANG © AIATSIS', url: 'https://x', license: 'CC BY 4.0' },
        { label: '© Mapterhorn', href: 'https://mapterhorn.com/attribution' },
        '© OpenMapTiles',
        { nothing: true },
      ]),
    ).toEqual([
      { id: 'austlang', text: 'AUSTLANG © AIATSIS', url: 'https://x', licence: 'CC BY 4.0' },
      { id: 'a1', text: '© Mapterhorn', url: 'https://mapterhorn.com/attribution' },
      { id: 'a2', text: '© OpenMapTiles' },
    ]);
  });

  it('accepts an object wrapping the list', () => {
    expect(parseAttribution({ generatedAt: 'x', sources: [{ attribution: 'A' }] })).toHaveLength(1);
    expect(parseAttribution({ entries: ['B'] })).toEqual([{ id: 'a0', text: 'B' }]);
  });

  it('returns null for unusable input', () => {
    expect(parseAttribution(null)).toBeNull();
    expect(parseAttribution({ foo: 1 })).toBeNull();
    expect(parseAttribution([])).toBeNull();
    expect(parseAttribution([{ url: 'x' }])).toBeNull();
  });
});

describe('compactLabel', () => {
  it('shortens every bundled credit and passes unknown text through', () => {
    expect(DEFAULT_ATTRIBUTION.map(compactLabel)).toEqual([
      '© AIATSIS (AUSTLANG)',
      '© ABS',
      '© Mapterhorn',
      'Terrain Tiles (Mapzen/AWS)',
      'Sentinel-2 cloudless by EOX',
      'Aerial © NSW',
      'Aerial © QLD, Planet',
      'Aerial © TAS',
      '© OpenMapTiles © OpenStreetMap',
      '© MapLibre',
      'Wikidata (CC0)',
      'Nearby places © OpenStreetMap',
    ]);
    expect(compactLabel({ text: 'Something else' })).toBe('Something else');
  });
});

describe('withMapLibre', () => {
  it('adds MapLibre once', () => {
    expect(withMapLibre([{ id: 'a', text: 'A' }])).toEqual([
      { id: 'a', text: 'A' },
      MAPLIBRE_ENTRY,
    ]);
    const has = [{ id: 'm', text: '© MapLibre contributors' }];
    expect(withMapLibre(has)).toBe(has);
  });

  it('the bundled fallback has every research.md credit plus MapLibre', () => {
    const texts = DEFAULT_ATTRIBUTION.map((e) => e.text).join('\n');
    expect(texts).toContain(
      'AUSTLANG © Australian Institute of Aboriginal and Torres Strait Islander Studies (AIATSIS), CC BY 4.0, via TLCMap',
    );
    expect(texts).toContain('© Mapterhorn');
    expect(texts).toContain('Terrain Tiles: Mapzen/AWS Open Data (SRTM, Geoscience Australia)');
    expect(texts).toContain(
      'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    );
    expect(texts).toContain('© OpenMapTiles © OpenStreetMap contributors');
    expect(texts).toContain('Suburb/state boundaries © Australian Bureau of Statistics, CC BY 4.0');
    expect(texts).toContain('© MapLibre');
  });
});

describe('loadAttribution', () => {
  const json = (body: unknown, type = 'application/json') =>
    Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': type } }));

  it('uses the file when it parses', async () => {
    const f = vi.fn(() => json([{ text: 'X' }]));
    expect(await loadAttribution(f as unknown as typeof fetch)).toEqual([
      { id: 'a0', text: 'X' },
      MAPLIBRE_ENTRY,
    ]);
  });

  it('falls back when missing, HTML (Vite dev), or failing', async () => {
    const html = vi.fn(() => json('<html>', 'text/html'));
    expect(await loadAttribution(html as unknown as typeof fetch)).toBe(DEFAULT_ATTRIBUTION);
    const boom = vi.fn(() => Promise.reject(new Error('offline')));
    expect(await loadAttribution(boom as unknown as typeof fetch)).toBe(DEFAULT_ATTRIBUTION);
  });
});

describe('padBounds / MAX_BOUNDS', () => {
  it('pads and clamps', () => {
    expect(
      padBounds(
        [
          [170, -80],
          [175, 80],
        ],
        20,
        10,
      ),
    ).toEqual([
      [150, -85],
      [180, 85],
    ]);
  });

  it('contains Australia with sea room', () => {
    const [[w, s], [e, n]] = MAX_BOUNDS;
    expect(w).toBeLessThan(112.5);
    expect(s).toBeLessThan(-44.5);
    expect(e).toBeGreaterThan(154.5);
    expect(n).toBeGreaterThan(-9.5);
  });
});

describe('correctionMailto', () => {
  it('targets the placeholder address and encodes the nation', () => {
    const url = correctionMailto({
      id: 'S31.1',
      name: 'Dja Dja Wurrung',
      synonyms: [],
      lng: 0,
      lat: 0,
      modern: { locality: 'Bendigo', state: 'Victoria', stateCode: 'VIC' },
      links: { austlang: '' },
      source: 'austlang',
    });
    expect(url.startsWith('mailto:corrections@example.org?subject=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Dja Dja Wurrung (S31.1)');
    expect(url).not.toContain(' ');
  });
});
