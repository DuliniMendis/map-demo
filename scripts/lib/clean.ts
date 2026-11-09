/**
 * Cleaning rules for AUSTLANG text fields. Policy (also in data/report.md and the PR):
 *
 * - AUSTLANG spellings are never altered: no re-casing, no respelling, no diacritic changes.
 * - HTML entities (`&quot;`, `&auml;` …) are decoded: that restores the source text.
 * - `language_name`: trimmed, whitespace collapsed, trailing `^` marker removed. ALL-CAPS names stay.
 * - `thesaurus_heading_people`: the trailing AUSTLANG code is removed ("Palawa people T16" → "Palawa people").
 * - `language_synonym`: split on ", " (contract) and on "; " (an in-field sub-separator), stray quotes
 *   and a trailing " etc" removed, de-duplicated (case-insensitive, and against the name).
 *   Classification labels ("Other Australian Indigenous Languages") and editorial notes are dropped
 *   or reduced to the name they contain, as listed in data/cleaning.json. Entries matching the
 *   cleaning file's `exclude` patterns (e.g. "… tribe") are left out of `synonyms`; every removal is
 *   listed in data/report.md.
 */

export interface ExcludeRule {
  pattern: string;
  flags?: string;
  reason: string;
}

export interface CleaningPolicy {
  /** Synonyms dropped everywhere (compared case-insensitively after normalisation). */
  drop: string[];
  /** Exact (entity-decoded, whitespace-collapsed) synonym fragment → replacement list ([] = drop). */
  replace: Record<string, string[]>;
  /** Per-nation drops for fragments that only make sense in one record. */
  dropFor: Record<string, string[]>;
  /** Synonyms matching any of these are excluded from display (and reported). */
  exclude: ExcludeRule[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};
const ACCENTS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  uml: '̈',
  circ: '̂',
  tilde: '̃',
  cedil: '̧',
  ring: '̊',
};

/** Decodes the HTML entities seen in the TLCMap export (named, accented-letter, numeric). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (body in NAMED_ENTITIES) return NAMED_ENTITIES[body];
    const accent = /^([a-z])(acute|grave|uml|circ|tilde|cedil|ring)$/i.exec(body);
    if (accent) return (accent[1] + ACCENTS[accent[2]]).normalize('NFC');
    return m;
  });
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface NameResult {
  name: string;
  strippedCaret: boolean;
  allCaps: boolean;
}

export function cleanName(raw: string): NameResult {
  const decoded = collapse(decodeEntities(raw));
  const name = decoded.replace(/\s*\^+$/, '');
  return {
    name,
    strippedCaret: name !== decoded,
    allCaps: /[A-Z]/.test(name) && name === name.toUpperCase() && name.length > 3,
  };
}

const CODE_SUFFIX = /\s+([A-Z]{1,2}\d+(?:\.\d+)?)$/;

export interface PeopleResult {
  peopleName?: string;
  /** The code at the end of the heading, when it differs from the feature's own code. */
  otherCode?: string;
}

export function cleanPeopleName(raw: string | null | undefined, code: string): PeopleResult {
  if (!raw) return {};
  const decoded = collapse(decodeEntities(raw));
  const m = CODE_SUFFIX.exec(decoded);
  const peopleName = m ? decoded.slice(0, m.index).trim() : decoded;
  const otherCode = m && m[1].toUpperCase() !== code.toUpperCase() ? m[1] : undefined;
  return { ...(peopleName ? { peopleName } : {}), ...(otherCode ? { otherCode } : {}) };
}

const AUSTLANG_PAGE = /^https:\/\/collection\.aiatsis\.gov\.au\/austlang\/language\/[a-z0-9_]+$/;

/** AUSTLANG page URL from the `uri` field (an `<a href='…'>` string), or derived from the code. */
export function austlangUrl(uri: string | null | undefined, code: string): string {
  const href = uri ? (/href=['"]([^'"]+)['"]/.exec(uri)?.[1] ?? uri.trim()) : '';
  if (AUSTLANG_PAGE.test(href)) return href;
  return `https://collection.aiatsis.gov.au/austlang/language/${code.toLowerCase().replace('.', '_')}`;
}
export const isAustlangUrl = (u: string): boolean => AUSTLANG_PAGE.test(u);

export type SynonymAction =
  | { kind: 'replaced'; from: string; to: string[] }
  | { kind: 'dropped'; value: string; why: string }
  | { kind: 'excluded'; value: string; why: string };

export interface SynonymResult {
  synonyms: string[];
  actions: SynonymAction[];
  /** Kept synonyms that contain `?` or digits, i.e. probably damaged in the source encoding. */
  suspect: string[];
}

/** Case-insensitive only: spacing/hyphen variants ("Wik Kalkan" vs "Wikkalkan") are distinct spellings. */
const dedupeKey = (s: string) => s.toLocaleLowerCase('en-AU');

export function compileExcludes(rules: readonly ExcludeRule[]): { re: RegExp; reason: string }[] {
  return rules.map((r) => ({ re: new RegExp(r.pattern, r.flags ?? 'i'), reason: r.reason }));
}

export function cleanSynonyms(
  raw: string | null | undefined,
  code: string,
  name: string,
  policy: CleaningPolicy,
  excludes = compileExcludes(policy.exclude),
): SynonymResult {
  const actions: SynonymAction[] = [];
  const suspect: string[] = [];
  if (!raw) return { synonyms: [], actions, suspect };
  const drop = new Set(policy.drop.map(dedupeKey));
  const dropFor = new Set((policy.dropFor[code] ?? []).map(dedupeKey));

  const pieces: string[] = [];
  for (const frag of decodeEntities(raw).split(', ')) {
    const f = collapse(frag);
    if (f in policy.replace) {
      const to = policy.replace[f];
      actions.push({ kind: 'replaced', from: f, to });
      pieces.push(...to);
    } else {
      pieces.push(...f.split(/;\s*/));
    }
  }

  const seen = new Set([dedupeKey(name)]);
  const out: string[] = [];
  for (const p of pieces) {
    const s = collapse(p.replace(/["“”]/g, ''))
      .replace(/[;:,]+$/, '')
      .replace(/\s+etc\.?$/i, '');
    if (!s) continue;
    const key = dedupeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    if (drop.has(key) || dropFor.has(key)) {
      actions.push({
        kind: 'dropped',
        value: s,
        why: 'classification label, "etc" or split fragment',
      });
      continue;
    }
    const ex = excludes.find((e) => e.re.test(s));
    if (ex) {
      actions.push({ kind: 'excluded', value: s, why: ex.reason });
      continue;
    }
    out.push(s);
    if (/[?\d]/.test(s)) suspect.push(s);
  }
  return { synonyms: out, actions, suspect };
}

/** Parses a coordinate field that may be a string, number, empty or null. */
export function parseCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
