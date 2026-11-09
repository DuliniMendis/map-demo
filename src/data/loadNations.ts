import type { NationsFile } from '../types/nation';

export const NATIONS_URL = `${import.meta.env.BASE_URL}data/nations.json`;

export class NationsFileError extends Error {
  override name = 'NationsFileError';
}

/**
 * Light structural check of a parsed nations file. The full JSON Schema check lives in
 * WS3's `scripts/validate.ts`; this only guards the runtime against a truncated or wrong file.
 */
export function parseNationsFile(data: unknown): NationsFile {
  if (typeof data !== 'object' || data === null) {
    throw new NationsFileError('nations file is not an object');
  }
  const { generatedAt, count, nations } = data as Partial<NationsFile>;
  if (typeof generatedAt !== 'string') throw new NationsFileError('missing generatedAt');
  if (!Array.isArray(nations)) throw new NationsFileError('missing nations array');
  if (count !== nations.length) {
    throw new NationsFileError(`count (${String(count)}) !== nations.length (${nations.length})`);
  }
  for (const [i, n] of nations.entries()) {
    if (
      typeof n?.id !== 'string' ||
      typeof n.name !== 'string' ||
      !Number.isFinite(n.lng) ||
      !Number.isFinite(n.lat) ||
      typeof n.modern?.stateCode !== 'string'
    ) {
      throw new NationsFileError(`nations[${i}] is malformed`);
    }
  }
  return { generatedAt, count, nations };
}

async function loadMock(): Promise<NationsFile> {
  const mock = await import('./mock-nations.json');
  return parseNationsFile(mock.default);
}

/**
 * Fetches `/data/nations.json`. In dev, falls back to `src/data/mock-nations.json` when the real
 * file is missing (WS3 not landed yet). In production a missing or invalid file is an error.
 */
export async function loadNations(fetchImpl: typeof fetch = fetch): Promise<NationsFile> {
  let res: Response | undefined;
  try {
    res = await fetchImpl(NATIONS_URL);
  } catch (err) {
    if (import.meta.env.DEV) return loadMock();
    throw err;
  }

  // Vite's dev server answers unknown paths with index.html (200, text/html), so check the type too.
  const isJson = res.ok && (res.headers.get('content-type') ?? '').includes('json');
  if (!isJson) {
    if (import.meta.env.DEV) {
      console.info(`[loadNations] ${NATIONS_URL} not found; using mock data (10 nations).`);
      return loadMock();
    }
    const type = res.headers.get('content-type') ?? 'no content-type';
    throw new NationsFileError(
      `failed to load ${NATIONS_URL} (HTTP ${res.status}, ${type}); has WS3 generated it?`,
    );
  }
  return parseNationsFile(await res.json());
}
