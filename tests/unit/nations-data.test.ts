// WS3: validates the committed public/data/*.json (no network) and unit-tests the pipeline's pure
// functions. Runs in CI via `pnpm test`; `pnpm data:validate` runs the same validation standalone.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUSTRALIA_BOUNDS as APP_BOUNDS } from '../../src/map/style/ids.ts';
import type { NationsFile } from '../../src/types/nation.ts';
import type { CleaningPolicy } from '../../scripts/lib/clean.ts';
import {
  austlangUrl,
  cleanName,
  cleanPeopleName,
  cleanSynonyms,
  decodeEntities,
  parseCoord,
} from '../../scripts/lib/clean.ts';
import { csvLanguageCodes, parseCsv } from '../../scripts/lib/csv.ts';
import {
  AUSTRALIA_BOUNDS,
  distanceToRingsKm,
  haversineKm,
  pointInRings,
} from '../../scripts/lib/geo.ts';
import { encodeGpkgPolygon, parseGpkgGeometry } from '../../scripts/lib/gpkg.ts';
import type { OsmFeature, OsmLine } from '../../scripts/lib/nearby.ts';
import {
  LANDMARK_MAX_KM,
  TOWN_MAX_KM,
  clipToPoints,
  compass8,
  decodePolyline,
  encodePolyline,
  fromStored,
  indexFeatures,
  initialBearingDeg,
  nearbyFor,
  nearestFeature,
  nearestOnLines,
  pointsKey,
  pointToLinesKm,
  round1,
  simplifyLine,
  toStored,
} from '../../scripts/lib/nearby.ts';
import { overrideErrors } from '../../scripts/lib/overrides.ts';
import {
  ATTRIBUTION_FILE,
  CLEANING_FILE,
  NATIONS_FILE,
  OVERRIDES_FILE,
} from '../../scripts/lib/paths.ts';
import type { SalCacheRecord } from '../../scripts/lib/sal.ts';
import { resolveSal, stateCodeFor } from '../../scripts/lib/sal.ts';
import {
  nationsSchema,
  nearbyErrors,
  validateAttribution,
  validateNations,
} from '../../scripts/lib/validate.ts';
import { pickWikidata } from '../../scripts/lib/wikidata.ts';

const readJson = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;
const policy = readJson<CleaningPolicy>(CLEANING_FILE);

describe('public/data/nations.json', () => {
  const data = readJson<NationsFile>(NATIONS_FILE);

  it('passes the schema generated from src/types/nation.ts and the semantic checks', () => {
    const { errors } = validateNations(data, nationsSchema(), policy);
    expect(errors).toEqual([]);
  }, 30_000);

  it('has every AUSTLANG point from the snapshot with a locality and state', () => {
    expect(data.count).toBe(data.nations.length);
    expect(data.count).toBeGreaterThanOrEqual(450);
    for (const n of data.nations) {
      expect(n.modern.locality, n.id).not.toBe('');
      expect(n.modern.state, n.id).not.toBe('');
    }
  });

  it('never shows "tribe" in a name, people name or synonym', () => {
    for (const n of data.nations) {
      for (const s of [n.name, n.peopleName ?? '', ...n.synonyms])
        expect(s, n.id).not.toMatch(/\btribes?\b/i);
    }
  });

  it('has valid overrides for known ids', () => {
    const ids = new Set(data.nations.map((n) => n.id));
    expect(overrideErrors(readJson(OVERRIDES_FILE), ids)).toEqual([]);
  });

  it('ships attribution.json with the required credits', () => {
    expect(validateAttribution(readJson(ATTRIBUTION_FILE))).toEqual([]);
  });

  it('credits OpenStreetMap (ODbL) when any nation has nearby data', () => {
    const items = readJson<{ items: { id: string; licence?: string }[] }>(ATTRIBUTION_FILE).items;
    if (data.nations.some((n) => n.nearby)) {
      expect(items.find((i) => i.id === 'osm-nearby')?.licence).toBe('ODbL 1.0');
    }
  });

  it('has nearby towns ≤ 100 km and landmarks ≤ 50 km of the right kinds', () => {
    for (const n of data.nations) if (n.nearby) expect(nearbyErrors(n.id, n.nearby)).toEqual([]);
  });

  it('rejects a broken file', () => {
    const bad = structuredClone(data) as unknown as { nations: Record<string, unknown>[] };
    bad.nations[0].extra = true;
    expect(validateNations(bad, nationsSchema()).errors.join('\n')).toMatch(
      /additional properties/,
    );
    const dup = structuredClone(data);
    dup.nations[1] = {
      ...dup.nations[1],
      id: dup.nations[0].id,
      modern: { ...dup.nations[1].modern, locality: '' },
    };
    const errors = validateNations(dup, nationsSchema()).errors.join('\n');
    expect(errors).toMatch(/duplicate id/);
    expect(errors).toMatch(/empty modern.locality/);
  }, 30_000);
});

