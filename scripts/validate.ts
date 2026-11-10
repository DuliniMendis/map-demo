/**
 * Validates public/data/nations.json against a JSON Schema generated from src/types/nation.ts,
 * plus semantic checks (scripts/lib/validate.ts), and public/data/attribution.json. No network.
 * Prints per-state counts. Exit code 1 on any error.
 *
 * Usage: node scripts/validate.ts
 */
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { STATE_CODES, STATE_NAMES } from '../src/types/nation.ts';
import type { AttributionFile } from './lib/attribution.ts';
import type { CleaningPolicy } from './lib/clean.ts';
import { readJson } from './lib/io.ts';
import { ATTRIBUTION_FILE, CLEANING_FILE, NATIONS_FILE, ROOT } from './lib/paths.ts';
import { nationsSchema, validateAttribution, validateNations } from './lib/validate.ts';

function main() {
  for (const f of [NATIONS_FILE, ATTRIBUTION_FILE]) {
    if (!existsSync(f)) throw new Error(`${relative(ROOT, f)} not found; run pnpm data:build`);
  }
  const data = readJson<{ count?: number }>(NATIONS_FILE);
  const { errors, perState } = validateNations(
    data,
    nationsSchema(),
    readJson<CleaningPolicy>(CLEANING_FILE),
  );
  const attribution = readJson<AttributionFile>(ATTRIBUTION_FILE);
  errors.push(...validateAttribution(attribution));
  const nations = (data as { nations?: { nearby?: unknown }[] }).nations ?? [];
  if (nations.some((n) => n.nearby) && !attribution.items?.some((i) => i.id === 'osm-nearby')) {
    errors.push('attribution: nations.json has OSM `nearby` data but no "osm-nearby" credit');
  }

  console.log(`[validate] ${relative(ROOT, NATIONS_FILE)}: ${data.count ?? '?'} nations`);
  for (const c of STATE_CODES)
    console.log(`  ${c.padEnd(4)} ${STATE_NAMES[c].padEnd(29)} ${perState[c]}`);
  if (errors.length) {
    console.error(errors.map((e) => `  ✗ ${e}`).join('\n'));
    console.error(`[validate] FAILED with ${errors.length} error(s)`);
    process.exitCode = 1;
  } else {
    console.log(
      '[validate] OK (schema from src/types/nation.ts, ids, coordinates, localities, nearby, sort, spot checks, attribution)',
    );
  }
}

main();
