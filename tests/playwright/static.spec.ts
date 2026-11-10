// Static files that ship next to the app (deploy deliverables). vercel.json behaviour itself
// (headers, 404 routing) is checked in tests/unit/vercelConfig.test.ts and on the deployed site.
import { expect, test } from './support/fixtures.ts';

test('robots.txt is served and allows crawling', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/^User-agent: \*$/m);
  expect(body).toMatch(/^Allow: \/$/m);
});

test('404.html is a self-contained page that links home', async ({ page, consoleProblems }) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /map/i })).toHaveAttribute('href', '/');
  expect(consoleProblems).toEqual([]);
});
