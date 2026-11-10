import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { getCamera, selectFromList, SLOW, waitForMapIdle } from './support/map.ts';

// Guided tour and globe view (WS9). Stops come from src/app/tour/stops.ts; the first two are
// Djagaraga (Y6, Somerset (Qld)) and Djabugay / Tjapukai (Y106, Mona Mona).
const STOP1 = { id: 'Y6', name: 'Djagaraga', locality: 'Somerset (Qld)' };
const STOP2 = { id: 'Y106', name: 'Djabugay / Tjapukai', locality: 'Mona Mona' };
const KAURNA = { id: 'L3', name: 'Kaurna', locality: 'Calomba' };
/** Flight (≤ 4.5 s) plus tiles; generous on CI's software renderer. */
const LAND = 15_000 * SLOW;

async function startTour(page: Page) {
  await page.goto('/');
  await waitForMapIdle(page);
  await page.getByTestId('tour-button').click();
  const panel = page.getByTestId('tour-panel');
  await expect(panel).toBeVisible();
  return panel;
}

async function expectStop(panel: Locator, n: number, name: string) {
  await expect(panel).toContainText(`Stop ${n} of 12`);
  await expect(panel.getByRole('heading')).toHaveText(name);
}

/** Whether MapLibre is drawing the globe (internal, but it is the projection actually in use). */
function globeRendering(page: Page) {
  return page.evaluate(() => {
    const map = window.__map as unknown as {
      style: { projection: { name: string; useGlobeRendering: boolean } };
    };
    return { name: map.style.projection.name, globe: map.style.projection.useGlobeRendering };
  });
}

test.describe('guided tour', () => {
  test('starts: flies to stop 1, shows the panel and the info card', async ({ page }) => {
    const panel = await startTour(page);
    await expectStop(panel, 1, STOP1.name);
    await expect(panel.getByTestId('tour-narration')).toContainText(
      `Country today: ${STOP1.locality}, Queensland.`,
    );
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });
    await expect(page).toHaveURL(new RegExp(`[?&]n=${STOP1.id}(&|$)`));
    await expect(page.getByTestId('tour-pause')).toHaveText('Pause');
  });

  test('next / prev / pause / stop', async ({ page }) => {
    const panel = await startTour(page);
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });

    await page.getByTestId('tour-pause').click();
    await expect(page.getByTestId('tour-pause')).toHaveText('Play');

    await page.getByTestId('tour-next').click();
    await expectStop(panel, 2, STOP2.name);
    await expect(page.getByTestId('info-locality')).toHaveText(STOP2.locality, { timeout: LAND });
    await expect(page.getByTestId('tour-pause'), 'next keeps it paused').toHaveText('Play');

    await page.getByTestId('tour-prev').click();
    await expectStop(panel, 1, STOP1.name);
    await expect(page.getByTestId('tour-prev')).toBeDisabled();
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });

    await page.getByTestId('tour-stop').click();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('info-card')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]n=/);
    await expect(page.getByTestId('tour-button')).toBeFocused();
    await expect.poll(async () => (await getCamera(page)).zoom, { timeout: LAND }).toBeLessThan(4);
  });

  test('plays on by itself after the dwell', async ({ page }) => {
    test.setTimeout(60_000 * SLOW);
    const panel = await startTour(page);
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });
    // ~8 s dwell, then the flight to stop 2.
    await expectStop(panel, 1, STOP1.name);
    await expect(panel).toContainText('Stop 2 of 12', { timeout: 12_000 + LAND });
    await expect(page.getByTestId('info-locality')).toHaveText(STOP2.locality, { timeout: LAND });
  });

  test('selecting another nation pauses the tour', async ({ page }) => {
    const panel = await startTour(page);
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });
    await selectFromList(page, KAURNA.id, KAURNA.name);
    await expect(page.getByTestId('tour-pause')).toHaveText('Play');
    await expectStop(panel, 1, STOP1.name);
    await expect(page.getByTestId('info-locality')).toHaveText(KAURNA.locality, { timeout: LAND });
    await expect(page).toHaveURL(new RegExp(`[?&]n=${KAURNA.id}(&|$)`));
  });

  test('Esc and About pause it', async ({ page }) => {
    await startTour(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour-pause')).toHaveText('Play');
    await page.getByTestId('tour-pause').click();
    await expect(page.getByTestId('tour-pause')).toHaveText('Pause');
    await page.getByTestId('about-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour-pause')).toHaveText('Play');
  });

  test('reduced motion: starts paused, no auto-play, next still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const panel = await startTour(page);
    await expectStop(panel, 1, STOP1.name);
    await expect(page.getByTestId('tour-pause')).toBeDisabled();
    await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });
    await page.getByTestId('tour-next').click();
    await expectStop(panel, 2, STOP2.name);
    await expect(page.getByTestId('info-locality')).toHaveText(STOP2.locality, { timeout: LAND });
  });

  for (const [label, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    test(`panel covers neither the info card nor the marker (${label})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const panel = await startTour(page);
      await expect(page.getByTestId('info-locality')).toHaveText(STOP1.locality, { timeout: LAND });
      const box = (await panel.boundingBox())!;
      const card = (await page.getByTestId('info-card').boundingBox())!;
      const overlaps =
        box.x < card.x + card.width &&
        card.x < box.x + box.width &&
        box.y < card.y + card.height &&
        card.y < box.y + box.height;
      expect(overlaps, `panel ${JSON.stringify(box)} vs card ${JSON.stringify(card)}`).toBe(false);
      const marker = await page.evaluate((code) => {
        const map = window.__map!;
        const f = map.querySourceFeatures('nations').find((x) => x.properties?.code === code)!;
        if (f.geometry.type !== 'Point') throw new Error(`no marker for ${code}`);
        const p = map.project(f.geometry.coordinates as [number, number]);
        const r = map.getCanvas().getBoundingClientRect();
        return { x: r.left + p.x, y: r.top + p.y };
      }, STOP1.id);
      const inside =
        marker.x > box.x - 8 &&
        marker.x < box.x + box.width + 8 &&
        marker.y > box.y - 8 &&
        marker.y < box.y + box.height + 8;
      expect(inside, `marker ${JSON.stringify(marker)} under the panel`).toBe(false);
    });
  }
});

test.describe('globe view', () => {
  test('globe at the overview, mercator from z 5, and back', async ({ page }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    expect(await globeRendering(page)).toEqual({ name: 'globe', globe: true });
    await page.evaluate(() => window.__map!.jumpTo({ zoom: 5 }));
    await expect.poll(async () => (await globeRendering(page)).globe).toBe(false);
    await page.evaluate(() => window.__map!.jumpTo({ zoom: 2.5 }));
    await expect.poll(async () => (await globeRendering(page)).globe).toBe(true);
  });

  test('the camera stays over Australia on the globe (maxBounds replacement)', async ({ page }) => {
    await page.goto('/');
    await waitForMapIdle(page);
    await page.evaluate(() => window.__map!.jumpTo({ center: [30, 0], zoom: 2.5 })); // Africa
    const cam = await getCamera(page);
    expect(cam.lng).toBeGreaterThan(100);
    expect(cam.lat).toBeLessThan(0);
    await page.evaluate(() => window.__map!.jumpTo({ zoom: 4.5 }));
    const after = await getCamera(page);
    expect(after.lng, 'no jump when the globe flattens').toBeCloseTo(cam.lng, 5);
    expect(after.lat).toBeCloseTo(cam.lat, 5);
  });
});
