import type { Map as MlMap, MapEventType } from 'maplibre-gl';
import {
  DEM_SOURCE_IDS,
  getActiveDemProvider,
  hasFallenBack,
  markFallenBack,
  requestDemProvider,
} from './demProvider';
import { DEM_FALLBACK_EVENT } from './ids';
import type { DemFallbackEventData } from './types';

/** Consecutive DEM tile errors (no successful DEM tile in between) that trigger the fallback. */
export const DEM_FALLBACK_THRESHOLD = 3;

const installed = new WeakMap<MlMap, () => void>();

/** MapLibre's typings only know built-in event names; custom ones go through this view of the map. */
interface UntypedEvents {
  fire(type: string, properties?: object): unknown;
  on(type: string, listener: (ev: object) => void): unknown;
  off(type: string, listener: (ev: object) => void): unknown;
  _listeners?: Record<string, unknown[] | undefined>;
  _oneTimeListeners?: Record<string, unknown[] | undefined>;
}
const untyped = (map: MlMap) => map as unknown as UntypedEvents;

/** MapLibre only logs errors itself when nobody listens; keep that behaviour if we're alone. */
function onlyErrorListener(map: MlMap): boolean {
  const m = untyped(map);
  const n = (m._listeners?.error?.length ?? 0) + (m._oneTimeListeners?.error?.length ?? 0);
  return n <= 1;
}

/** Network/CORS errors (no status), 5xx, 408 and 429 mean the host is struggling; other 4xx don't. */
export function countsAsOutage(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status;
  if (typeof status !== 'number' || status === 0) return true;
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Watch the DEM sources; after `DEM_FALLBACK_THRESHOLD` consecutive tile errors while on Mapterhorn,
 * switch both DEM sources to AWS Terrain Tiles and fire `style:dem-fallback` on the map with a
 * `DemFallbackEventData` payload (subscribe with `onDemFallback`). The fallback is sticky for the life
 * of the map: later `applyStyleOptions(..., { demProvider: 'mapterhorn' })` calls stay on AWS.
 *
 * Idempotent per map; `applyStyleOptions` calls it too, but call it right after `new Map()` so early
 * tile errors count. Returns an uninstaller.
 *
 * Only real outages count: network/CORS failures (no HTTP status), 5xx, 408 and 429. Other 4xx never
 * count. In particular Mapterhorn answers 404 for all-ocean tiles and for z13+ tiles where only 30 m
 * data exists; MapLibre 6.17 already treats 404 as "no tile here" and does not raise an error, and this
 * check keeps it that way should that change.
 */
export function installDemFallback(map: MlMap): () => void {
  const existing = installed.get(map);
  if (existing) return existing;

  let consecutive = 0;

  const onError = (ev: MapEventType['error']) => {
    if (onlyErrorListener(map)) console.error(ev.error);
    const { sourceId, tile } = ev as typeof ev & { sourceId?: string; tile?: unknown };
    if (!sourceId || !DEM_SOURCE_IDS.has(sourceId) || !tile) return;
    if (!countsAsOutage(ev.error)) return;
    if (hasFallenBack(map) || getActiveDemProvider(map) !== 'mapterhorn') return;
    consecutive += 1;
    if (consecutive < DEM_FALLBACK_THRESHOLD) return;

    markFallenBack(map);
    consecutive = 0;
    requestDemProvider(map, 'aws');
    const data: DemFallbackEventData = { from: 'mapterhorn', to: 'aws', error: ev.error };
    untyped(map).fire(DEM_FALLBACK_EVENT, data);
  };

  const onSourceData = (ev: MapEventType['sourcedata']) => {
    if (ev.tile && DEM_SOURCE_IDS.has(ev.sourceId)) consecutive = 0;
  };

  map.on('error', onError);
  map.on('sourcedata', onSourceData);
  const uninstall = () => {
    map.off('error', onError);
    map.off('sourcedata', onSourceData);
    installed.delete(map);
  };
  installed.set(map, uninstall);
  return uninstall;
}

/**
 * The name WS5's app shell imports (from `buildStyle`): same as `installDemFallback`. Call it right
 * after `new Map()`, before `load`; returns an unsubscribe.
 */
export const watchDemFallback: (map: MlMap) => () => void = installDemFallback;

/** Typed subscription to `style:dem-fallback` (e.g. to show a toast). Returns an unsubscribe. */
export function onDemFallback(map: MlMap, cb: (data: DemFallbackEventData) => void): () => void {
  const listener = (ev: object) => cb(ev as DemFallbackEventData);
  untyped(map).on(DEM_FALLBACK_EVENT, listener);
  return () => untyped(map).off(DEM_FALLBACK_EVENT, listener);
}
