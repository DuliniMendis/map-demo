// WS7 (Phase 3): contour lines generated in the browser from the DEM, and the time-of-day light.
// The committed Mapterhorn/AWS fixtures stop at z4 and everything finer is a flat 0 m tile, which
// has no contours. So this spec serves a synthetic terrarium DEM for z >= 9 (rolling hills,
// continuous across tiles and zooms), generated here; coarser tiles fall through to `mockTiles`.
import { deflateSync } from 'node:zlib';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { SLOW, waitForMapIdle } from './support/map.ts';

// ---- synthetic DEM ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Hills of 100–900 m, period 0.05° (~5 km): plenty of 50 m / 20 m contours in any z11+ view. */
const elevation = (lng: number, lat: number) =>
  500 + 400 * Math.sin((2 * Math.PI * lng) / 0.05) * Math.cos((2 * Math.PI * lat) / 0.05);

const demCache = new Map<string, Buffer>();
function syntheticDem(z: number, x: number, y: number, size: number): Buffer {
  const key = `${size}/${z}/${x}/${y}`;
  const hit = demCache.get(key);
  if (hit) return hit;
  const n = 2 ** z;
  const raw = Buffer.alloc((1 + size * 3) * size);
  for (let py = 0; py < size; py++) {
    const row = py * (1 + size * 3);
    const lat =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (py + 0.5) / size)) / n))) * 180) / Math.PI;
    for (let px = 0; px < size; px++) {
      const lng = ((x + (px + 0.5) / size) / n) * 360 - 180;
      const v = elevation(lng, lat) + 32768; // terrarium: R*256 + G + B/256 - 32768
      const o = row + 1 + px * 3;
      raw[o] = Math.floor(v / 256);
      raw[o + 1] = Math.floor(v) % 256;
      raw[o + 2] = Math.floor((v % 1) * 256);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 1 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  demCache.set(key, png);
  return png;
}

interface DemLog {
  /** Every DEM tile request (Mapterhorn or AWS), in order, from the page and every worker. */
  urls: string[];
}

const DEM_URL =
  /^https:\/\/(tiles\.mapterhorn\.com|s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium)\/(\d+)\/(\d+)\/(\d+)\.(webp|png)$/;

/** Serves the synthetic DEM for z >= 9; registered after `mockTiles`, so it runs first. */
async function syntheticTerrain(context: BrowserContext, failMapterhorn = false): Promise<DemLog> {
  const log: DemLog = { urls: [] };
  await context.route(DEM_URL, async (route: Route) => {
    const url = route.request().url();
    log.urls.push(url);
    const [, host, z, x, y] = url.match(DEM_URL)!;
    const mapterhorn = host === 'tiles.mapterhorn.com';
    if (Number(z) < 9 || (mapterhorn && failMapterhorn)) return route.fallback();
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      contentType: 'image/png',
      body: syntheticDem(Number(z), Number(x), Number(y), mapterhorn ? 512 : 256),
    });
  });
  return log;
}

// Katoomba, Blue Mountains: a nation-style pitched view (WS2's default is z10.5 / 62° / −18°), one
// zoom step closer so contours (z >= 11) show.
const VIEW = { center: [150.3, -33.72] as [number, number], zoom: 11.5, pitch: 60, bearing: -18 };

async function jumpToView(page: Page) {
  await page.evaluate((v) => window.__map!.jumpTo(v), VIEW);
  await waitForMapIdle(page);
}

const renderedContours = (page: Page) =>
  page.evaluate(() => {
    const map = window.__map!;
    if (!map.getLayer('contour-lines')) return 0;
    return map.queryRenderedFeatures({ layers: ['contour-lines'] }).length;
  });

const layerIndex = (page: Page) =>
  page.evaluate(() => window.__map!.getStyle().layers.map((l) => l.id));

const hillshadePaint = (page: Page) =>
  page.evaluate(() => {
    const map = window.__map!;
    const get = (p: string): unknown =>
      map.getPaintProperty('hillshade', p as 'hillshade-exaggeration');
    return {
      direction: get('hillshade-illumination-direction') as number,
      anchor: get('hillshade-illumination-anchor') as string,
      exaggeration: get('hillshade-exaggeration') as number,
      highlight: get('hillshade-highlight-color') as string,
      shadow: get('hillshade-shadow-color') as string,
    };
  });

