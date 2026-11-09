/**
 * Downloads the AUSTLANG layer from TLCMap to data/raw/austlang-tlcmap-<date>.geojson.
 *
 * - Never overwrites a snapshot. If today's file exists, or the download is byte-identical to the
 *   newest snapshot, nothing is written (the build always reads the newest snapshot).
 * - Also tries the canonical AIATSIS CSV; if it resolves, stores it beside the GeoJSON and prints
 *   a count/code diff. (On 2026-11-09 api.aiatsis.gov.au did not resolve.)
 * - Network failure is a warning when a snapshot already exists (so `pnpm data:build` can run
 *   offline); pass --strict to make it fatal.
 *
 * Usage: node scripts/fetch-austlang.ts [--strict]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { AIATSIS_CSV_URL, TLCMAP_URL, assertAustlangCollection } from './lib/austlang.ts';
import { parseCsv } from './lib/csv.ts';
import { fetchWithRetry } from './lib/net.ts';
import {
  RAW_DIR,
  ROOT,
  csvSnapshotName,
  newestCsvSnapshot,
  newestSnapshot,
  snapshotName,
  todayAu,
} from './lib/paths.ts';

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const rel = (f: string) => relative(ROOT, f);

async function fetchTlcmap(date: string, strict: boolean): Promise<void> {
  const target = join(RAW_DIR, snapshotName(date));
  if (existsSync(target)) {
    console.log(`[fetch] ${rel(target)} already exists; not overwriting.`);
    return;
  }
  let bytes: Uint8Array;
  try {
    const res = await fetchWithRetry(TLCMAP_URL, { timeoutMs: 60_000, attempts: 3 });
    bytes = new Uint8Array(await res.arrayBuffer());
    assertAustlangCollection(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (err) {
    const prev = newestSnapshot();
    const msg = `[fetch] TLCMap download failed: ${(err as Error).message}`;
    if (strict || !prev) throw new Error(msg, { cause: err });
    console.warn(`${msg}\n[fetch] continuing with ${rel(prev.file)}`);
    return;
  }
  const prev = newestSnapshot();
  if (prev && sha256(readFileSync(prev.file)) === sha256(bytes)) {
    console.log(`[fetch] TLCMap layer unchanged since ${prev.date}; keeping ${rel(prev.file)}.`);
    return;
  }
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(target, bytes);
  console.log(`[fetch] wrote ${rel(target)} (${(bytes.length / 1024).toFixed(0)} KB)`);
}

async function fetchAiatsisCsv(date: string): Promise<void> {
  const target = join(RAW_DIR, csvSnapshotName(date));
  if (existsSync(target)) return;
  let text: string;
  try {
    const res = await fetchWithRetry(AIATSIS_CSV_URL, { timeoutMs: 20_000, attempts: 2 });
    text = await res.text();
    if (!/language_code|austlang/i.test(text.slice(0, 2000)))
      throw new Error('not the AUSTLANG CSV');
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    console.log(
      `[fetch] AIATSIS canonical CSV unavailable (${cause ?? (err as Error).message}); TLCMap mirror only.`,
    );
    return;
  }
  const prev = newestCsvSnapshot();
  if (prev && readFileSync(prev.file, 'utf8') === text) {
    console.log(`[fetch] AIATSIS CSV unchanged since ${prev.date}.`);
    return;
  }
  writeFileSync(target, text);
  const rows = parseCsv(text);
  console.log(
    `[fetch] wrote ${rel(target)} (${rows.length - 1} data rows); see data/report.md for the diff.`,
  );
}

async function main() {
  const { values } = parseArgs({ options: { strict: { type: 'boolean', default: false } } });
  const date = todayAu();
  await fetchTlcmap(date, values.strict);
  await fetchAiatsisCsv(date);
}

await main();
