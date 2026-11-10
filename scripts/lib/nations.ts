import type { Nation } from '../../src/types/nation.ts';
import type { AustlangCollection } from './austlang.ts';
import type { CleaningPolicy, SynonymAction } from './clean.ts';
import {
  austlangUrl,
  cleanName,
  cleanPeopleName,
  cleanSynonyms,
  compileExcludes,
  parseCoord,
  round6,
} from './clean.ts';
import { AUSTRALIA_BOUNDS, inBounds } from './geo.ts';

/** A nation before the ABS lookup, overrides and Wikidata links are applied. */
export type BaseNation = Omit<Nation, 'modern' | 'view'>;

export interface DroppedFeature {
  code: string;
  name: string;
  reason: string;
}

export interface ExtractLog {
  caretStripped: string[];
  allCaps: string[];
  peopleOtherCode: { code: string; heading: string; otherCode: string }[];
  coordFallback: string[];
  synonymActions: { code: string; action: SynonymAction }[];
  suspectSynonyms: { code: string; value: string }[];
}

export interface ExtractResult {
  nations: BaseNation[];
  dropped: DroppedFeature[];
  log: ExtractLog;
}

/** Maps TLCMap AUSTLANG features to nations (before ABS lookup), applying the cleaning policy. */
export function extractNations(fc: AustlangCollection, policy: CleaningPolicy): ExtractResult {
  const excludes = compileExcludes(policy.exclude);
  const log: ExtractLog = {
    caretStripped: [],
    allCaps: [],
    peopleOtherCode: [],
    coordFallback: [],
    synonymActions: [],
    suspectSynonyms: [],
  };
  const dropped: DroppedFeature[] = [];
  const nations: BaseNation[] = [];
  const seen = new Set<string>();

  for (const f of fc.features) {
    const p = f.properties;
    const id = String(p.language_code).trim();
    const { name, strippedCaret, allCaps } = cleanName(String(p.language_name));
    if (!id || !name) {
      dropped.push({ code: id || '(none)', name, reason: 'missing code or name' });
      continue;
    }
    if (seen.has(id)) {
      dropped.push({ code: id, name, reason: 'duplicate language_code' });
      continue;
    }

    let lat = parseCoord(p.approximate_latitude_of_language_variety);
    let lng = parseCoord(p.approximate_longitude_of_language_variety);
    if (lat === null || lng === null) {
      lat = parseCoord(p.latitude) ?? parseCoord(f.geometry?.coordinates[1]);
      lng = parseCoord(p.longitude) ?? parseCoord(f.geometry?.coordinates[0]);
      if (lat !== null && lng !== null) log.coordFallback.push(id);
    }
    if (lat === null || lng === null) {
      dropped.push({ code: id, name, reason: 'missing or zero coordinates' });
      continue;
    }
    if (!inBounds(lng, lat, AUSTRALIA_BOUNDS)) {
      dropped.push({ code: id, name, reason: `outside AUSTRALIA_BOUNDS (${lng}, ${lat})` });
      continue;
    }
    seen.add(id);

    if (strippedCaret) log.caretStripped.push(id);
    if (allCaps) log.allCaps.push(id);
    const people = cleanPeopleName(p.thesaurus_heading_people, id);
    if (people.otherCode) {
      log.peopleOtherCode.push({
        code: id,
        heading: String(p.thesaurus_heading_people),
        otherCode: people.otherCode,
      });
    }
    const syn = cleanSynonyms(p.language_synonym, id, name, policy, excludes);
    for (const action of syn.actions) log.synonymActions.push({ code: id, action });
    for (const value of syn.suspect) log.suspectSynonyms.push({ code: id, value });

    nations.push({
      id,
      name,
      ...(people.peopleName ? { peopleName: people.peopleName } : {}),
      synonyms: syn.synonyms,
      lng: round6(lng),
      lat: round6(lat),
      links: { austlang: austlangUrl(p.uri, id) },
      source: 'austlang',
    });
  }
  return { nations, dropped, log };
}

export const byName = (a: { name: string; id: string }, b: { name: string; id: string }): number =>
  a.name.localeCompare(b.name, 'en-AU') || a.id.localeCompare(b.id, 'en-AU');
