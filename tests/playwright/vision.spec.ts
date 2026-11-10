import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/fixtures.ts';

// The Vision modal greets a first visit, is remembered once closed, and reopens from its button.
test.describe('vision modal', () => {
  test.use({ firstVisit: true });

  test('shows on a first visit, stays closed on the next, reopens from the button', async ({
    page,
  }) => {
    await page.goto('/');
    const dialog = page.getByTestId('vision-dialog');
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Every part of this land is Country' }),
    ).toBeVisible();

    await page.getByTestId('vision-enter').click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.getByTestId('vision-button').click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('vision-button')).toBeFocused();
  });

  test('the dialog has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('vision-dialog')).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .include('[data-testid="vision-dialog"]')
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('the sound toggle switches and stores the choice', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('vision-enter').click();
    // The fixture starts every test with sound off.
    const toggle = page.getByTestId('sound-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('country-map:sound-muted'))).toBeNull();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => localStorage.getItem('country-map:sound-muted'))).toBe('1');
  });
});
