/**
 * Builds public/data/nations.json, public/data/attribution.json and data/report.md from the newest
 * data/raw snapshot plus the committed caches (data/cache/sal, data/cache/wikidata.json),
 * data/cache/osm/nearby.json, data/cleaning.json and data/overrides.json. No network: run
 * abs-lookup.ts / nearby.ts / wikidata.ts first (`pnpm data:build` does).
 *
 * Usage: node scripts/build-nations.ts [--no-nearest]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import type { Nation, NationImage, NationsFile, StateCode } from '../src/types/nation.ts';
import { STATE_CODES, STATE_NAMES } from '../src/types/nation.ts';
import { buildAttribution } from './lib/attribution.ts';
import { TLCMAP_URL, assertAustlangCollection } from './lib/austlang.ts';
import type { CleaningPolicy } from './lib/clean.ts';
import { csvLanguageCodes } from './lib/csv.ts';
import { haversineKm } from './lib/geo.ts';
import { readJson, writeText } from './lib/io.ts';
import type { NearbyCache } from './lib/nearby-cache.ts';
import { OSM_CLASSES } from './lib/nearby-cache.ts';
import { LANDMARK_MAX_KM, TOWN_MAX_KM } from './lib/nearby.ts';
import type { ExtractResult } from './lib/nations.ts';
import { byName, extractNations } from './lib/nations.ts';
import type { ImageManifest } from './lib/nation-images.ts';
import type { Overrides } from './lib/overrides.ts';
import { overrideErrors, overrideFields } from './lib/overrides.ts';
import {
  ATTRIBUTION_FILE,
  CLEANING_FILE,
  IMAGES_DIR,
  IMAGES_FILE,
  NATIONS_FILE,
  NEARBY_CACHE,
  OVERRIDES_FILE,
  REPORT_FILE,
  ROOT,
  SAL_CACHE_DIR,
  WIKIDATA_CACHE,
  newestCsvSnapshot,
  newestSnapshot,
  todayAu,
} from './lib/paths.ts';
import type { Resolution, SalCacheRecord } from './lib/sal.ts';
import { resolveSal } from './lib/sal.ts';
import { SPOT_CHECKS } from './lib/spot-checks.ts';
import type { WikidataCache } from './lib/wikidata.ts';

const rel = (f: string) => relative(ROOT, f);

/** One nation per line: compact (~120 KB class) yet reviewable as a per-nation diff. */
function serialiseNations(file: NationsFile): string {
  const lines = file.nations.map((n) => `    ${JSON.stringify(n)}`);
  return (
    `{\n  "generatedAt": ${JSON.stringify(file.generatedAt)},\n  "count": ${file.count},\n` +
    `  "nations": [\n${lines.join(',\n')}\n  ]\n}\n`
  );
}

interface BuildContext {
  snapshot: { file: string; date: string; sha: string; features: number };
  extract: ExtractResult;
  nations: Nation[];
  resolutions: Map<string, Resolution>;
  overrides: Overrides;
  wikidata: WikidataCache | null;
  nearby: NearbyCache | null;
  csv: { file: string; codes: string[] } | null;
}

function imageFor(
  id: string,
  entry: ImageManifest[string] | undefined,
  errors: string[],
): NationImage | undefined {
  if (!entry || typeof entry === 'string') return undefined;
  const src = `images/nations/${id}.webp`;
  if (!existsSync(join(IMAGES_DIR, `${id}.webp`))) {
    errors.push(`data/images.json: ${id} has no public/${src}`);
    return undefined;
  }
  if (!entry.alt?.trim() || !entry.credit?.trim()) {
    errors.push(`data/images.json: ${id} needs both "alt" and "credit"`);
    return undefined;
  }
  return { src, alt: entry.alt.trim(), credit: entry.credit.trim() };
}

