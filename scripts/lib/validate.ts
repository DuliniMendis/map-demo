import { Ajv } from 'ajv';
import { createGenerator } from 'ts-json-schema-generator';
import type { Nation, NationsFile, StateCode } from '../../src/types/nation.ts';
import { STATE_CODES, STATE_NAMES } from '../../src/types/nation.ts';
import type { AttributionFile } from './attribution.ts';
import type { CleaningPolicy } from './clean.ts';
import { compileExcludes, isAustlangUrl } from './clean.ts';
import { AUSTRALIA_BOUNDS, inBounds } from './geo.ts';
import { byName } from './nations.ts';
import { LANDMARK_MAX_KM, TOWN_MAX_KM } from './nearby.ts';
import { NATION_TYPES_FILE } from './paths.ts';
import { SPOT_CHECKS } from './spot-checks.ts';

/** JSON Schema for `NationsFile`, generated from src/types/nation.ts (the contract). */
export function nationsSchema(): Record<string, unknown> {
  return createGenerator({
    path: NATION_TYPES_FILE,
    type: 'NationsFile',
    skipTypeCheck: true,
    additionalProperties: false,
    expose: 'export',
    topRef: true,
  }).createSchema('NationsFile') as Record<string, unknown>;
}

export interface ValidationResult {
  errors: string[];
  perState: Record<StateCode, number>;
}

/**
 * Schema + semantic checks on a parsed nations.json: unique ids, coordinates in Australia,
 * non-empty locality/state, state name ↔ code, sort order, synonyms tidy, spot checks.
 */
export function validateNations(
  data: unknown,
  schema: Record<string, unknown>,
  policy?: CleaningPolicy,
): ValidationResult {
  const errors: string[] = [];
  const perState = Object.fromEntries(STATE_CODES.map((c) => [c, 0])) as Record<StateCode, number>;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    for (const e of (validate.errors ?? []).slice(0, 50)) {
      errors.push(`schema: ${e.instancePath || '/'} ${e.message ?? ''}`);
    }
    return { errors, perState };
  }
  const file = data as NationsFile;
  if (file.count !== file.nations.length)
    errors.push(`count ${file.count} ≠ nations.length ${file.nations.length}`);
  if (!/^\d{4}-\d{2}-\d{2}/.test(file.generatedAt))
    errors.push(`generatedAt "${file.generatedAt}" is not an ISO date`);
  const excludes = policy ? compileExcludes(policy.exclude) : [];

  const ids = new Set<string>();
  file.nations.forEach((n, i) => {
    const at = `${n.id} (${n.name})`;
    if (ids.has(n.id)) errors.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    if (!/^[A-Z]{1,2}\d+(\.\d+)?$/.test(n.id)) errors.push(`${at}: id is not an AUSTLANG code`);
    if (!n.name.trim() || n.name !== n.name.trim()) errors.push(`${at}: name empty or untrimmed`);
    if (!Number.isFinite(n.lng) || !Number.isFinite(n.lat) || n.lng === 0 || n.lat === 0) {
      errors.push(`${at}: bad coordinates`);
    } else if (!inBounds(n.lng, n.lat, AUSTRALIA_BOUNDS)) {
      errors.push(`${at}: (${n.lng}, ${n.lat}) outside AUSTRALIA_BOUNDS`);
    }
    if (!n.modern.locality.trim()) errors.push(`${at}: empty modern.locality`);
    if (!n.modern.state.trim()) errors.push(`${at}: empty modern.state`);
    if (STATE_NAMES[n.modern.stateCode] !== n.modern.state) {
      errors.push(
        `${at}: state "${n.modern.state}" does not match stateCode ${n.modern.stateCode}`,
      );
    }
    perState[n.modern.stateCode]++;
    if (!isAustlangUrl(n.links.austlang))
      errors.push(`${at}: links.austlang "${n.links.austlang}"`);
    if (n.links.wikipedia && !n.links.wikipedia.startsWith('https://en.wikipedia.org/wiki/')) {
      errors.push(`${at}: links.wikipedia "${n.links.wikipedia}"`);
    }
    const seen = new Set<string>();
    for (const s of n.synonyms) {
      if (!s || s !== s.trim()) errors.push(`${at}: empty or untrimmed synonym "${s}"`);
      const k = s.toLocaleLowerCase('en-AU');
      if (seen.has(k)) errors.push(`${at}: duplicate synonym "${s}"`);
      seen.add(k);
      if (/&[a-z]+;|&#\d+;/i.test(s)) errors.push(`${at}: undecoded HTML entity in "${s}"`);
      const ex = excludes.find((e) => e.re.test(s));
      if (ex) errors.push(`${at}: synonym "${s}" should be excluded (${ex.reason})`);
    }
    if (
      n.peopleName !== undefined &&
      (!n.peopleName.trim() || /\s[A-Z]{1,2}\d+(\.\d+)?$/.test(n.peopleName))
    ) {
      errors.push(`${at}: peopleName "${n.peopleName}" empty or still ends with a code`);
    }
    if (n.nearby) errors.push(...nearbyErrors(at, n.nearby));
    if (i > 0 && byName(file.nations[i - 1], n) > 0) {
      errors.push(`not sorted by name (en-AU): "${file.nations[i - 1].name}" before "${n.name}"`);
    }
  });

  for (const s of SPOT_CHECKS) {
    const n = file.nations.find((x) => x.id === s.id);
    if (!n) errors.push(`spot check: ${s.id} ${s.name} missing`);
    else if (n.modern.locality !== s.locality || n.modern.stateCode !== s.stateCode) {
      errors.push(
        `spot check: ${s.id} → "${n.modern.locality}, ${n.modern.stateCode}", expected "${s.locality}, ${s.stateCode}"`,
      );
    }
  }
  return { errors, perState };
}

