import { MAP_CANVAS, expect, test } from './support/fixtures.ts';
import { getCamera, waitForMapIdle } from './support/map.ts';

// OVERVIEW_CAMERA from docs/contracts.md (src/map/style/ids.ts).
const OVERVIEW = { lng: 134.0, lat: -26.5, zoom: 3.7, pitch: 0, bearing: 0 };

test.describe('boot', () => {
  test('renders the shell: side panel and a WebGL map canvas, with no console errors', async ({
    page,
    consoleProblems,
    tiles,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('side-panel')).toBeVisible();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    const canvas = page.locator(MAP_CANVAS);
    await expect(canvas).toBeVisible();

    // MapLibre only creates its canvas after getting a WebGL context; check it is real and sized.
    const gl = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
      return { ok: Boolean(ctx), lost: ctx?.isContextLost() ?? true, w: c.width, h: c.height };
    });
    expect(gl.ok, 'WebGL context').toBe(true);
    expect(gl.lost, 'WebGL context lost').toBe(false);
    expect(gl.w).toBeGreaterThan(100);
    expect(gl.h).toBeGreaterThan(100);

    // Let data loading and the first frames settle before judging the console.
    await page.waitForLoadState('networkidle');
    expect(consoleProblems, 'console errors / page errors').toEqual([]);
    expect(tiles.blocked, 'external requests with no fixture (would hit the network)').toEqual([]);
  });

  test('starts at the overview camera', async ({ page }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    const cam = await getCamera(page);
    expect(cam.lng).toBeCloseTo(OVERVIEW.lng, 1);
    expect(cam.lat).toBeCloseTo(OVERVIEW.lat, 1);
    expect(cam.zoom).toBeCloseTo(OVERVIEW.zoom, 1);
    expect(cam.pitch).toBeCloseTo(OVERVIEW.pitch, 0);
    expect(cam.bearing).toBeCloseTo(OVERVIEW.bearing, 0);
  });

  test('requests terrain, imagery and label tiles only from fixtures', async ({ page, tiles }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    const hosts = new Set(tiles.served.map((s) => s.host));
    expect([...hosts].sort()).toEqual(['eox', 'mapterhorn', 'openfreemap']);
    expect(tiles.blocked).toEqual([]);
  });
});
