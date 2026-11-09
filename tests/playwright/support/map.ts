// Helpers that drive the map through `window.__map`, which WS5 exposes in dev and e2e builds only
// (`import.meta.env.DEV || import.meta.env.VITE_E2E === '1'`; `pnpm build:e2e` sets VITE_E2E=1).
// Tests use the map API rather than pixel positions (WS6 brief: "Don't").
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __map?: MaplibreMap;
    /** Installed by `recordCamera`. */
    __cameraLog?: CameraSample[];
  }
}

export interface Camera {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface CameraSample {
  t: number;
  zoom: number;
  moving: boolean;
  event: 'movestart' | 'move' | 'moveend';
}

export async function waitForMapHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__map), undefined, { timeout: 15_000 });
}

/** Resolves once the style is loaded and the map has rendered with no tiles pending. */
export async function waitForMapIdle(page: Page): Promise<void> {
  await waitForMapHandle(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = window.__map!;
        if (map.loaded() && !map.isMoving()) resolve();
        else map.once('idle', () => resolve());
      }),
  );
}

export async function getCamera(page: Page): Promise<Camera> {
  return page.evaluate(() => {
    const map = window.__map!;
    const c = map.getCenter();
    return {
      lng: c.lng,
      lat: c.lat,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  });
}

/** Starts logging zoom on every camera event into `window.__cameraLog`. */
export async function recordCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    const map = window.__map!;
    const log: CameraSample[] = [];
    window.__cameraLog = log;
    for (const event of ['movestart', 'move', 'moveend'] as const) {
      map.on(event, () =>
        log.push({ t: performance.now(), zoom: map.getZoom(), moving: map.isMoving(), event }),
      );
    }
  });
}

export async function cameraLog(page: Page): Promise<CameraSample[]> {
  return page.evaluate(() => window.__cameraLog ?? []);
}

/** Waits until the camera has started moving and then come to rest. */
export async function waitForFlightEnd(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const log = window.__cameraLog ?? [];
      return log.some((s) => s.event === 'movestart') && !window.__map!.isMoving();
    },
    undefined,
    { timeout },
  );
}

/** Screen position (relative to the page) of a nation's marker, from the contract's `nations` source. */
export async function markerPagePoint(page: Page, code: string): Promise<{ x: number; y: number }> {
  return page.evaluate((code) => {
    const map = window.__map!;
    const f = map
      .querySourceFeatures('nations')
      .find((feature) => feature.properties?.code === code);
    if (!f || f.geometry.type !== 'Point') throw new Error(`no marker for ${code}`);
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = map.project([lng, lat]);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, code);
}

/**
 * Clicks a nation in the side panel. The list is virtualised (only rows near the viewport exist in
 * the DOM), so this searches for `query` (the nation's name) first.
 */
export async function selectFromList(page: Page, id: string, query: string): Promise<void> {
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId(`nation-item-${id}`).click();
}