const NEARBY_SLOTS = {
  town: { kinds: ['city', 'town', 'village'], maxKm: TOWN_MAX_KM },
  landmark: { kinds: ['peak', 'river', 'lake', 'range'], maxKm: LANDMARK_MAX_KM },
} as const;

/** WS8: kind fits the slot, distance within the cut-off and rounded to 1 dp, name non-empty. */
export function nearbyErrors(at: string, nearby: NonNullable<Nation['nearby']>): string[] {
  const errors: string[] = [];
  if (!nearby.town && !nearby.landmark) errors.push(`${at}: nearby has neither town nor landmark`);
  for (const slot of ['town', 'landmark'] as const) {
    const f = nearby[slot];
    if (!f) continue;
    const { kinds, maxKm } = NEARBY_SLOTS[slot];
    if (!f.name.trim()) errors.push(`${at}: nearby.${slot} has an empty name`);
    if (!(kinds as readonly string[]).includes(f.kind))
      errors.push(`${at}: nearby.${slot}.kind "${f.kind}" not one of ${kinds.join('|')}`);
    if (!Number.isFinite(f.distanceKm) || f.distanceKm < 0 || f.distanceKm > maxKm)
      errors.push(`${at}: nearby.${slot}.distanceKm ${f.distanceKm} outside 0–${maxKm}`);
    else if (Math.round(f.distanceKm * 10) / 10 !== f.distanceKm)
      errors.push(`${at}: nearby.${slot}.distanceKm ${f.distanceKm} not rounded to 1 dp`);
  }
  return errors;
}

export function validateAttribution(data: unknown): string[] {
  const errors: string[] = [];
  const a = data as Partial<AttributionFile> | null;
  if (!a || !Array.isArray(a.items) || typeof a.disclaimer !== 'string')
    return ['attribution: malformed file'];
  const required = [
    'austlang',
    'abs-asgs',
    'mapterhorn',
    'aws-terrain',
    'eox-s2cloudless',
    'openmaptiles',
    'maplibre',
  ];
  for (const id of required) {
    if (!a.items.some((i) => i.id === id)) errors.push(`attribution: missing item "${id}"`);
  }
  for (const i of a.items) {
    if (!i.text || !/^https:\/\//.test(i.url))
      errors.push(`attribution: item "${i.id}" lacks text or https url`);
  }
  return errors;
}
