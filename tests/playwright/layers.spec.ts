import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { waitForMapIdle } from './support/map.ts';

// Layer ids from docs/contracts.md (src/map/style/ids.ts).
const LAYER_IDS = {
  imagery: 'imagery',
  hillshade: 'hillshade',
  relief: 'relief',
  labels: 'labels-water', // LAYER_LABELS_FIRST; the labels toggle hides every label layer
} as const;

async function visibility(page: Page, layerId: string) {
  return page.evaluate(
    (id) => (window.__map!.getLayoutProperty(id, 'visibility') as string | undefined) ?? 'visible',
    layerId,
  );
}

test.describe('layer controls', () => {
  for (const key of Object.keys(LAYER_IDS) as (keyof typeof LAYER_IDS)[]) {
    test(`layer-toggle-${key} flips the layer's visibility and ?l=`, async ({ page }) => {
      await page.goto('/');
      await waitForMapIdle(page);
      const toggle = page.getByTestId(`layer-toggle-${key}`);
      const before = await visibility(page, LAYER_IDS[key]);
      await toggle.click();
      await expect
        .poll(() => visibility(page, LAYER_IDS[key]))
        .toBe(before === 'visible' ? 'none' : 'visible');
      await expect(page).toHaveURL(/[?&]l=/);
      await toggle.click();
      await expect.poll(() => visibility(page, LAYER_IDS[key])).toBe(before);
    });
  }

  test('exaggeration slider sets terrain exaggeration and ?x=', async ({ page }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    await page.getByTestId('exaggeration-slider').fill('2.2');
    await expect
      .poll(() => page.evaluate(() => window.__map!.getTerrain()?.exaggeration))
      .toBeCloseTo(2.2, 5);
    await expect(page).toHaveURL(/[?&]x=2\.2(&|$)/);
  });

  test('contours at the overview offer to zoom in, and draw once there', async ({ page }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    await page.getByTestId('layer-toggle-contours').click();
    const hint = page.getByTestId('layer-hint-contours');
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(hint).toBeHidden({ timeout: 15_000 });
    expect(await page.evaluate(() => window.__map!.getZoom())).toBeGreaterThanOrEqual(10);
  });

  test('the sun slider waits for hillshade, and exaggeration offers 3D from the flat overview', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    await expect(page.getByTestId('exaggeration-hint')).toBeVisible();
    await page.getByTestId('layer-toggle-hillshade').click();
    await expect(page.getByTestId('sun-slider')).toBeDisabled();
    await page.getByTestId('layer-toggle-hillshade').click();
    await expect(page.getByTestId('sun-slider')).toBeEnabled();
    await page.getByTestId('exaggeration-hint').click();
    await expect(page.getByTestId('exaggeration-hint')).toBeHidden({ timeout: 15_000 });
  });

  test('?l= and ?x= are restored on load', async ({ page }) => {
    await page.goto('/?l=labels,relief&x=2');
    await waitForMapIdle(page);
    expect(await visibility(page, LAYER_IDS.imagery)).toBe('none');
    expect(await visibility(page, LAYER_IDS.relief)).toBe('visible');
    expect(await page.evaluate(() => window.__map!.getTerrain()?.exaggeration)).toBeCloseTo(2, 5);
  });
});
