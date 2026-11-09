import type { Nation, StateCode } from '../types/nation';

export type StateFilter = StateCode | 'ALL';

/**
 * Letters used in Australian language orthographies that `normalize('NFD')` does not decompose,
 * mapped to their usual plain-ASCII spellings (e.g. Yolŋu is commonly written Yolngu).
 */
const LETTER_FOLDS: Readonly<Record<string, string>> = {
  ŋ: 'ng',
  ɲ: 'ny',
  ɳ: 'rn',
  ɭ: 'rl',
  ɻ: 'r',
  ʈ: 'rt',
  ɖ: 'rd',
  ð: 'dh',
  θ: 'th',
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  đ: 'd',
  ł: 'l',
};
const FOLD_RE = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'g');
const COMBINING_MARKS_RE = /\p{M}+/gu;
const APOSTROPHES_RE = /['‘’ʼʻ`´]/g;
const SEPARATORS_RE = /[\s\-‐‑–—/_.,;:()[\]"“”]+/g;

/**
 * Lower-cases, strips diacritics (macrons, umlauts, acutes…), folds ŋ and friends to ASCII digraphs,
 * drops apostrophes, and collapses punctuation/whitespace to single spaces.
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(FOLD_RE, (ch) => LETTER_FOLDS[ch] ?? ch)
    .replace(APOSTROPHES_RE, '')
    .replace(SEPARATORS_RE, ' ')
    .trim();
}

interface SearchIndexEntry {
  name: string;
  synonyms: string[];
  place: string; // locality + state
  all: string; // every field, newline-joined, for token checks
}

// Nation objects are immutable once loaded, so normalised strings can be cached per object.
const indexCache = new WeakMap<Nation, SearchIndexEntry>();

function indexOf(n: Nation): SearchIndexEntry {
  let entry = indexCache.get(n);
  if (!entry) {
    const name = normalizeForSearch(n.peopleName ? `${n.name} ${n.peopleName}` : n.name);
    const synonyms = n.synonyms.map(normalizeForSearch);
    const place = normalizeForSearch(`${n.modern.locality} ${n.modern.state}`);
    entry = { name, synonyms, place, all: [name, ...synonyms, place].join('\n') };
    indexCache.set(n, entry);
  }
  return entry;
}

/** Lower is better. `null` = no match. Every query token must match one of the fields. */
function rank(entry: SearchIndexEntry, query: string, tokens: string[]): number | null {
  if (!tokens.every((t) => entry.all.includes(t))) return null;
  if (entry.name.startsWith(query)) return 0;
  if (entry.name.split(' ').some((w) => w.startsWith(tokens[0]))) return 1;
  if (entry.name.includes(query)) return 2;
  if (entry.synonyms.some((s) => s.startsWith(query))) return 3;
  if (entry.synonyms.some((s) => s.includes(query))) return 4;
  return 5; // tokens spread across fields, or locality/state match
}

/**
 * Case- and diacritic-insensitive search over `name`, `peopleName`, `synonyms`, `modern.locality`
 * and `modern.state`, combined with an exact `modern.stateCode` filter.
 *
 * Empty query → all nations in the state, in input order (nations.json is sorted by name).
 * Otherwise results are ordered: name prefix, name word prefix, name substring, synonym prefix,
 * synonym substring, other; ties keep input order.
 */
export function filterNations(
  nations: readonly Nation[],
  query: string,
  stateFilter: StateFilter,
): Nation[] {
  const inState =
    stateFilter === 'ALL' ? nations : nations.filter((n) => n.modern.stateCode === stateFilter);
  const q = normalizeForSearch(query);
  if (!q) return inState.slice();

  const tokens = q.split(' ');
  const ranked: { n: Nation; r: number; i: number }[] = [];
  inState.forEach((n, i) => {
    const r = rank(indexOf(n), q, tokens);
    if (r !== null) ranked.push({ n, r, i });
  });
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked.map((x) => x.n);
}
