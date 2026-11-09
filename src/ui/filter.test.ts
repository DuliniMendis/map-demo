import { describe, expect, it } from 'vitest';
import mock from '../data/mock-nations.json';
import type { Nation, StateCode } from '../types/nation';
import { filterNations, normalizeForSearch } from './filter';

const mockNations = mock.nations as Nation[];

function nation(
  id: string,
  name: string,
  opts: { synonyms?: string[]; locality?: string; state?: string; stateCode?: StateCode } = {},
): Nation {
  return {
    id,
    name,
    synonyms: opts.synonyms ?? [],
    lng: 0,
    lat: 0,
    modern: {
      locality: opts.locality ?? 'Somewhere',
      state: opts.state ?? 'Northern Territory',
      stateCode: opts.stateCode ?? 'NT',
    },
    links: { austlang: `https://collection.aiatsis.gov.au/austlang/language/${id.toLowerCase()}` },
    source: 'austlang',
  };
}

const yolngu = nation('N230', 'Yolŋu Matha', { synonyms: ['Yolngu', 'Murngin'] });
const pitjantjatjara = nation('C6', 'Pitjantjatjara', {
  synonyms: ['Pitjantjara'],
  locality: 'Amata',
  state: 'South Australia',
  stateCode: 'SA',
});
const kaurna = nation('L3', 'Kaurna', {
  synonyms: ['Adelaide', 'Meyu'],
  locality: 'Adelaide',
  state: 'South Australia',
  stateCode: 'SA',
});
const macron = nation('X1', 'Kūku Yalanji', {
  synonyms: ['Gugu Yalanji'],
  locality: 'Mossman',
  state: 'Queensland',
  stateCode: 'QLD',
});
const apostrophe = nation('X2', "Ngunawal (Ngun'awal)", {
  locality: 'Canberra',
  state: 'Australian Capital Territory',
  stateCode: 'ACT',
});
const fixtures = [kaurna, macron, apostrophe, pitjantjatjara, yolngu];
const ids = (ns: Nation[]) => ns.map((n) => n.id);

describe('normalizeForSearch', () => {
  it('lower-cases and strips combining diacritics (macrons, acutes, umlauts)', () => {
    expect(normalizeForSearch('Kūku Yalanji')).toBe('kuku yalanji');
    expect(normalizeForSearch('ÉÀÜ ā ī ū')).toBe('eau a i u');
  });

  it('folds ŋ (and capital Ŋ) to "ng", which NFD alone does not decompose', () => {
    expect('ŋ'.normalize('NFD')).toBe('ŋ');
    expect(normalizeForSearch('Yolŋu')).toBe('yolngu');
    expect(normalizeForSearch('ŊARRA')).toBe('ngarra');
  });

  it('drops apostrophes and collapses punctuation and whitespace', () => {
    expect(normalizeForSearch("  Ngun'awal  ")).toBe('ngunawal');
    expect(normalizeForSearch('Dharug / Darug')).toBe('dharug darug');
    expect(normalizeForSearch('Jar-gow  wer–rong')).toBe('jar gow wer rong');
  });
});

describe('filterNations', () => {
  it('returns every nation (a copy, in input order) for an empty or blank query', () => {
    const out = filterNations(fixtures, '', 'ALL');
    expect(ids(out)).toEqual(ids(fixtures));
    expect(out).not.toBe(fixtures);
    expect(ids(filterNations(fixtures, '   ', 'ALL'))).toEqual(ids(fixtures));
  });

  it('is case-insensitive', () => {
    expect(ids(filterNations(fixtures, 'KAURNA', 'ALL'))).toEqual(['L3']);
    expect(ids(filterNations(fixtures, 'kaurna', 'ALL'))).toEqual(['L3']);
  });

  it('matches ŋ whether the user types "ng" or "ŋ"', () => {
    expect(ids(filterNations(fixtures, 'yolngu matha', 'ALL'))).toEqual(['N230']);
    expect(ids(filterNations(fixtures, 'Yolŋu', 'ALL'))).toEqual(['N230']);
    expect(ids(filterNations(fixtures, 'YOLŊU', 'ALL'))).toEqual(['N230']);
  });

  it('matches macrons and other diacritics in either direction', () => {
    expect(ids(filterNations(fixtures, 'kuku', 'ALL'))).toEqual(['X1']);
    expect(ids(filterNations(fixtures, 'kūku', 'ALL'))).toEqual(['X1']);
    expect(ids(filterNations(fixtures, 'kúkú', 'ALL'))).toEqual(['X1']);
  });

  it('ignores apostrophes', () => {
    expect(ids(filterNations(fixtures, 'ngunawal', 'ALL'))).toEqual(['X2']);
    expect(ids(filterNations(fixtures, "ngun'a", 'ALL'))).toEqual(['X2']);
  });

  it('matches synonyms', () => {
    expect(ids(filterNations(fixtures, 'murngin', 'ALL'))).toEqual(['N230']);
    expect(ids(filterNations(fixtures, 'gugu', 'ALL'))).toEqual(['X1']);
    // Real AUSTLANG synonym from the mock file.
    expect(ids(filterNations(mockNations, 'oharruk', 'ALL'))).toEqual(['S64']);
  });

  it('matches modern locality and state name', () => {
    expect(ids(filterNations(fixtures, 'mossman', 'ALL'))).toEqual(['X1']);
    expect(ids(filterNations(fixtures, 'south australia', 'ALL'))).toEqual(['L3', 'C6']);
    expect(ids(filterNations(mockNations, 'jenolan', 'ALL'))).toEqual(['S64']);
  });

  it('requires every word of a multi-word query, across fields', () => {
    expect(ids(filterNations(fixtures, 'kaurna adelaide', 'ALL'))).toEqual(['L3']);
    expect(ids(filterNations(fixtures, 'kaurna queensland', 'ALL'))).toEqual([]);
  });

  it('ranks name matches above synonym and locality matches', () => {
    // "adelaide" is Kaurna's locality and a synonym; a nation *named* Adelaide… ranks first.
    const named = nation('Z9', 'Adelaide Plains', { stateCode: 'SA', state: 'South Australia' });
    expect(ids(filterNations([kaurna, named], 'adelaide', 'ALL'))).toEqual(['Z9', 'L3']);
  });

  it('applies the state filter alone', () => {
    expect(ids(filterNations(fixtures, '', 'SA'))).toEqual(['L3', 'C6']);
    expect(ids(filterNations(fixtures, '', 'TAS'))).toEqual([]);
    expect(ids(filterNations(mockNations, '', 'WA'))).toHaveLength(2);
  });

  it('combines the state filter with the query', () => {
    expect(ids(filterNations(fixtures, 'pitjantjatjara', 'SA'))).toEqual(['C6']);
    expect(ids(filterNations(fixtures, 'pitjantjatjara', 'NT'))).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterNations(fixtures, 'zzzz', 'ALL')).toEqual([]);
  });

  it('does not mutate its input', () => {
    const copy = fixtures.slice();
    filterNations(fixtures, 'a', 'ALL');
    expect(fixtures).toEqual(copy);
  });
});
