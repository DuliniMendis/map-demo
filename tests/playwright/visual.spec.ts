import { MAP_CANVAS, expect, test } from './support/fixtures.ts';
import { waitForMapIdle } from './support/map.ts';

// Visual regression (WS6 brief: 6 baselines, maxDiffPixelRatio 0.02, tiles from fixtures).
// Baselines are committed for Linux only, because text and WebGL output differ per OS; they are
// generated on the CI runner (see docs/qa.md, "Visual baselines"). Elsewhere these tests skip.
test.skip(process.platform !== 'linux', 'visual baselines exist for Linux (CI) only');

test.describe('visual', () => {
  test('overview: shell at first load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('side-panel')).toBeVisible();
    await expect(page.locator(MAP_CANVAS)).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('overview.png');
  });

  // Landscape views: fixed cameras set with jumpTo (not a nation flight), so the baseline depends
  // only on the style and the tile fixtures, not on choreography timing or which ids WS3 ships.
  const places = [
    { name: 'uluru', center: [131.036, -25.345], zoom: 11, pitch: 62, bearing: -18 },
    { name: 'blue-mountains', center: [150.31, -33.73], zoom: 11, pitch: 65, bearing: 20 },
    { name: 'kakadu', center: [132.6, -12.9], zoom: 10, pitch: 60, bearing: 0 },
    { name: 'tasmania', center: [146.0, -42.9], zoom: 9.5, pitch: 62, bearing: -30 },
  ] as const;
  for (const p of places) {
    test(`${p.name}: landscape at a fixed camera`, async ({ page }) => {
      await page.goto('/');
      await waitForMapIdle(page);
      await page.evaluate(({ center, zoom, pitch, bearing }) => {
        window.__map!.jumpTo({ center: [center[0], center[1]], zoom, pitch, bearing });
      }, p);
      await waitForMapIdle(page);
      await expect(page).toHaveScreenshot(`${p.name}.png`);
    });
  }

  test('mobile: panel layout at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('search-input')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('mobile-panel.png');
  });
});