describe('pipeline helpers', () => {
  it('keeps its AUSTRALIA_BOUNDS copy equal to src/map/style/ids.ts', () => {
    expect(AUSTRALIA_BOUNDS).toEqual(APP_BOUNDS);
  });

  it('decodes HTML entities without touching spellings', () => {
    expect(decodeEntities('Wik &auml;lk&auml;n')).toBe('Wik älkän');
    expect(decodeEntities('Yua&aacute;t &amp; &quot;x&quot; &#39;y&#x27;')).toBe(`Yuaát & "x" 'y'`);
    expect(decodeEntities('Ba:duk &unknown;')).toBe('Ba:duk &unknown;');
  });

  it('cleans names: trims, drops a trailing ^, keeps capitals', () => {
    expect(cleanName('Djinba^ ')).toEqual({ name: 'Djinba', strippedCaret: true, allCaps: false });
    expect(cleanName('Wangkatja ')).toMatchObject({ name: 'Wangkatja', strippedCaret: false });
    expect(cleanName('NGARINYMAN')).toEqual({
      name: 'NGARINYMAN',
      strippedCaret: false,
      allCaps: true,
    });
  });

  it('strips the trailing code from people headings and notes a foreign code', () => {
    expect(cleanPeopleName('Waljen people A11', 'A11')).toEqual({ peopleName: 'Waljen people' });
    expect(cleanPeopleName('Palawa people T16', 'T2')).toEqual({
      peopleName: 'Palawa people',
      otherCode: 'T16',
    });
    expect(cleanPeopleName('Kurnai people S26.1', 'S26.1')).toEqual({
      peopleName: 'Kurnai people',
    });
    expect(cleanPeopleName(undefined, 'A1')).toEqual({});
  });

  it('extracts the AUSTLANG href from the uri anchor', () => {
    const uri = "<a href='https://collection.aiatsis.gov.au/austlang/language/s31_1'>https://…</a>";
    expect(austlangUrl(uri, 'S31.1')).toBe(
      'https://collection.aiatsis.gov.au/austlang/language/s31_1',
    );
    expect(austlangUrl(null, 'S31.1')).toBe(
      'https://collection.aiatsis.gov.au/austlang/language/s31_1',
    );
  });

  it('cleans synonyms per data/cleaning.json', () => {
    const raw =
      'Sydney, Dharuk, Other Australian Indigenous Languages, Dharuk etc, Daruk, daruk, Dharug / Darug, ' +
      'Broken Bay tribe, Alawa; Alaua, &quot;Bunbury tribe&quot;, Yugambal: Ngarrabul, Kawarrang;, Garumu?ar';
    const r = cleanSynonyms(raw, 'S64', 'Dharug / Darug', policy);
    expect(r.synonyms).toEqual([
      'Sydney',
      'Dharuk',
      'Daruk',
      'Alawa',
      'Alaua',
      'Yugambal',
      'Ngarrabul',
      'Kawarrang',
      'Garumu?ar',
    ]);
    expect(
      r.actions
        .filter((a) => a.kind === 'excluded')
        .map((a) => (a.kind === 'excluded' ? a.value : '')),
    ).toEqual(['Broken Bay tribe', 'Bunbury tribe']);
    expect(r.suspect).toEqual(['Garumu?ar']);
    expect(cleanSynonyms(null, 'A1', 'X', policy).synonyms).toEqual([]);
  });

  it('parses coordinates, treating empty and zero as missing', () => {
    expect(parseCoord('-29.86593028')).toBeCloseTo(-29.86593028);
    expect(parseCoord('')).toBeNull();
    expect(parseCoord('0')).toBeNull();
    expect(parseCoord(null)).toBeNull();
  });

  it('does point-in-polygon with holes and point-to-polygon distance', () => {
    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const hole = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ];
    expect(pointInRings(1, 1, [outer, hole])).toBe(true);
    expect(pointInRings(5, 5, [outer, hole])).toBe(false);
    expect(pointInRings(11, 5, [outer])).toBe(false);
    expect(distanceToRingsKm(1, 1, [outer])).toBe(0);
    expect(distanceToRingsKm(10.1, 5, [outer])).toBeCloseTo(haversineKm(10, 5, 10.1, 5), 1);
  });

  it('round-trips GeoPackage polygon blobs', () => {
    const polys = [
      [
        [
          [148, -35],
          [149, -35],
          [149, -36],
          [148, -35],
        ],
      ],
      [
        [
          [150, -33],
          [151, -33],
          [151, -34],
          [150, -33],
        ],
      ],
    ];
    expect(parseGpkgGeometry(encodeGpkgPolygon(polys))).toEqual(polys.flat());
  });

  it('resolves cached SAL lookups', () => {
    const base: SalCacheRecord = {
      id: 'X1',
      lng: 142.6,
      lat: -10.7,
      source: 'abs-arcgis',
      retrieved: '2026-11-09',
      within: null,
    };
    const hit = {
      salCode: '30717',
      locality: 'Coral Sea',
      state: 'Queensland',
      stateCode: 'QLD' as const,
    };
    expect(resolveSal({ ...base, within: hit }, false)).toMatchObject({
      method: 'within',
      locality: 'Coral Sea',
    });
    expect(resolveSal(base, true)).toBeNull();
    expect(resolveSal({ ...base, nearest: { ...hit, distanceKm: 3.6 } }, true)).toMatchObject({
      method: 'nearest',
      distanceKm: 3.6,
    });
    const offshore = {
      state: 'Queensland',
      stateCode: 'QLD' as const,
      method: 'nearest STE within 10 km',
    };
    expect(resolveSal({ ...base, nearest: null, offshoreState: offshore }, true)).toMatchObject({
      method: 'offshore',
      locality: 'Offshore',
      stateCode: 'QLD',
    });
    expect(stateCodeFor('Other Territories')).toBe('OT');
    expect(() => stateCodeFor('Atlantis')).toThrow();
  });

  it('picks one Wikidata item per code deterministically', () => {
    const picked = pickWikidata([
      { qid: 'Q9', code: 's64', article: 'https://en.wikipedia.org/wiki/Dharug_language' },
      { qid: 'Q2', code: 'S64' },
      { qid: 'Q5', code: 'A1' },
    ]);
    expect(picked.S64).toEqual({
      qid: 'Q9',
      enwiki: 'https://en.wikipedia.org/wiki/Dharug_language',
      alsoQids: ['Q2'],
    });
    expect(picked.A1).toEqual({ qid: 'Q5' });
  });

  it('rejects nearby entries outside the cut-offs or of the wrong kind', () => {
    const errs = nearbyErrors('X1', {
      town: { name: 'Far', kind: 'peak', distanceKm: 100.1, bearing: 'N' },
      landmark: { name: ' ', kind: 'river', distanceKm: 12.34, bearing: 'S' },
    }).join('\n');
    expect(errs).toMatch(/town.kind "peak"/);
    expect(
      nearbyErrors('X1', {
        town: { name: 'Yuendumu', kind: 'village', distanceKm: 12.3, bearing: 'NE' },
      }),
    ).toEqual([]);
    expect(errs).toMatch(/town.distanceKm 100.1 outside 0–100/);
    expect(errs).toMatch(/landmark has an empty name/);
    expect(errs).toMatch(/not rounded to 1 dp/);
    expect(nearbyErrors('X1', {})).toEqual(['X1: nearby has neither town nor landmark']);
  });

  it('parses CSV with quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(csvLanguageCodes('language_code,language_name\nA1,Foo\nB2,"Bar, baz"\n')).toEqual([
      'A1',
      'B2',
    ]);
  });
});

