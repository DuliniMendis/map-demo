export interface WikidataEntry {
  qid: string;
  enwiki?: string;
  /** Other items carrying the same AUSTLANG code (reported, not used). */
  alsoQids?: string[];
}

export interface WikidataCache {
  retrieved: string;
  query: string;
  codes: Record<string, WikidataEntry>;
}

const qnum = (q: string) => Number(q.replace(/^Q/, '')) || Number.MAX_SAFE_INTEGER;

/**
 * One entry per AUSTLANG code (upper-cased). When several items share a code, prefer one with an
 * en.wikipedia article, then the lowest Q-number, so the choice is stable across runs.
 */
export function pickWikidata(
  rows: readonly { qid: string; code: string; article?: string }[],
): Record<string, WikidataEntry> {
  const byCode = new Map<string, Map<string, string | undefined>>();
  for (const r of rows) {
    if (!r.code || !r.qid) continue;
    const code = r.code.toUpperCase();
    const items = byCode.get(code) ?? new Map<string, string | undefined>();
    if (!items.get(r.qid)) items.set(r.qid, r.article);
    byCode.set(code, items);
  }
  const out: Record<string, WikidataEntry> = {};
  for (const code of [...byCode.keys()].sort()) {
    const items = [...byCode.get(code)!.entries()].sort(
      ([qa, aa], [qb, ab]) => Number(!aa) - Number(!ab) || qnum(qa) - qnum(qb),
    );
    const [[qid, enwiki], ...rest] = items;
    out[code] = {
      qid,
      ...(enwiki ? { enwiki } : {}),
      ...(rest.length ? { alsoQids: rest.map(([q]) => q) } : {}),
    };
  }
  return out;
}
