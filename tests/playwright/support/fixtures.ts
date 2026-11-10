import { test as base, expect } from '@playwright/test';
import { mockTiles, type MockTilesOptions, type TileLog } from './mockTiles.ts';

export interface ConsoleProblem {
  type: 'console.error' | 'pageerror';
  text: string;
}

interface Fixtures {
  /** Options for the automatic tile mock; override per file with `test.use({ tileOptions })`. */
  tileOptions: MockTilesOptions;
  /** Tile requests served/failed/blocked so far. Installed automatically for every test. */
  tiles: TileLog;
  /** console.error messages and uncaught page errors collected since the test started. */
  consoleProblems: ConsoleProblem[];
  /** Pretend the visitor has seen the Vision modal and turned sound off (default). A spec that
   *  tests the first visit sets `test.use({ firstVisit: true })`. */
  firstVisit: boolean;
  quietLanding: void;
}

export const test = base.extend<Fixtures>({
  tileOptions: [{}, { option: true }],
  firstVisit: [false, { option: true }],

  quietLanding: [
    async ({ context, firstVisit }, use) => {
      await context.addInitScript((first: boolean) => {
        try {
          if (!first) localStorage.setItem('country-map:vision-seen', '1');
          localStorage.setItem('country-map:sound-muted', '1');
        } catch {
          // about:blank and other opaque origins have no storage
        }
      }, firstVisit);
      await use();
    },
    { auto: true },
  ],

  tiles: [
    async ({ context, tileOptions }, use) => {
      await use(await mockTiles(context, tileOptions));
    },
    { auto: true },
  ],

  consoleProblems: [
    async ({ page }, use) => {
      const problems: ConsoleProblem[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push({ type: 'console.error', text: msg.text() });
      });
      page.on('pageerror', (err) => problems.push({ type: 'pageerror', text: String(err) }));
      await use(problems);
    },
    { auto: true },
  ],
});

export { expect };

/** Canvas MapLibre renders into, inside the contract's `map-canvas` container. */
export const MAP_CANVAS = '[data-testid="map-canvas"] canvas.maplibregl-canvas';
