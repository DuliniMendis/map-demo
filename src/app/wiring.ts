// Store ↔ MapController ↔ style wiring. `watchDem` runs as soon as the Map exists (DEM tile errors
// can happen before `load`); `wireMap` runs once per Map from MapView's `load` handler.
import type * as maplibregl from 'maplibre-gl';
import type { AppActions, AppState, useAppStore } from '../store/useAppStore';
import type { Nation } from '../types/nation';
import {
  applyStyleOptions,
  watchDemFallback,
  type MapController,
  type StyleOptions,
} from './integration';
import { DEM_FALLBACK_EVENT } from '../map/style/ids';

export { DEM_FALLBACK_EVENT };

type Store = Pick<typeof useAppStore, 'getState' | 'subscribe'>;
type State = AppState & AppActions;

export interface DemState {
  /** Provider every `applyStyleOptions` call must pass, so a fallback is never undone. */
  provider(): StyleOptions['demProvider'];
  dispose(): void;
}

export function styleOptionsFrom(
  s: Pick<AppState, 'layers' | 'exaggeration' | 'sunHour'>,
  demProvider: StyleOptions['demProvider'],
): StyleOptions {
  return {
    ...s.layers,
    exaggeration: s.exaggeration,
    sunHour: s.sunHour,
    globe: true,
    demProvider,
  };
}

/** Resolves when the map has finished loading tiles and is not moving. */
export function whenIdle(map: maplibregl.Map): Promise<void> {
  if (map.loaded() && !map.isMoving()) return Promise.resolve();
  return map.once('idle').then(() => undefined);
}

/**
 * Call right after `new Map()`. Installs WS1's DEM fallback watcher and listens for
 * `style:dem-fallback`: from then on the AWS provider is used (re-applied once the style has
 * loaded) and `onFallback` fires once, for the "Using backup terrain" toast.
 */
export function watchDem(
  map: maplibregl.Map,
  store: Pick<Store, 'getState'>,
  onFallback: () => void,
): DemState {
  let provider: StyleOptions['demProvider'] = 'mapterhorn';
  let loaded = false;
  const onLoad = () => {
    loaded = true;
  };
  const apply = () => applyStyleOptions(map, styleOptionsFrom(store.getState(), provider));
  const onDemFallback = () => {
    if (provider === 'aws') return;
    provider = 'aws';
    if (loaded) apply();
    else void map.once('load').then(apply);
    onFallback();
  };
  map.on('load', onLoad);
  const stopWatch = watchDemFallback(map);
  map.on(DEM_FALLBACK_EVENT as keyof maplibregl.MapEventType, onDemFallback);
  return {
    provider: () => provider,
    dispose: () => {
      stopWatch();
      map.off('load', onLoad);
      map.off(DEM_FALLBACK_EVENT as keyof maplibregl.MapEventType, onDemFallback);
    },
  };
}

export function wireMap(
  map: maplibregl.Map,
  controller: MapController,
  store: Store,
  dem: Pick<DemState, 'provider'>,
): () => void {
  let disposed = false;
  const byId = (id: string | null): Nation | null =>
    id === null ? null : (store.getState().nations.find((n) => n.id === id) ?? null);

  const start = (next: Nation, from: Nation | null) => {
    controller.flyToNation(next, from).catch((err: unknown) => {
      if (import.meta.env.DEV) console.debug('[wiring] flight interrupted', err);
    });
  };

  // The first flight (usually a deep link) waits for the overview terrain to settle, so it
  // doesn't start while the DEM is still loading. Meanwhile cameraState reads 'flying' so the info
  // card doesn't flash up at the overview.
  let firstFlight = true;
  const fly = (id: string | null, prevId: string | null) => {
    controller.setSelected(id);
    const next = byId(id);
    if (!next) return; // deselect keeps the camera where it is; "Overview" flies out
    const from = byId(prevId);
    if (firstFlight) {
      firstFlight = false;
      if (!map.loaded() || map.isMoving()) {
        store.getState().setCameraState('flying');
        void whenIdle(map).then(() => {
          if (disposed) return;
          const now = store.getState();
          if (now.selectedId === id) start(next, from);
          else if (now.selectedId === null) now.setCameraState('idle');
        });
        return;
      }
    }
    start(next, from);
  };

  // Initial sync.
  const initial = store.getState();
  controller.setNations(initial.nations);
  controller.setHovered(initial.hoveredId);
  applyStyleOptions(map, styleOptionsFrom(initial, dem.provider()));
  if (initial.selectedId) fly(initial.selectedId, null); // deep link resolved before map load

  const unsubscribe = store.subscribe((s: State, prev: State) => {
    if (s.nations !== prev.nations) {
      controller.setNations(s.nations);
      controller.setSelected(s.selectedId);
    }
    // Re-targeting mid-flight is allowed: the controller cancels the current animation.
    if (s.selectedId !== prev.selectedId) fly(s.selectedId, prev.selectedId);
    if (s.hoveredId !== prev.hoveredId) controller.setHovered(s.hoveredId);
    if (
      s.layers !== prev.layers ||
      s.exaggeration !== prev.exaggeration ||
      s.sunHour !== prev.sunHour
    ) {
      applyStyleOptions(map, styleOptionsFrom(s, dem.provider()));
    }
  });

  const offMarkerClick = controller.onMarkerClick((id) => store.getState().select(id));

  // Map → store hover (the controller owns marker feature-state; the store mirrors it for the list).
  const offMarkerHover = controller.onMarkerHover((id) => {
    if (store.getState().hoveredId !== id) store.getState().setHovered(id);
  });

  return () => {
    disposed = true;
    unsubscribe();
    offMarkerClick();
    offMarkerHover();
  };
}

/** "Overview" button: clear the selection and fly back out to the whole continent. */
export function goToOverview(controller: MapController | null, store: Pick<Store, 'getState'>) {
  store.getState().select(null);
  controller?.flyToOverview().catch(() => undefined);
}
