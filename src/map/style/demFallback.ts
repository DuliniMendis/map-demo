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

/**
 * Watch the DEM sources; after `DEM_FALLBACK_THRESHOLD` consecutive tile errors while on Mapterhorn,
 * switch both DEM sources to AWS Terrain Tiles and fire `style:dem-fallback` on the map with a
 * `DemFallbackEventData` payload (subscribe with `onDemFallback`). The fallback is sticky for the life
 * of the map: later `applyStyleOptions(..., { demProvider: 'mapterhorn' })` calls stay on AWS.
 *
 * Idempotent per map; `applyStyleOptions` calls it for you. Returns an uninstaller.
 * MapLibre does not report 404s as errors (it treats them as "no tile here"), so only real failures
 * (network, CORS, 5xx, decode) count.
 */
export function installDemFallback(map: MlMap): () => void {
  const existing = installed.get(map);
  if (existing) return existing;

  let consecutive = 0;

  const onError = (ev: MapEventType['error']) => {
    if (onlyErrorListener(map)) console.error(ev.error);
    const { sourceId, tile } = ev as typeof ev & { sourceId?: string; tile?: unknown };
    if (!sourceId || !DEM_SOURCE_IDS.has(sourceId) || !tile) return;
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

/** Typed subscription to `style:dem-fallback` (e.g. to show a toast). Returns an unsubscribe. */
export function onDemFallback(map: MlMap, cb: (data: DemFallbackEventData) => void): () => void {
  const listener = (ev: object) => cb(ev as DemFallbackEventData);
  untyped(map).on(DEM_FALLBACK_EVENT, listener);
  return () => untyped(map).off(DEM_FALLBACK_EVENT, listener);
}
