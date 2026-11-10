// WS2 integration test for MapController + markers, against the WS2 dev page.
//
// Needs the Vite *dev* server (the dev page is not part of `vite build`): baseURL like http://127.0.0.1:5173.
// Tiles are mocked (flat terrarium DEM, solid imagery, empty glyphs) so it never hits the free tile hosts;
// set WS2_LIVE_TILES=1 to fly over the real ones. WS6 adopts this file into the Playwright config.
import { expect, test, type Page } from '@playwright/test';
import type { Map as MaplibreMap } from 'maplibre-gl';
import './support/map.ts'; // declares (window as Ws2Window).__map

/** The subset of the WS2 dev page's `(window as Ws2Window).__ws2` debug object (src/map/controller/dev.ts) these tests use. */
interface Ws2Debug {
  ready: boolean;
  nations: { id: string; lng: number; lat: number }[];
  controller: { cameraState: string } | null;
  states: { s: string; at: number }[];
  steps: { phase: 'start' | 'end'; completed?: boolean; steps?: { type: string }[] }[];
  clicks: string[];
  startSampling(): void;
  stopSampling(): { zoom: number; pitch: number; centerElevation: number; t: number }[];
  select(id: string): Promise<void>;
  overview(): Promise<void>;
}

declare global {
  interface Window {
    __ws2?: Ws2Debug;
  }
}

/** Typed handles for use inside `page.evaluate` callbacks, where the dev page has set both globals. */
type Ws2Window = Window & { __ws2: Ws2Debug; __map: MaplibreMap };

const DEV_PAGE = '/src/map/controller/dev.html?hud=0';
/** CI renders WebGL in software (SwiftShader) and is much slower. */
const SLOW = process.env.CI ? 3 : 1;
const BUDGET = { min: 2500, max: 4500, reduced: 400 };

test.use({
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    args:
      process.platform === 'darwin'
        ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
        : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

/**
 * Upper time budgets are hard checks on a GPU. CI renders WebGL in software at a few frames per second,
 * so a flight's last frame lands well after its duration; there the time is logged, not asserted.
 */
function expectWithinBudget(ms: number, max: number, what: string) {
  if (SLOW > 1) {
    test.info().annotations.push({
      type: 'advisory',
      description: `${what}: ${Math.round(ms)} ms (budget ${max})`,
    });
    return;
  }
  expect(ms, what).toBeLessThanOrEqual(max);
}

/** Solid-colour 256 px PNG made in the browser: rgb(128,0,0) is terrarium elevation 0. */
async function solidPng(page: Page, rgb: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 256, 256);
    return c.toDataURL('image/png');
  }, rgb);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

async function mockTiles(page: Page) {
  if (process.env.WS2_LIVE_TILES === '1') return;
  await page.goto('about:blank');
  const dem = await solidPng(page, 'rgb(128,0,0)');
  const imagery = await solidPng(page, 'rgb(150,110,70)');
  await page.route(/elevation-tiles-prod|tiles\.mapterhorn\.com/, (r) =>
    r.fulfill({ body: dem, contentType: 'image/png' }),
  );
  await page.route(/tiles\.maps\.eox\.at/, (r) =>
    r.fulfill({ body: imagery, contentType: 'image/png' }),
  );
  await page.route(/tiles\.openfreemap\.org\/fonts/, (r) =>
    r.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }),
  );
}

async function openDevPage(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mockTiles(page);
  await page.goto(DEV_PAGE + query);
  await page.waitForFunction(() => window.__ws2?.ready === true, null, { timeout: 30_000 * SLOW });
  return errors;
}

/** Selects `id` the way the app will and returns timing and camera samples for the flight. */
async function fly(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const ws2 = (window as Ws2Window).__ws2;
    ws2.states = [];
    ws2.steps = [];
    ws2.startSampling();
    const t0 = performance.now();
    await ws2.select(id);
    const ms = performance.now() - t0;
    const samples = ws2.stopSampling();
    const map = (window as Ws2Window).__map;
    const plan = ws2.steps.find((s) => s.phase === 'start')?.steps ?? [];
    return {
      ms,
      states: ws2.states.map((s) => s.s),
      stepTypes: plan.map((s) => s.type),
      completed: ws2.steps.filter((s) => s.phase === 'end').map((s) => s.completed),
      zooms: samples.map((s) => s.zoom),
      end: {
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        center: map.getCenter().toArray(),
      },
    };
  }, id);
}

