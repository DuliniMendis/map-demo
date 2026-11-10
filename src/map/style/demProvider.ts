import type { LayerSpecification, Map as MlMap } from 'maplibre-gl';
import { SOURCE_DEM, SOURCE_DEM_SHADE } from './ids';
import { demProviderOf, demSource, type DemProvider } from './sources';

export const DEM_SOURCE_IDS: ReadonlySet<string> = new Set([SOURCE_DEM, SOURCE_DEM_SHADE]);

/** Longest we wait for `idle` before swapping anyway (e.g. a blackholed host keeps tiles pending). */
export const SWAP_IDLE_TIMEOUT_MS = 4000;

const desired = new WeakMap<MlMap, DemProvider>();
const scheduled = new WeakSet<MlMap>();
const fellBack = new WeakSet<MlMap>();

/** The provider the live `dem` source is using, or null if the style has no recognisable DEM. */
export function getActiveDemProvider(map: MlMap): DemProvider | null {
  // A live source only gets `tiles` once its (async) TileJSON step has run; its serialized spec has
  // them from the moment it is added.
  const source = map.getSource(SOURCE_DEM) as
    { tiles?: string[]; serialize?: () => { tiles?: string[] } } | undefined;
  return demProviderOf(source?.serialize ? source.serialize() : source);
}

/** True once the automatic Mapterhorn → AWS fallback has happened on this map (sticky per session). */
export function hasFallenBack(map: MlMap): boolean {
  return fellBack.has(map);
}

export function markFallenBack(map: MlMap): void {
  fellBack.add(map);
}

/**
 * Ask for a DEM provider. The swap itself (removeSource/addSource) waits until the map is idle so it
 * never yanks the terrain out from under a flight; repeated calls coalesce to the latest request.
 */
export function requestDemProvider(map: MlMap, provider: DemProvider): void {
  desired.set(map, provider);
  if (scheduled.has(map)) return;
  if (getActiveDemProvider(map) === provider) return;

  const run = () => {
    scheduled.delete(map);
    const want = desired.get(map);
    if (want && want !== getActiveDemProvider(map)) swapDemSources(map, want);
  };

  if (!map.isMoving() && map.loaded()) {
    run();
    return;
  }

  scheduled.add(map);
  let done = false;
  const go = () => {
    if (done) return;
    if (map.isMoving()) {
      map.once('moveend', go);
      return;
    }
    done = true;
    map.off('idle', go);
    clearTimeout(timer);
    run();
  };
  map.once('idle', go);
  const timer = setTimeout(go, SWAP_IDLE_TIMEOUT_MS);
}

/**
 * Replace both DEM sources in place, keeping every layer that uses them (ours, or anyone's) at its
 * position with its current paint/layout, and the terrain at its current exaggeration.
 */
export function swapDemSources(map: MlMap, provider: DemProvider): void {
  const layers = map.getStyle().layers;
  const uses = (l: LayerSpecification) => 'source' in l && DEM_SOURCE_IDS.has(l.source as string);

  // For each DEM layer, remember the first non-DEM layer above it so we can re-insert in place.
  const restore: { layer: LayerSpecification; beforeId: string | undefined }[] = [];
  layers.forEach((layer, i) => {
    if (!uses(layer)) return;
    const above = layers.slice(i + 1).find((l) => !uses(l));
    restore.push({ layer, beforeId: above?.id });
  });

  const terrain = map.getTerrain();
  if (terrain) map.setTerrain(null);
  for (const { layer } of restore) map.removeLayer(layer.id);
  for (const id of DEM_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id);

  for (const id of DEM_SOURCE_IDS) map.addSource(id, demSource(provider));
  for (const { layer, beforeId } of restore) map.addLayer(layer, beforeId);
  if (terrain) map.setTerrain({ ...terrain, source: SOURCE_DEM });
}