test.describe('contour lines', () => {
  test('toggle adds visible contour lines at z >= 11 above the relief, below labels', async ({
    page,
    context,
  }) => {
    const dem = await syntheticTerrain(context);
    await page.goto('/');
    await waitForMapIdle(page);
    const atOverview = dem.urls.length;
    await jumpToView(page);
    expect(await renderedContours(page)).toBe(0);
    // DEM tiles the terrain mesh + hillshade/relief loaded for this view (not the overview).
    const terrainUrls = new Set(dem.urls.slice(atOverview));
    const terrainRequests = dem.urls.length;

    await page.getByTestId('layer-toggle-contours').click();
    await expect(page).toHaveURL(/[?&]l=[^&]*contours/);
    await expect.poll(() => renderedContours(page), { timeout: 15_000 * SLOW }).toBeGreaterThan(10);
    await waitForMapIdle(page);

    const ids = await layerIndex(page);
    expect(ids.indexOf('contour-lines')).toBeGreaterThan(ids.indexOf('hillshade'));
    expect(ids.indexOf('contour-lines')).toBeGreaterThan(ids.indexOf('relief'));
    expect(ids.indexOf('contour-labels')).toBeLessThan(ids.indexOf('labels-water'));
    expect(ids.indexOf('contour-labels')).toBeLessThan(ids.indexOf('nations-circle'));

    // Major lines carry "ele" in metres for the labels; minor lines are multiples of 50 m at z11–12.
    const sample = await page.evaluate(() =>
      window
        .__map!.queryRenderedFeatures({ layers: ['contour-lines'] })
        .slice(0, 50)
        .map((f) => f.properties as { ele: number; level: number }),
    );
    expect(sample.every((p) => p.ele % 50 === 0)).toBe(true);
    expect(sample.some((p) => p.level === 1 && p.ele % 250 === 0)).toBe(true);

    // Request budget: contours must not double the DEM traffic of the terrain itself.
    const contourUrls = dem.urls.slice(terrainRequests);
    const newUrls = new Set(contourUrls.filter((u) => !terrainUrls.has(u)));
    test.info().annotations.push({
      type: 'dem-requests',
      description:
        `terrain+hillshade at the view: ${terrainRequests - atOverview} requests ` +
        `(${terrainUrls.size} URLs); ` +
        `contours: ${contourUrls.length} requests, ${contourUrls.length - newUrls.size} of them ` +
        `URLs the terrain already loaded (HTTP-cache hits in a browser), ${newUrls.size} new URLs`,
    });
    console.log('[landscape] DEM requests:', test.info().annotations.at(-1)?.description);
    expect(newUrls.size).toBeLessThanOrEqual(terrainUrls.size);

    // Off again: hidden in place (source kept for a quick re-toggle).
    await page.getByTestId('layer-toggle-contours').click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__map!.getLayoutProperty('contour-lines', 'visibility')),
      )
      .toBe('none');
    await expect(page).not.toHaveURL(/contours/);
  });

  test('nothing below z11', async ({ page, context }) => {
    await syntheticTerrain(context);
    await page.goto('/?l=imagery,labels,hillshade,contours');
    await waitForMapIdle(page);
    await page.evaluate((v) => window.__map!.jumpTo({ ...v, zoom: 10.5 }), VIEW);
    await waitForMapIdle(page);
    expect(await renderedContours(page)).toBe(0);
  });
});

test.describe('contour lines on the AWS fallback', () => {
  test.use({ tileOptions: { failHosts: ['mapterhorn'], failStatus: 500 } });

  test('follow the terrain to AWS Terrain Tiles', async ({ page, context }) => {
    const dem = await syntheticTerrain(context, true);
    await page.goto('/?l=imagery,labels,hillshade,contours');
    await expect(page.getByRole('status').filter({ hasText: /backup terrain/i })).toBeVisible({
      timeout: 15_000 * SLOW,
    });
    await waitForMapIdle(page);
    await jumpToView(page);
    await expect.poll(() => renderedContours(page), { timeout: 15_000 * SLOW }).toBeGreaterThan(10);
    const tiles = await page.evaluate(
      () => (window.__map!.getStyle().sources.contours as { tiles: string[] }).tiles[0],
    );
    expect(tiles).toMatch(/^contour-aws/);
    expect(dem.urls.some((u) => /s3\.amazonaws\.com.*\/1[1-3]\//.test(u))).toBe(true);
  });
});

test.describe('time-of-day light', () => {
  const DEFAULTS = {
    direction: 315,
    anchor: 'viewport',
    exaggeration: 0.35,
    highlight: 'rgba(255, 244, 224, 0.35)',
    shadow: '#3a2414',
  };

  test('sun slider moves the hillshade light and writes ?t=; reset restores the defaults', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    expect(await hillshadePaint(page)).toEqual(DEFAULTS);
    const slider = page.getByTestId('sun-slider');
    await expect(page.getByTestId('sun-reset')).toBeDisabled();

    await slider.fill('7.5');
    await expect(slider).toHaveAttribute('aria-valuetext', '7:30 am');
    await expect.poll(async () => (await hillshadePaint(page)).anchor).toBe('map');
    const morning = await hillshadePaint(page);
    // Morning sun is in the eastern half of the sky, whatever the date.
    expect(morning.direction).toBeGreaterThan(45);
    expect(morning.direction).toBeLessThan(135);
    await expect(page).toHaveURL(/[?&]t=7\.5(&|$)/);

    await slider.fill('17.75');
    await expect(slider).toHaveAttribute('aria-valuetext', '5:45 pm');
    await expect.poll(async () => (await hillshadePaint(page)).direction).toBeGreaterThan(225);
    await expect(page).toHaveURL(/[?&]t=17\.75(&|$)/);

    await page.getByTestId('sun-reset').click();
    await expect.poll(() => hillshadePaint(page)).toEqual(DEFAULTS);
    await expect(page).not.toHaveURL(/[?&]t=/);
    await expect(slider).toHaveAttribute('aria-valuetext', 'Default light');
  });

  test('?t= is restored on load', async ({ page }) => {
    await page.goto('/?t=16');
    await waitForMapIdle(page);
    await expect(page.getByTestId('sun-slider')).toHaveValue('16');
    await expect.poll(async () => (await hillshadePaint(page)).anchor).toBe('map');
    expect((await hillshadePaint(page)).direction).toBeGreaterThan(225);
  });
});
