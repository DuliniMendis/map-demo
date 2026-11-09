import { expect, test } from './support/fixtures.ts';
import { waitForMapIdle } from './support/map.ts';

// WS1 brief: after 3 consecutive DEM tile errors, switch to AWS Terrain Tiles and emit
// `style:dem-fallback` on the map; WS5 toasts "Using backup terrain".
test.describe('tile fallback', () => {
  test.use({ tileOptions: { failHosts: ['mapterhorn'], failStatus: 500 } });

  test('Mapterhorn returning 500 switches terrain to AWS and shows a toast', async ({
    page,
    tiles,
  }) => {
    test.fixme(true, 'needs WS1 DEM provider fallback + WS5 toast + window.__map');
    await page.addInitScript(() => {
      // Record the event as soon as the map exists.
      const w = window as unknown as { __demFallback?: boolean };
      const timer = setInterval(() => {
        if (!window.__map) return;
        clearInterval(timer);
        // Custom event name, outside MapLibre's typed MapEventType map.
        const map = window.__map as unknown as { on(type: string, cb: () => void): void };
        map.on('style:dem-fallback', () => (w.__demFallback = true));
      }, 10);
    });
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: /backup terrain/i })).toBeVisible({
      timeout: 15_000,
    });
    await waitForMapIdle(page);
    expect(await page.evaluate(() => (window as { __demFallback?: boolean }).__demFallback)).toBe(
      true,
    );
    expect(tiles.failed.length, 'Mapterhorn was tried first').toBeGreaterThanOrEqual(3);
    expect(
      tiles.served.some((s) => s.host === 'aws'),
      'AWS DEM tiles requested',
    ).toBe(true);
  });
});
