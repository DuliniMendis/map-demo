# WS6 — QA, performance, accessibility, deploy

**Goal:** confidence and a public preview URL. Playwright smoke tests from day one (against `data-testid`s in
contracts), performance/a11y budgets enforced in CI, static deploy with preview per PR.

**Owns:** `tests/**`, `.github/workflows/**` (extends WS0's CI), `vercel.json` or Pages workflow, `docs/qa.md`, `playwright.config.ts`.

## Deliverables

1. Playwright (Chromium, WebGL enabled via `--use-gl=angle --use-angle=metal` on macOS runners / `swiftshader` on Linux):
   - boot: map canvas present, overview camera, no console errors.
   - select from list: `nation-item-C6` → `info-card` shows `info-locality` "Petermann", `info-state` "Northern Territory"; URL has `?n=C6`.
   - re-select: choose another nation → camera state goes `flying` → `idle`; `map.getZoom()` dips then rises (expose `window.__map` in dev/test builds only).
   - marker click selects; keyboard navigation; search + state filter; reduced-motion jumps; deep link restores; layer toggles change `visibility`.
   - tile fallback: route `tiles.mapterhorn.com/**` to 500 → expect `style:dem-fallback` toast and AWS tiles requested.
2. Visual regression: 6 screenshot baselines (overview, Uluru, Blue Mountains, Kakadu, Tasmania, mobile panel) with `maxDiffPixelRatio 0.02`; tiles mocked from a committed fixture set (`tests/fixtures/tiles/`) so CI is deterministic and doesn't hammer free hosts.
3. Perf: Lighthouse CI (`lhci`) on preview build — a11y ≥ 95, performance ≥ 80 (desktop), bundle size check (`size-limit`) per contracts budget. Record FPS during a flight with `performance.now()` sampling in a test; fail if < 30 FPS median on the runner (advisory on Linux).
4. Accessibility: `@axe-core/playwright` on panel, info card, About; manual VoiceOver pass documented in `docs/qa.md`.
5. Deploy: Vercel static (`vercel.json`: `cleanUrls`, long cache for `/data/*.json` with hashed filenames or `s-maxage=86400, stale-while-revalidate`), preview per PR, production on `main`. Alternative: GitHub Pages workflow. Add `robots.txt`, 404.
6. Rate-limit etiquette: `docs/qa.md` section on not load-testing third-party tile hosts; tests use fixtures.
7. Release checklist in `docs/qa.md`: attribution visible, disclaimer shows on first visit, data report reviewed, licences listed, screenshots updated.

## Done when
- CI green on a PR that touches nothing (baseline), and red when a `data-testid` is removed (prove it once).
- Preview URL posted in the PR; Lighthouse report attached.

## Don't
- Don't hit live tile servers in CI loops. Don't add tests that depend on exact pixel positions of markers (use `data-testid`s and map API via `window.__map`).