test.describe('MapController (WS2)', () => {
  test('installs the nations source and layers', async ({ page }) => {
    const errors = await openDevPage(page);
    const info = await page.evaluate(() => {
      const map = (window as Ws2Window).__map;
      const ids = map.getStyle().layers.map((l) => l.id);
      return {
        nationLayers: ids.filter((id) => id.startsWith('nations-')),
        features: map.querySourceFeatures('nations').length,
        cameraState: (window as Ws2Window).__ws2.controller!.cameraState,
      };
    });
    expect(info.nationLayers).toEqual([
      'nations-shadow',
      'nations-selected-ring',
      'nations-circle',
      'nations-highlight',
      'nations-label',
    ]);
    expect(info.cameraState).toBe('idle');
    expect(errors).toEqual([]);
  });

  test('overview → nation: one flyTo, flying → idle, lands on the default view', async ({
    page,
  }) => {
    await openDevPage(page);
    const r = await fly(page, 'Y6');
    expect(r.stepTypes).toEqual(['flyTo']);
    expect(r.states).toEqual(['flying', 'idle']);
    expect(r.completed).toEqual([true]);
    expect(r.ms).toBeGreaterThanOrEqual(BUDGET.min - 50);
    expectWithinBudget(r.ms, BUDGET.max, 'flight time');
    expect(r.end.zoom).toBeCloseTo(10.5, 1);
    expect(r.end.pitch).toBeCloseTo(62, 0);
    expect(r.end.bearing).toBeCloseTo(-18, 0);
    const selected = await page.evaluate(() =>
      (window as Ws2Window).__map.getFeatureState({
        source: 'nations',
        id: (window as Ws2Window).__ws2.nations.findIndex((n) => n.id === 'Y6'),
      }),
    );
    expect(selected).toMatchObject({ selected: true });
  });

  test('nation → far nation: rise then flyTo, zoom dips and comes back, inside the budget', async ({
    page,
  }) => {
    await openDevPage(page);
    await fly(page, 'W9');
    const r = await fly(page, 'T2');
    expect(r.stepTypes).toEqual(['easeTo', 'flyTo']);
    expect(r.completed).toEqual([true, true]);
    expect(r.states).toEqual(['flying', 'idle']);
    expect(Math.min(...r.zooms)).toBeLessThan(6);
    // The last rAF sample can predate the final frame on a slow renderer; read the map itself.
    expect(r.end.zoom).toBeCloseTo(10.5, 1);
    expect(r.ms).toBeGreaterThanOrEqual(BUDGET.min);
    expectWithinBudget(r.ms, BUDGET.max, 'flight time');
    expect(r.end.center[0]).toBeCloseTo(147.768715, 3);
  });

  test('a new selection mid-flight cancels the old one', async ({ page }) => {
    await openDevPage(page);
    const r = await page.evaluate(async () => {
      const ws2 = (window as Ws2Window).__ws2;
      ws2.states = [];
      const first = ws2.select('W9');
      await new Promise((res) => setTimeout(res, 800));
      const second = ws2.select('E29');
      await first; // settles early, without throwing
      const firstDoneWhileFlying = ws2.controller!.cameraState === 'flying';
      await second;
      return {
        firstDoneWhileFlying,
        states: ws2.states.map((s) => s.s),
        center: (window as Ws2Window).__map.getCenter().toArray(),
      };
    });
    expect(r.firstDoneWhileFlying).toBe(true);
    expect(r.states).toEqual(['flying', 'idle']);
    expect(r.center[0]).toBeCloseTo(152.667537, 3);
  });

  test('a user drag interrupts the flight and leaves the camera idle', async ({ page }) => {
    // At the couple of frames per second CI's software WebGL manages, the flight's last frame often
    // lands before MapLibre has turned the drag into a camera move. Runs on any GPU machine.
    test.skip(SLOW > 1, 'gesture interruption needs real frame rates (no GPU on CI)');
    await openDevPage(page);
    const done = page.evaluate(() => (window as Ws2Window).__ws2.select('N198'));
    // Drag once the camera is really moving (the flight may first wait for terrain), mid-flight.
    await page.waitForFunction(() => (window as Ws2Window).__map.isMoving(), null, {
      timeout: 10_000 * SLOW,
    });
    await page.waitForTimeout(400);
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(760, 500, { steps: 6 });
    await page.mouse.up();
    await done;
    const r = await page.evaluate(() => ({
      state: (window as Ws2Window).__ws2.controller!.cameraState,
      zoom: (window as Ws2Window).__map.getZoom(),
      ends: (window as Ws2Window).__ws2.steps
        .filter((s) => s.phase === 'end')
        .map((s) => s.completed),
    }));
    expect(r.state).toBe('idle');
    expect(r.ends.at(-1)).toBe(false);
    expect(r.zoom).toBeLessThan(10);
  });

  test('clicking a marker reports its id and flies there', async ({ page }) => {
    await openDevPage(page);
    await page.evaluate(() => (window as Ws2Window).__map.once('idle'));
    const p = await page.evaluate(() => {
      const n = (window as Ws2Window).__ws2.nations.find((x) => x.id === 'L3')!;
      const pt = (window as Ws2Window).__map.project([n.lng, n.lat]);
      return { x: pt.x, y: pt.y };
    });
    await page.mouse.click(p.x + 3, p.y - 2); // within the hit tolerance, not dead centre
    await expect
      .poll(() => page.evaluate(() => (window as Ws2Window).__ws2.clicks))
      .toEqual(['L3']);
    await page.waitForFunction(
      () => (window as Ws2Window).__ws2.controller!.cameraState === 'idle',
      null,
      {
        timeout: 10_000 * SLOW,
      },
    );
    const center = await page.evaluate(() => (window as Ws2Window).__map.getCenter().toArray());
    expect(center[0]).toBeCloseTo(138.408466, 3);
  });

  test('marker clicks still work at pitch 75 (queryRenderedFeatures fallback)', async ({
    page,
  }) => {
    await openDevPage(page);
    await page.evaluate(async () => {
      (window as Ws2Window).__map.jumpTo({
        center: [150.048412, -33.92],
        zoom: 11,
        pitch: 75,
        bearing: 0,
      });
      await (window as Ws2Window).__map.once('idle');
    });
    const p = await page.evaluate(() => {
      const pt = (window as Ws2Window).__map.project([150.048412, -33.889578]);
      return { x: pt.x, y: pt.y };
    });
    await page.mouse.click(p.x, p.y);
    await expect
      .poll(() => page.evaluate(() => (window as Ws2Window).__ws2.clicks))
      .toEqual(['S64']);
  });

  test('reduced motion: a single jumpTo inside 400 ms', async ({ page }) => {
    await openDevPage(page, '&rm=1');
    const r = await fly(page, 'T2');
    expect(r.stepTypes).toEqual(['jumpTo']);
    expect(r.states).toEqual(['flying', 'idle']);
    expect(r.ms).toBeLessThanOrEqual(BUDGET.reduced);
    expect(r.end.zoom).toBeCloseTo(10.5, 1);
  });

  test('flyToOverview returns to the overview camera', async ({ page }) => {
    await openDevPage(page);
    await fly(page, 'A43');
    const end = await page.evaluate(async () => {
      await (window as Ws2Window).__ws2.overview();
      const m = (window as Ws2Window).__map;
      return {
        zoom: m.getZoom(),
        pitch: m.getPitch(),
        state: (window as Ws2Window).__ws2.controller!.cameraState,
      };
    });
    expect(end).toEqual({
      zoom: expect.closeTo(3.7, 1),
      pitch: expect.closeTo(0, 1),
      state: 'idle',
    });
  });
});