function main() {
  const { values } = parseArgs({ options: { 'no-nearest': { type: 'boolean', default: false } } });
  const useNearest = !values['no-nearest'];

  const snap = newestSnapshot();
  if (!snap)
    throw new Error('no data/raw/austlang-tlcmap-*.geojson; run node scripts/fetch-austlang.ts');
  const bytes = readFileSync(snap.file);
  const fc: unknown = JSON.parse(bytes.toString('utf8'));
  assertAustlangCollection(fc);
  const policy = readJson<CleaningPolicy>(CLEANING_FILE);
  const extract = extractNations(fc, policy);

  const overrides = readJson<Overrides>(OVERRIDES_FILE);
  const errors = overrideErrors(overrides, new Set(extract.nations.map((n) => n.id)));

  const wikidata = existsSync(WIKIDATA_CACHE) ? readJson<WikidataCache>(WIKIDATA_CACHE) : null;
  const nearbyCache = existsSync(NEARBY_CACHE) ? readJson<NearbyCache>(NEARBY_CACHE) : null;
  const images = existsSync(IMAGES_FILE) ? readJson<ImageManifest>(IMAGES_FILE) : {};
  const ids = new Set(extract.nations.map((n) => n.id));
  for (const id of Object.keys(images)) {
    if (!id.startsWith('_') && !ids.has(id))
      errors.push(`data/images.json: unknown nation id ${id}`);
  }
  const resolutions = new Map<string, Resolution>();
  const nations: Nation[] = [];
  for (const base of extract.nations) {
    const file = join(SAL_CACHE_DIR, `${base.id}.json`);
    const rec = existsSync(file) ? readJson<SalCacheRecord>(file) : null;
    const res =
      rec && rec.lng === base.lng && rec.lat === base.lat ? resolveSal(rec, useNearest) : null;
    if (!res) {
      errors.push(
        `${base.id} ${base.name}: no usable SAL cache entry (run node scripts/abs-lookup.ts --nearest)`,
      );
      continue;
    }
    resolutions.set(base.id, res);
    const enwiki = wikidata?.codes[base.id.toUpperCase()]?.enwiki;
    const o = overrides[base.id] ? overrideFields(overrides[base.id]) : {};
    const near = nearbyCache?.nations[base.id];
    const nearOk = near && near.lng === base.lng && near.lat === base.lat;
    if (nearbyCache && !nearOk) {
      errors.push(
        `${base.id} ${base.name}: no nearby.json entry for this point (run node scripts/nearby.ts)`,
      );
    }
    const nearby =
      nearOk && (near.town || near.landmark)
        ? {
            ...(near.town ? { town: near.town } : {}),
            ...(near.landmark ? { landmark: near.landmark } : {}),
          }
        : undefined;
    const image = imageFor(base.id, images[base.id], errors);
    nations.push({
      id: base.id,
      name: o.name ?? base.name,
      ...(base.peopleName ? { peopleName: base.peopleName } : {}),
      synonyms: base.synonyms,
      lng: base.lng,
      lat: base.lat,
      modern: { locality: res.locality, state: res.state, stateCode: res.stateCode },
      links: { austlang: base.links.austlang, ...(enwiki ? { wikipedia: enwiki } : {}) },
      ...(o.view ? { view: o.view } : {}),
      ...(nearby ? { nearby } : {}),
      ...(image ? { image } : {}),
      source: 'austlang',
    });
  }
  if (errors.length) {
    console.error(errors.map((e) => `  ✗ ${e}`).join('\n'));
    throw new Error(`build failed with ${errors.length} error(s)`);
  }
  nations.sort(byName);

  const generatedAt = todayAu();
  const out: NationsFile = { generatedAt, count: nations.length, nations };
  writeText(NATIONS_FILE, serialiseNations(out));
  const linked = nations.some((n) => n.links.wikipedia);
  const withOsm = nations.some((n) => n.nearby);
  writeText(
    ATTRIBUTION_FILE,
    `${JSON.stringify(buildAttribution(generatedAt, linked, withOsm), null, 2)}\n`,
  );

  const csvSnap = newestCsvSnapshot();
  const ctx: BuildContext = {
    snapshot: {
      file: snap.file,
      date: snap.date,
      sha: createHash('sha256').update(bytes).digest('hex'),
      features: fc.features.length,
    },
    extract,
    nations,
    resolutions,
    overrides,
    wikidata,
    nearby: nearbyCache,
    csv: csvSnap
      ? { file: csvSnap.file, codes: csvLanguageCodes(readFileSync(csvSnap.file, 'utf8')) }
      : null,
  };
  writeText(REPORT_FILE, report(ctx));
  console.log(
    `[build] ${nations.length} nations → ${rel(NATIONS_FILE)} (${(serialiseNations(out).length / 1024).toFixed(0)} KB); ` +
      `${extract.dropped.length} dropped; report in ${rel(REPORT_FILE)}`,
  );
}

