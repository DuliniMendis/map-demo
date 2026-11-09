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
      test.fixme(true, 'needs WS1 style + LayerControls (WS5) + window.__map');
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
    test.fixme(true, 'needs exaggeration-slider (WS5), WS1 terrain and window.__map');
    await page.goto('/');
    await waitForMapIdle(page);
    await page.getByTestId('exaggeration-slider').fill('2.2');
    await expect
      .poll(() => page.evaluate(() => window.__map!.getTerrain()?.exaggeration))
      .toBeCloseTo(2.2, 5);
    await expect(page).toHaveURL(/[?&]x=2\.2(&|$)/);
  });

  test('?l= and ?x= are restored on load', async ({ page }) => {
    test.fixme(true, 'needs UrlSync (WS5), WS1 style and window.__map');
    await page.goto('/?l=labels,relief&x=2');
    await waitForMapIdle(page);
    expect(await visibility(page, LAYER_IDS.imagery)).toBe('none');
    expect(await visibility(page, LAYER_IDS.relief)).toBe('visible');
    expect(await page.evaluate(() => window.__map!.getTerrain()?.exaggeration)).toBeCloseTo(2, 5);
  });
});