describe('nearby town and landmark (WS8)', () => {
  // Alice Springs (133.8807, -23.6980) as a reference point.
  const lng = 133.8807;
  const lat = -23.698;

  it('measures great-circle distance', () => {
    // One degree of latitude ≈ 111.2 km; Sydney → Melbourne ≈ 713 km.
    expect(haversineKm(133, -23, 133, -24)).toBeCloseTo(111.2, 0);
    expect(haversineKm(151.2093, -33.8688, 144.9631, -37.8136)).toBeCloseTo(713.4, -1);
    expect(round1(12.349)).toBe(12.3);
    expect(round1(12.35)).toBe(12.4);
  });

  it('gives the 8-point bearing from the point to the feature', () => {
    expect(initialBearingDeg(lng, lat, lng, lat + 0.1)).toBeCloseTo(0, 1);
    expect(initialBearingDeg(lng, lat, lng + 0.1, lat)).toBeCloseTo(90, 0);
    expect(initialBearingDeg(lng, lat, lng, lat - 0.1)).toBeCloseTo(180, 1);
    expect(initialBearingDeg(lng, lat, lng - 0.1, lat)).toBeCloseTo(270, 0);
    expect(compass8(initialBearingDeg(lng, lat, lng + 0.1, lat + 0.1))).toBe('NE');
    expect(compass8(initialBearingDeg(lng, lat, lng - 0.1, lat - 0.1))).toBe('SW');
    expect(compass8(initialBearingDeg(lng, lat, lng + 0.1, lat - 0.1))).toBe('SE');
    expect(compass8(initialBearingDeg(lng, lat, lng - 0.1, lat + 0.1))).toBe('NW');
    expect(
      [0, 22.4, 22.5, 67.4, 67.5, 180, 292.5, 337.4, 337.5, 359.9, 360, -10].map(compass8),
    ).toEqual(['N', 'N', 'NE', 'NE', 'E', 'S', 'NW', 'NW', 'N', 'N', 'N', 'N']);
  });

  it('measures a point to the nearest point on a line, not to its vertices', () => {
    // A north–south line 0.1° east of the point, running from 1° south to 1° north of it.
    const line = [
      [lng + 0.1, lat - 1],
      [lng + 0.1, lat + 1],
    ] as [number, number][];
    const p = nearestOnLines(lng, lat, [line])!;
    expect(p.km).toBeCloseTo(haversineKm(lng, lat, lng + 0.1, lat), 2);
    expect(p.lat).toBeCloseTo(lat, 6);
    expect(compass8(initialBearingDeg(lng, lat, p.lng, p.lat))).toBe('E');
    // Beyond the end of the segment the end vertex is nearest.
    expect(pointToLinesKm(lng, lat + 2, [line])).toBeCloseTo(
      haversineKm(lng, lat + 2, lng + 0.1, lat + 1),
      1,
    );
    // Multi-part lines: the nearer part wins; a single-vertex line is a point.
    expect(pointToLinesKm(lng, lat, [line, [[lng, lat + 0.01]]])).toBeCloseTo(1.1, 1);
    expect(nearestOnLines(lng, lat, [])).toBeNull();
  });

  const town = (osm: string, name: string, dLng: number, dLat: number): OsmFeature => ({
    osm,
    name,
    kind: 'town',
    at: [lng + dLng, lat + dLat],
  });

  it('finds the nearest feature and breaks ties deterministically', () => {
    const idx = indexFeatures([
      town('n3', 'Far', 0.5, 0),
      town('n2', 'Beta', 0, 0.1),
      town('n1', 'Alpha', 0, -0.1),
    ]);
    const hit = nearestFeature(lng, lat, idx, 100)!;
    expect(hit.feature.name).toBe('Alpha'); // equal distance N and S: name order
    expect(hit.km).toBeCloseTo(11.1, 1);
  });

  it('counts villages as towns: the nearest place wins whatever its class', () => {
    const village: OsmFeature = {
      osm: 'n7',
      name: 'Yuendumu',
      kind: 'village',
      at: [lng, lat + 0.1],
    };
    const city: OsmFeature = { osm: 'n8', name: 'Big City', kind: 'city', at: [lng, lat - 0.3] };
    const none = indexFeatures([]);
    expect(nearbyFor(lng, lat, indexFeatures([city, village]), none).town).toEqual({
      name: 'Yuendumu',
      kind: 'village',
      distanceKm: 11.1,
      bearing: 'N',
    });
    const farVillage: OsmFeature = { ...village, at: [lng, lat + 0.5] };
    expect(nearbyFor(lng, lat, indexFeatures([city, farVillage]), none).town?.name).toBe(
      'Big City',
    );
    const tooFar: OsmFeature = { ...village, at: [lng, lat + 0.91] }; // ≈ 101 km
    expect(nearbyFor(lng, lat, indexFeatures([tooFar]), none).town).toBeUndefined();
  });

  it('applies the ≤ 100 km (town) and ≤ 50 km (landmark) cut-offs', () => {
    expect(TOWN_MAX_KM).toBe(100);
    expect(LANDMARK_MAX_KM).toBe(50);
    const degFor = (km: number) => km / 111.195; // degrees of latitude for `km`
    const towns = indexFeatures([town('n1', 'Just in', 0, degFor(99.9))]);
    const tooFarTowns = indexFeatures([town('n1', 'Just out', 0, degFor(100.2))]);
    const peak: OsmFeature = {
      osm: 'n9',
      name: 'Mt In',
      kind: 'peak',
      at: [lng, lat - degFor(49.9)],
    };
    const farPeak: OsmFeature = {
      osm: 'n8',
      name: 'Mt Out',
      kind: 'peak',
      at: [lng, lat - degFor(50.2)],
    };
    const river: OsmFeature = {
      osm: 'w1',
      name: 'Long River',
      kind: 'river',
      // The vertices are > 50 km away but the line passes 30 km west of the point.
      lines: [
        [
          [lng - degFor(30) / Math.cos((lat * Math.PI) / 180), lat - 1],
          [lng - degFor(30) / Math.cos((lat * Math.PI) / 180), lat + 1],
        ],
      ],
    };
    expect(nearbyFor(lng, lat, towns, indexFeatures([peak])).town).toMatchObject({
      name: 'Just in',
      kind: 'town',
      bearing: 'N',
    });
    expect(nearbyFor(lng, lat, tooFarTowns, indexFeatures([farPeak]))).toEqual({});
    const r = nearbyFor(lng, lat, towns, indexFeatures([farPeak, peak, river]));
    expect(r.landmark).toEqual({ name: 'Long River', kind: 'river', distanceKm: 30, bearing: 'W' });
    expect(r.osm).toEqual({ town: 'n1', landmark: 'w1' });
    expect(nearbyFor(lng, lat, towns, indexFeatures([farPeak, peak])).landmark).toEqual({
      name: 'Mt In',
      kind: 'peak',
      distanceKm: 49.9,
      bearing: 'S',
    });
  });

  it('clips the committed snapshot to features some nation could be matched with', () => {
    const near = town('n1', 'Near', 0, 0.4); // ≈ 44 km
    const far = town('n2', 'Far', 0, 0.5); // ≈ 56 km
    const line: OsmFeature = {
      osm: 'w1',
      name: 'R',
      kind: 'river',
      lines: [
        [
          [lng + 0.3, lat - 3],
          [lng + 0.3, lat + 3],
        ],
      ],
    };
    expect(clipToPoints([far, line, near], [[lng, lat]], 50)).toEqual([line, near]);
    expect(clipToPoints([far], [[lng, lat]], 100)).toEqual([far]);
    expect(
      pointsKey([
        [1, 2],
        [3, 4],
      ]),
    ).toBe(
      pointsKey([
        [3, 4],
        [1, 2],
      ]),
    );
    expect(pointsKey([[1, 2]])).not.toBe(pointsKey([[1, 2.000001]]));
  });

  it('simplifies and polyline-encodes river lines without moving them', () => {
    const wiggly: [number, number][] = Array.from({ length: 101 }, (_, i) => [
      lng + i * 0.001,
      lat + (i % 2 ? 0.00002 : 0), // ±2 m zig-zag
    ]);
    const simple = simplifyLine(wiggly, 0.01);
    expect(simple).toEqual([wiggly[0], wiggly[100]]);
    const bent: [number, number][] = [
      [lng, lat],
      [lng + 0.05, lat + 0.05],
      [lng + 0.1, lat],
    ];
    expect(simplifyLine(bent, 0.01)).toEqual(bent);
    const enc = encodePolyline(bent);
    expect(
      encodePolyline([
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    decodePolyline(enc).forEach((p, i) => {
      expect(p[0]).toBeCloseTo(bent[i][0], 5);
      expect(p[1]).toBeCloseTo(bent[i][1], 5);
    });
    const f: OsmFeature = { osm: 'w1', name: 'R', kind: 'river', lines: [bent] };
    const back = fromStored(toStored(f));
    expect(pointToLinesKm(lng + 0.05, lat, (back as OsmLine).lines)).toBeCloseTo(
      pointToLinesKm(lng + 0.05, lat, [bent]),
      2,
    );
  });
});
