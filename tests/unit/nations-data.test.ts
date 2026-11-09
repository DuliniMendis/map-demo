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
import { overrideErrors } from '../../scripts/lib/overrides.ts';
import {
  ATTRIBUTION_FILE,
  CLEANING_FILE,
  NATIONS_FILE,
  OVERRIDES_FILE,
} from '../../scripts/lib/paths.ts';
import type { SalCacheRecord } from '../../scripts/lib/sal.ts';
import { resolveSal, stateCodeFor } from '../../scripts/lib/sal.ts';
import { nationsSchema, validateAttribution, validateNations } from '../../scripts/lib/validate.ts';
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
