import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { MAP_CANVAS, expect, test } from './support/fixtures.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function axe(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  // Compact output so a failure says what and where without the full axe payload.
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
}

test.describe('accessibility (axe)', () => {
  test('whole page at the overview has no violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(MAP_CANVAS)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await axe(page)).toEqual([]);
  });

  test('side panel with search, filter and list has no violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('search-input')).toBeVisible();
    expect(await axe(page, '[data-testid="side-panel"]')).toEqual([]);
  });

  test('info card has no violations', async ({ page }) => {
    await page.goto('/?n=L3');
    await expect(page.getByTestId('info-card')).toBeVisible();
    expect(await axe(page, '[data-testid="info-card"]')).toEqual([]);
  });

  test('About dialog has no violations and traps focus', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('about-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('about-button')).toBeFocused();
  });

  test('attribution is visible and names every data source', async ({ page }) => {
    await page.goto('/');
    const attribution = page.getByTestId('attribution');
    await expect(attribution).toBeVisible();
    await attribution.click(); // expands to the full list
    for (const text of ['AUSTLANG', 'AIATSIS', 'Mapterhorn', 'EOX', 'OpenStreetMap', 'MapLibre']) {
      await expect(attribution).toContainText(text);
    }
  });
});
