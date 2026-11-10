import { expect, test } from './support/fixtures.ts';
import { waitForMapIdle } from './support/map.ts';

test('2D/3D switch tilts the camera and follows it', async ({ page }) => {
  await page.goto('/');
  await waitForMapIdle(page);
  const b2 = page.getByTestId('tilt-2d');
  const b3 = page.getByTestId('tilt-3d');
  await expect(b2).toHaveAttribute('aria-pressed', 'true'); // the overview is flat

  await b3.click();
  await expect(b3).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__map!.getPitch())).toBeGreaterThan(50);

  await b2.click();
  await expect(b2).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__map!.getPitch())).toBeLessThan(1);
});

test.describe('gesture hint', () => {
  test.use({ firstVisit: true });

  test('appears after the Vision modal and goes once the map is used', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('vision-dialog')).toBeVisible();
    await expect(page.getByTestId('gesture-hint')).toBeHidden();
    await page.getByTestId('vision-enter').click();
    const hint = page.getByTestId('gesture-hint');
    await expect(hint).toBeVisible();

    const canvas = page.locator('[data-testid="map-canvas"] canvas.maplibregl-canvas');
    const box = (await canvas.boundingBox())!;
    // Mid-map, clear of the banner (top) and the hint itself (bottom).
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.wheel(0, -200);
    await expect(hint).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(page.getByTestId('gesture-hint')).toBeHidden();
  });
});
