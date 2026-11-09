import { expect, test } from './support/fixtures.ts';
import {
  cameraLog,
  getCamera,
  markerPagePoint,
  recordCamera,
  waitForFlightEnd,
  waitForMapIdle,
} from './support/map.ts';

// Real AUSTLANG ids present in both src/data/mock-nations.json and the WS3 data.
const KAURNA = { id: 'L3', locality: 'Calomba', state: 'South Australia' };
const NGAATJATJARRA = { id: 'A43', locality: 'Ngaanyatjarra-Giles', state: 'Western Australia' };
const DHARUG = { id: 'S64', locality: 'Jenolan', state: 'New South Wales' };

test.describe('select a nation', () => {
  test('from the list: info card shows Country today and the URL has ?n=', async ({ page }) => {
    test.fixme(true, 'needs nation-item-<id> and info-card testids (WS4) wired in App (WS5)');
    await page.goto('/');
    await page.getByTestId(`nation-item-${KAURNA.id}`).click();
    const card = page.getByTestId('info-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('info-locality')).toHaveText(KAURNA.locality);
    await expect(card.getByTestId('info-state')).toHaveText(KAURNA.state);
    await expect(page).toHaveURL(new RegExp(`[?&]n=${KAURNA.id}(&|$)`));
  });

  test('re-select: camera rises (zoom dips) then descends to the new nation', async ({ page }) => {
    test.fixme(true, 'needs window.__map (WS5) and MapController choreography (WS2)');
    await page.goto(`/?n=${KAURNA.id}`);
    await waitForMapIdle(page);
    const before = await getCamera(page);
    await recordCamera(page);
    await page.getByTestId(`nation-item-${NGAATJATJARRA.id}`).click();
    await waitForFlightEnd(page);
    const log = await cameraLog(page);
    const start = log.find((s) => s.event === 'movestart')!;
    const end = log.findLast((s) => s.event === 'moveend')!;
    const minZoom = Math.min(...log.map((s) => s.zoom));
    expect(minZoom, 'rise step zooms out').toBeLessThan(before.zoom - 2);
    expect(end.zoom, 'descends again').toBeGreaterThan(minZoom + 2);
    const seconds = (end.t - start.t) / 1000;
    expect(seconds, 'PLAN.md budget: never longer than 6 s').toBeLessThanOrEqual(6);
    await expect(page.getByTestId('info-locality')).toHaveText(NGAATJATJARRA.locality);
  });

  test('clicking a marker selects that nation', async ({ page }) => {
    test.fixme(true, 'needs window.__map (WS5) and the nations marker source (WS2)');
    await page.goto('/');
    await waitForMapIdle(page);
    const p = await markerPagePoint(page, DHARUG.id);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('info-locality')).toHaveText(DHARUG.locality);
    await expect(page).toHaveURL(new RegExp(`[?&]n=${DHARUG.id}(&|$)`));
  });

  test('keyboard: Tab into the list, arrow to a nation, Enter selects', async ({ page }) => {
    test.fixme(true, 'needs keyboard-navigable NationList (WS4) wired in App (WS5)');
    await page.goto('/');
    await page.getByTestId('search-input').fill(KAURNA.locality);
    await page.getByTestId('search-input').press('Tab');
    // Focus should now be inside the list; move to the first (only) match and select it.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId(`nation-item-${KAURNA.id}`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('info-state')).toHaveText(KAURNA.state);
    // Escape closes the card and returns focus to the list item.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('info-card')).toBeHidden();
    await expect(page.getByTestId(`nation-item-${KAURNA.id}`)).toBeFocused();
  });

  test('prefers-reduced-motion: selection jumps instead of flying', async ({ page }) => {
    test.fixme(true, 'needs window.__map (WS5) and reduced-motion path in MapController (WS2)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForMapIdle(page);
    const before = await getCamera(page);
    await recordCamera(page);
    await page.getByTestId(`nation-item-${DHARUG.id}`).click();
    await waitForFlightEnd(page);
    const log = await cameraLog(page);
    const start = log.find((s) => s.event === 'movestart')!;
    const end = log.findLast((s) => s.event === 'moveend')!;
    expect(end.t - start.t, 'contracts: reduced motion <= 0.4 s').toBeLessThanOrEqual(400);
    expect(Math.min(...log.map((s) => s.zoom)), 'no rise step').toBeGreaterThanOrEqual(before.zoom);
  });
});

test.describe('search and filter', () => {
  test('search matches name, synonym and locality; state filter narrows the list', async ({
    page,
  }) => {
    test.fixme(true, 'needs search-input, state-filter and nation-item-<id> testids (WS4 + WS5)');
    await page.goto('/');
    const search = page.getByTestId('search-input');
    const items = page.locator('[data-testid^="nation-item-"]');

    await search.fill('kaurna');
    await expect(items).toHaveCount(1);
    await expect(page.getByTestId(`nation-item-${KAURNA.id}`)).toBeVisible();

    await search.fill('Darug'); // synonym spelling of Dharug
    await expect(page.getByTestId(`nation-item-${DHARUG.id}`)).toBeVisible();

    await search.fill('jenolan'); // modern locality
    await expect(page.getByTestId(`nation-item-${DHARUG.id}`)).toBeVisible();

    await search.fill('');
    await page.getByTestId('state-filter').selectOption('WA');
    await expect(page.getByTestId(`nation-item-${NGAATJATJARRA.id}`)).toBeVisible();
    await expect(page.getByTestId(`nation-item-${KAURNA.id}`)).toHaveCount(0);
  });
});

test.describe('URL state', () => {
  test('deep link ?n= restores the selection after load', async ({ page }) => {
    test.fixme(true, 'needs UrlSync (WS5) and info-card testids (WS4)');
    await page.goto(`/?n=${NGAATJATJARRA.id}`);
    await expect(page.getByTestId('info-locality')).toHaveText(NGAATJATJARRA.locality);
    await expect(page.getByTestId('info-state')).toHaveText(NGAATJATJARRA.state);
  });

  test('unknown ?n= is ignored and the overview is shown', async ({ page, consoleProblems }) => {
    test.fixme(true, 'needs UrlSync (WS5) and window.__map');
    await page.goto('/?n=NOT-A-CODE');
    await waitForMapIdle(page);
    await expect(page.getByTestId('info-card')).toHaveCount(0);
    expect((await getCamera(page)).zoom).toBeCloseTo(3.7, 1);
    expect(consoleProblems).toEqual([]);
  });
});