const md = (s: string) => s.replace(/\|/g, '\\|');
const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map((c) => md(String(c))).join(' | ')} |`),
  ].join('\n');

function report(ctx: BuildContext): string {
  const { extract, nations, resolutions, snapshot } = ctx;
  const byId = new Map(nations.map((n) => [n.id, n]));
  const label = (id: string) => `${id} ${byId.get(id)?.name ?? ''}`.trim();
  const out: string[] = [];
  const h = (s: string) => out.push('', `## ${s}`, '');

  out.push(
    '# Data build report',
    '',
    '_Generated by `scripts/build-nations.ts`; do not edit by hand. Re-run `pnpm data:build`._',
    '',
    table(
      ['Item', 'Value'],
      [
        ['Source', `${TLCMAP_URL} (AUSTLANG © AIATSIS, CC BY 4.0)`],
        ['Snapshot', `\`${rel(snapshot.file)}\` (sha256 \`${snapshot.sha.slice(0, 16)}…\`)`],
        ['Features in snapshot', snapshot.features],
        ['Nations written', nations.length],
        ['Dropped', extract.dropped.length],
        ['Generated', nations.length ? todayAu() : '—'],
      ],
    ),
  );

  h('AIATSIS canonical CSV');
  if (!ctx.csv) {
    out.push(
      'Not available: `collection.aiatsis.gov.au/datasets/austlang/001.csv` redirects to `api.aiatsis.gov.au`, ' +
        'which did not resolve when the snapshot was taken. The TLCMap mirror is the only source.',
    );
  } else {
    const csvCodes = new Set(ctx.csv.codes.map((c) => c.toUpperCase()));
    const ours = new Set(nations.map((n) => n.id.toUpperCase()));
    const onlyCsv = [...csvCodes].filter((c) => !ours.has(c));
    const onlyOurs = [...ours].filter((c) => !csvCodes.has(c));
    out.push(
      `\`${rel(ctx.csv.file)}\`: ${csvCodes.size} codes. In CSV but not in nations.json: ${onlyCsv.length}` +
        (onlyCsv.length
          ? ` (${onlyCsv.slice(0, 40).join(', ')}${onlyCsv.length > 40 ? ', …' : ''})`
          : '') +
        `. In nations.json but not in CSV: ${onlyOurs.length}` +
        (onlyOurs.length ? ` (${onlyOurs.join(', ')})` : '') +
        '.',
    );
  }

  h('Nations per state / territory');
  const perState = new Map<StateCode, number>();
  for (const n of nations)
    perState.set(n.modern.stateCode, (perState.get(n.modern.stateCode) ?? 0) + 1);
  out.push(
    table(
      ['Code', 'State / territory', 'Nations'],
      [
        ...STATE_CODES.map((c) => [c, STATE_NAMES[c], perState.get(c) ?? 0]),
        ['', '**Total**', nations.length],
      ],
    ),
  );

  h('"Country today" lookup (ABS ASGS 2021 SAL)');
  const methods = { within: 0, nearest: 0, offshore: 0 };
  for (const r of resolutions.values()) methods[r.method]++;
  out.push(
    `- Point inside a SAL polygon: **${methods.within}**`,
    `- Point in the sea, nearest SAL within 25 km used: **${methods.nearest}**`,
    `- Offshore (no SAL within 25 km; locality "Offshore", state from ABS STE): **${methods.offshore}**`,
    '- Lookup failures: **0** (the build fails on any missing lookup)',
  );
  const notWithin = nations.filter((n) => resolutions.get(n.id)?.method !== 'within');
  if (notWithin.length) {
    out.push(
      '',
      table(
        ['Id', 'Name', 'Method', 'Locality', 'State', 'Distance (km)'],
        notWithin.map((n) => {
          const r = resolutions.get(n.id)!;
          return [n.id, n.name, r.method, r.locality, r.stateCode, r.distanceKm ?? ''];
        }),
      ),
    );
  }

  h('Dropped features');
  out.push(
    extract.dropped.length
      ? table(
          ['Code', 'Name', 'Reason'],
          extract.dropped.map((d) => [d.code, d.name, d.reason]),
        )
      : 'None. Every feature has non-zero coordinates inside `AUSTRALIA_BOUNDS` and a unique code.',
  );
  if (extract.log.coordFallback.length) {
    out.push(
      '',
      `Coordinates taken from \`latitude\`/\`longitude\` fallback: ${extract.log.coordFallback.join(', ')}.`,
    );
  }

  h('Shared and near-identical points');
  const pairs: (string | number)[][] = [];
  for (let i = 0; i < nations.length; i++) {
    for (let j = i + 1; j < nations.length; j++) {
      const a = nations[i];
      const b = nations[j];
      const d = haversineKm(a.lng, a.lat, b.lng, b.lat);
      if (d < 2) pairs.push([label(a.id), label(b.id), d.toFixed(2)]);
    }
  }
  out.push(
    pairs.length
      ? `${pairs.filter((p) => p[2] === '0.00').length} identical point(s); pairs closer than 2 km (markers will overlap):\n\n` +
          table(['Nation', 'Nation', 'km apart'], pairs)
      : 'No two nations share a point or lie within 2 km of each other.',
  );

  h('Duplicate names');
  const names = new Map<string, string[]>();
  for (const n of nations) names.set(n.name, [...(names.get(n.name) ?? []), n.id]);
  const dups = [...names].filter(([, ids]) => ids.length > 1);
  out.push(
    dups.length
      ? `Different AUSTLANG codes with the same name (the UI should disambiguate, e.g. by locality):\n\n` +
          table(
            ['Name', 'Codes (locality)'],
            dups.map(([name, ids]) => [
              name,
              ids
                .map(
                  (id) =>
                    `${id} (${byId.get(id)!.modern.locality}, ${byId.get(id)!.modern.stateCode})`,
                )
                .join('; '),
            ]),
          )
      : 'None.',
  );

  h('Spot checks');
  out.push(
    'The brief asked for Pitjantjatjara (C6) → Petermann, NT and Gadigal → Sydney, NSW. Neither is in TLCMap layer 81 ' +
      '(nor are Woiwurrung S36, Turrbal E86, Meriam Mir Y3, Palawa kani T16 or any Torres Strait language), so these ' +
      'substitutes are checked instead (also enforced by `scripts/validate.ts`):',
    '',
    table(
      ['Id', 'Name', 'Expected', 'Got', 'OK'],
      SPOT_CHECKS.map((s) => {
        const n = byId.get(s.id);
        const got = n ? `${n.modern.locality}, ${n.modern.stateCode}` : 'missing';
        const ok = n?.modern.locality === s.locality && n.modern.stateCode === s.stateCode;
        return [s.id, s.name, `${s.locality}, ${s.stateCode}`, got, ok ? 'yes' : '**NO**'];
      }),
    ),
    '',
    'Nearest nations to two reference points:',
    '',
    table(
      ['Reference', 'Nation', 'km', 'Country today'],
      (
        [
          ['Uluru (131.0369, −25.3444)', 131.0369, -25.3444],
          ['Sydney CBD (151.2093, −33.8688)', 151.2093, -33.8688],
        ] as const
      ).flatMap(([ref, lng, lat]) =>
        nations
          .map((n) => ({ n, d: haversineKm(lng, lat, n.lng, n.lat) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
          .map(({ n, d }) => [
            ref,
            `${n.id} ${n.name}`,
            d.toFixed(0),
            `${n.modern.locality}, ${n.modern.stateCode}`,
          ]),
      ),
    ),
    '',
    `Nations whose locality is "Petermann": ${
      nations
        .filter((n) => n.modern.locality === 'Petermann')
        .map((n) => n.id)
        .join(', ') || 'none'
    }. ` +
      `In "Sydney": ${
        nations
          .filter((n) => n.modern.locality === 'Sydney')
          .map((n) => n.id)
          .join(', ') || 'none'
      }.`,
  );

  h('Cleaning');
  const { log } = extract;
  const synCount = (k: string) => log.synonymActions.filter((a) => a.action.kind === k).length;
  out.push(
    'Policy: AUSTLANG spellings are never re-spelled or re-cased. See `scripts/lib/clean.ts` and `data/cleaning.json`.',
    '',
    `- Names with a trailing \`^\` marker removed (${log.caretStripped.length}): ${log.caretStripped.map(label).join(', ') || 'none'}.`,
    `- ALL-CAPS names kept as recorded (${log.allCaps.length}): ${log.allCaps.map(label).join(', ') || 'none'}.`,
    `- \`thesaurus_heading_people\` present for ${nations.filter((n) => n.peopleName).length} nations; trailing code removed. ` +
      `Headings that name another code (kept, since the heading is still the people's name): ` +
      (log.peopleOtherCode.length
        ? [...new Set(log.peopleOtherCode.map((p) => `"${p.heading}"`))].join(', ') +
          ` on ${log.peopleOtherCode.map((p) => p.code).join(', ')}.`
        : 'none.'),
    `- Synonyms kept: ${nations.reduce((s, n) => s + n.synonyms.length, 0)}. Entries rewritten from editorial notes or merged pairs: ${synCount('replaced')}; ` +
      `dropped as non-names: ${synCount('dropped')}; excluded from display: ${synCount('excluded')}.`,
  );
  const replaced = log.synonymActions.filter((a) => a.action.kind === 'replaced');
  if (replaced.length) {
    out.push(
      '',
      '### Synonyms rewritten',
      '',
      table(
        ['Id', 'Source text', 'Became'],
        replaced.map(({ code, action }) =>
          action.kind === 'replaced'
            ? [code, action.from, action.to.join(' · ') || '(dropped)']
            : [],
        ),
      ),
    );
  }
  const removed = log.synonymActions.filter((a) => a.action.kind !== 'replaced');
  if (removed.length) {
    const grouped = new Map<string, Map<string, string[]>>();
    for (const { code, action } of removed) {
      if (action.kind === 'replaced') continue;
      const why = `${action.kind}: ${action.why}`;
      const g = grouped.get(why) ?? new Map<string, string[]>();
      g.set(code, [...(g.get(code) ?? []), action.value]);
      grouped.set(why, g);
    }
    out.push('', '### Synonyms removed', '');
    for (const [why, g] of grouped) {
      const total = [...g.values()].reduce((s, v) => s + v.length, 0);
      out.push(`**${why}** — ${total} entr${total === 1 ? 'y' : 'ies'} in ${g.size} nation(s)`, '');
      out.push(
        table(
          ['Id', 'Removed'],
          [...g].map(([code, vals]) => [label(code), vals.join(' · ')]),
        ),
        '',
      );
    }
  }
  if (log.suspectSynonyms.length) {
    out.push(
      '### Synonyms that look damaged in the source (kept unchanged)',
      '',
      'Contain `?` or a digit, which usually marks a character lost in an encoding step (e.g. ŋ). Check against the AUSTLANG site before display tweaks.',
      '',
      table(
        ['Id', 'Synonym'],
        log.suspectSynonyms.map((s) => [label(s.code), s.value]),
      ),
    );
  }

  h('Wikipedia links (Wikidata P1252)');
  if (!ctx.wikidata) out.push('No `data/cache/wikidata.json`; no links added.');
  else {
    const linked = nations.filter((n) => n.links.wikipedia).length;
    const codes = Object.keys(ctx.wikidata.codes);
    const ours = new Set(nations.map((n) => n.id.toUpperCase()));
    const shared = Object.entries(ctx.wikidata.codes).filter(
      ([c, e]) => ours.has(c) && e.alsoQids?.length,
    );
    const articles = new Map<string, string[]>();
    for (const n of nations) {
      if (n.links.wikipedia)
        articles.set(n.links.wikipedia, [...(articles.get(n.links.wikipedia) ?? []), n.id]);
    }
    const reused = [...articles].filter(([, ids]) => ids.length > 1);
    out.push(
      `Wikidata query of ${ctx.wikidata.retrieved}: ${codes.length} AUSTLANG codes. ${linked} of ${nations.length} nations get an English Wikipedia link; ` +
        `${nations.length - linked} have none.`,
      '',
      `- Codes carried by more than one Wikidata item (first with an article, then lowest Q-id, used): ${shared.map(([c, e]) => `${c} (${e.qid}; also ${e.alsoQids!.join(', ')})`).join(', ') || 'none'}.`,
      `- Articles shared by several nations (usually a parent language or a group article): ${reused.length}` +
        (reused.length
          ? ` — ${reused.map(([url, ids]) => `${decodeURIComponent(url.replace('https://en.wikipedia.org/wiki/', ''))} (${ids.join(', ')})`).join('; ')}.`
          : '.'),
    );
  }

  nearbySection(ctx, h, out, label);

  h('Overrides (data/overrides.json)');
  const ov = Object.entries(ctx.overrides).filter(([id]) => !id.startsWith('_'));
  out.push(
    ov.length
      ? table(
          ['Id', 'Name', 'View', 'Why'],
          ov.map(([id, o]) => [
            id,
            o.name ? `${byId.get(id)?.name} (renamed)` : (byId.get(id)?.name ?? ''),
            o.view
              ? Object.entries(o.view)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')
              : '',
            o._why ?? '',
          ]),
        )
      : 'None.',
  );
  return `${out.join('\n')}\n`;
}

function nearbySection(
  ctx: BuildContext,
  h: (s: string) => void,
  out: string[],
  label: (id: string) => string,
): void {
  h('Nearby town and landmark (OpenStreetMap, WS8)');
  const { nearby, nations } = ctx;
  if (!nearby) {
    out.push('No `data/cache/osm/nearby.json`; run `node scripts/nearby.ts`. No `nearby` written.');
    return;
  }
  const n = nations.length;
  const pct = (k: number) => `${k} of ${n} (${((100 * k) / n).toFixed(0)} %)`;
  const withTown = nations.filter((x) => x.nearby?.town);
  const withLm = nations.filter((x) => x.nearby?.landmark);
  const both = nations.filter((x) => x.nearby?.town && x.nearby.landmark).length;
  const neither = nations.filter((x) => !x.nearby).length;
  out.push(
    'Orientation only: today’s (mostly colonial) place names, shown in the info card under “Country today”. ' +
      'They are not names for the nation or its Country and imply no boundary.',
    '',
    table(
      [
        'Class',
        'Overpass query run',
        'OSM data as of',
        'Named features (Australia)',
        'Committed (within cut-off of a nation)',
      ],
      OSM_CLASSES.map((c) => [
        c,
        nearby.sources[c].retrieved,
        nearby.sources[c].osmBase || '—',
        nearby.sources[c].count,
        nearby.sources[c].committed,
      ]),
    ),
    '',
    `- Nearest \`place=city|town|village\` within ${TOWN_MAX_KM} km (nearest wins, whatever the class): **${pct(withTown.length)}**`,
    `- Nearest named peak / river / lake / range within ${LANDMARK_MAX_KM} km: **${pct(withLm.length)}**`,
    `- Both: ${both}; neither (no \`nearby\` field): ${neither}`,
  );
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  out.push(
    `- Median distance: town ${median(withTown.map((x) => x.nearby!.town!.distanceKm))} km, ` +
      `landmark ${median(withLm.map((x) => x.nearby!.landmark!.distanceKm))} km`,
  );
  const kinds = new Map<string, number>();
  for (const x of nations) {
    for (const f of [x.nearby?.town, x.nearby?.landmark]) {
      if (f) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    }
  }
  out.push(
    `- By kind: ${[...kinds]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    '',
    table(
      ['Code', 'State / territory', 'Nations', 'With town or village', 'With landmark'],
      STATE_CODES.map((c) => {
        const inState = nations.filter((x) => x.modern.stateCode === c);
        return [
          c,
          STATE_NAMES[c],
          inState.length,
          inState.filter((x) => x.nearby?.town).length,
          inState.filter((x) => x.nearby?.landmark).length,
        ];
      }),
    ),
  );

  const place = (id: string) => {
    const x = nations.find((y) => y.id === id)!;
    return `${x.modern.locality}, ${x.modern.stateCode}`;
  };
  const noTown = nations.filter((x) => !x.nearby?.town);
  const noLm = nations.filter((x) => !x.nearby?.landmark);
  out.push('', '### Oddities', '');
  out.push(
    `**No city, town or village within ${TOWN_MAX_KM} km** (${noTown.length}): ` +
      (noTown.map((x) => `${label(x.id)} (${place(x.id)})`).join('; ') || 'none') +
      '.',
    '',
    `**No landmark within ${LANDMARK_MAX_KM} km** (${noLm.length}): ` +
      (noLm.map((x) => `${label(x.id)} (${place(x.id)})`).join('; ') || 'none') +
      '.',
  );
  const zero = withLm.filter((x) => x.nearby!.landmark!.distanceKm < 0.5);
  out.push(
    '',
    `**Landmark under 0.5 km** (${zero.length}; usually the point sits on a mapped river line, so the bearing means little): ` +
      (zero
        .map(
          (x) =>
            `${label(x.id)} → ${x.nearby!.landmark!.name} (${x.nearby!.landmark!.distanceKm} km)`,
        )
        .join('; ') || 'none') +
      '.',
  );
  const compound = nations.flatMap((x) =>
    [x.nearby?.town, x.nearby?.landmark]
      .filter((f) => f && /\s\/\s|;|\(/.test(f.name))
      .map((f) => `${label(x.id)} → "${f!.name}" (${f!.kind})`),
  );
  out.push(
    '',
    `**Dual or compound OSM names, kept exactly as published** (${compound.length}): ${compound.join('; ') || 'none'}.`,
  );
  const shared = new Map<string, string[]>();
  for (const x of withTown) {
    const k = `${x.nearby!.town!.name} (${x.nearby!.town!.kind})`;
    shared.set(k, [...(shared.get(k) ?? []), x.id]);
  }
  const top = [...shared].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  out.push(
    '',
    `**Towns nearest to the most nations:** ${top.map(([k, ids]) => `${k} ${ids.length}`).join(', ')}.`,
    '',
    'Method notes: distances are great-circle from the AUSTLANG point, 1 decimal place; bearings are the ' +
      '8-point initial bearing from the point to the feature. Rivers (`waterway=river` ways) are measured ' +
      'to the nearest point on the line (simplified to 10 m); lakes (`natural=water` + `water=lake`) and ' +
      'ranges (`natural=ridge|mountain_range`) to the Overpass centre, so a point on the shore of a large ' +
      'lake can read further than it looks. Only ways tagged `name` are used: an unnamed river way that ' +
      'belongs to a named waterway relation is not.',
  );
}

main();
