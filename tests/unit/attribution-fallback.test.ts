import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { FALLBACK_ATTRIBUTION } from '../../src/app/attributionFallback.ts';

describe('FALLBACK_ATTRIBUTION', () => {
  it('matches the items in public/data/attribution.json', async () => {
    const file = JSON.parse(
      await readFile(new URL('../../public/data/attribution.json', import.meta.url), 'utf8'),
    ) as { items: unknown[] };
    expect(FALLBACK_ATTRIBUTION).toEqual(file.items);
  });
});
