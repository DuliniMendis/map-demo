// Self-test of the tile-fixture interception (support/mockTiles.ts). It proves, on whatever runner
// executes it, that requests from the page AND from a dedicated web worker (where MapLibre fetches
// vector tiles) are answered from tests/fixtures/tiles/ and that unknown hosts never reach the network.
import { expect, test } from './support/fixtures.ts';

const URLS = {
  mapterhornFixture: 'https://tiles.mapterhorn.com/3/7/5.webp',
  mapterhornFallback: 'https://tiles.mapterhorn.com/12/3700/2400.webp',
  aws: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/7/5.png',
  eox: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/5/18/28.jpg',
  ofmTileJson: 'https://tiles.openfreemap.org/planet',
  ofmTile: 'https://tiles.openfreemap.org/planet/20990101_000000_pt/3/7/5.pbf',
  ofmGlyphs: 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
};

type Probe = { status: number; type: string | null; bytes: number } | { error: string };

test('page fetches of every tile host are served from fixtures', async ({ page, tiles }) => {
  await page.goto('/');
  const results = await page.evaluate(async (urls) => {
    const out: Record<string, Probe> = {};
    for (const [k, u] of Object.entries(urls)) {
      try {
        const r = await fetch(u);
        out[k] = {
          status: r.status,
          type: r.headers.get('content-type'),
          bytes: (await r.arrayBuffer()).byteLength,
        };
      } catch (e) {
        out[k] = { error: String(e) };
      }
    }
    return out;
  }, URLS);

  for (const [k, r] of Object.entries(results)) {
    expect(r, k).toMatchObject({ status: 200 });
  }
  expect(results.mapterhornFixture).toMatchObject({ type: 'image/webp' });
  expect(results.mapterhornFallback).toMatchObject({ type: 'image/png' });
  expect(results.eox).toMatchObject({ type: 'image/jpeg' });
  expect(results.ofmTileJson).toMatchObject({ type: 'application/json' });
  expect(tiles.served.map((s) => s.kind)).toEqual([
    'fixture',
    'fallback',
    'fixture',
    'fixture',
    'fixture',
    'fixture',
    'fixture',
  ]);
  expect(tiles.blocked).toEqual([]);
});

test('web worker fetches are intercepted too', async ({ page, tiles }) => {
  await page.goto('/');
  const result = await page.evaluate(async (url) => {
    const src = `onmessage = async (e) => {
      try { const r = await fetch(e.data); postMessage({ status: r.status, bytes: (await r.arrayBuffer()).byteLength }); }
      catch (err) { postMessage({ error: String(err) }); }
    };`;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    return new Promise<Probe>((resolve) => {
      worker.onmessage = (e) => resolve(e.data as Probe);
      worker.postMessage(url);
    });
  }, URLS.ofmTile);
  expect(result).toMatchObject({ status: 200 });
  expect((result as { bytes: number }).bytes).toBeGreaterThan(1000);
  expect(tiles.served.map((s) => s.url)).toContain(URLS.ofmTile);
});

test('unknown external hosts are blocked and recorded, not fetched', async ({ page, tiles }) => {
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/tile.png');
      return 'fetched';
    } catch {
      return 'blocked';
    }
  });
  expect(outcome).toBe('blocked');
  expect(tiles.blocked).toEqual(['https://example.invalid/tile.png']);
});
