/**
 * English Wikipedia links for AUSTLANG codes via Wikidata (P1252 = AUSTLANG code; CC0).
 * Note: docs/research.md and the WS3 brief say P1251, but that is the ABS ASCL 2011 code.
 * One SPARQL request, cached to data/cache/wikidata.json. The build reads only the cache.
 *
 * A failed request keeps the existing cache and exits 0 (links are optional), unless --strict.
 *
 * Usage: node scripts/wikidata.ts [--refresh] [--strict]
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readJson, writeJsonFormatted } from './lib/io.ts';
import { fetchJsonWithRetry } from './lib/net.ts';
import { WIKIDATA_CACHE, todayAu } from './lib/paths.ts';
import type { WikidataCache } from './lib/wikidata.ts';
import { pickWikidata } from './lib/wikidata.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const QUERY = `SELECT ?item ?code ?article WHERE {
  ?item wdt:P1252 ?code .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
}`;

interface SparqlResult {
  results: { bindings: Record<string, { value: string } | undefined>[] };
}

async function main() {
  const { values } = parseArgs({
    options: {
      refresh: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
    },
  });
  if (existsSync(WIKIDATA_CACHE) && !values.refresh) {
    const c = readJson<WikidataCache>(WIKIDATA_CACHE);
    console.log(
      `[wikidata] using cache from ${c.retrieved} (${Object.keys(c.codes).length} codes); --refresh to re-query`,
    );
    return;
  }
  try {
    const url = `${ENDPOINT}?${new URLSearchParams({ query: QUERY, format: 'json' })}`;
    const body = await fetchJsonWithRetry<SparqlResult>(url, {
      headers: { Accept: 'application/sparql-results+json' },
      timeoutMs: 60_000,
      attempts: 3,
    });
    const rows = body.results.bindings.map((b) => ({
      qid: (b.item?.value ?? '').replace('http://www.wikidata.org/entity/', ''),
      code: (b.code?.value ?? '').trim(),
      article: b.article?.value,
    }));
    const cache: WikidataCache = { retrieved: todayAu(), query: QUERY, codes: pickWikidata(rows) };
    await writeJsonFormatted(WIKIDATA_CACHE, cache);
    const withWiki = Object.values(cache.codes).filter((c) => c.enwiki).length;
    console.log(
      `[wikidata] ${Object.keys(cache.codes).length} codes, ${withWiki} with an en.wikipedia article`,
    );
  } catch (err) {
    const msg = `[wikidata] query failed: ${(err as Error).message}`;
    if (values.strict) throw new Error(msg, { cause: err });
    console.warn(`${msg}; keeping existing cache (links are optional)`);
  }
}

await main();
