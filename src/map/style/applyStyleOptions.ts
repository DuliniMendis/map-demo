import type { Map as MlMap } from 'maplibre-gl';
import { syncContours } from './contours';
import { installDemFallback } from './demFallback';
import { hasFallenBack, requestDemProvider } from './demProvider';
import {
  LAYER_BACKGROUND,
  LAYER_HILLSHADE,
  LAYER_IMAGERY,
  LAYER_RELIEF,
  LAYER_WATER,
  SOURCE_DEM,
} from './ids';
import { backgroundColor } from './layers/base';
import { LABEL_LAYER_IDS } from './layers/labels';
import { applyLighting } from './lighting';
import { reliefOpacity } from './layers/relief';
import { applyProjection } from './projection';
import { STATE_IMAGERY_LAYER_IDS } from './stateImagery';
import { visibility } from './layers/visibility';
import type { StyleOptions } from './types';

const pending = new WeakMap<MlMap, StyleOptions>();

function styleReady(map: MlMap): boolean {
  try {
    return map.getLayer(LAYER_IMAGERY) !== undefined;
  } catch {
    return false;
  }
}

function setVisible(map: MlMap, id: string, on: boolean): void {
  if (!map.getLayer(id)) return;
  const want = visibility(on);
  if ((map.getLayoutProperty(id, 'visibility') ?? 'visible') !== want) {
    map.setLayoutProperty(id, 'visibility', want);
  }
}

type PaintProp = Parameters<MlMap['setPaintProperty']>[1];

function setPaint(map: MlMap, id: string, prop: PaintProp, value: number | string): void {
  if (!map.getLayer(id)) return;
  if (map.getPaintProperty(id, prop) !== value) map.setPaintProperty(id, prop, value);
}

/**
 * Bring a map built from `buildStyle` in line with `o`, in place: layer visibility, the
 * imagery-dependent hillshade/relief strengths, the time-of-day light, terrain exaggeration, DEM
 * provider and contour lines. Never calls
 * `setStyle`, so other workstreams' sources and layers survive. Cheap to call on every store change
 * (it only touches what differs). Calls made before the style has loaded are applied on `style.load`
 * (latest wins). Also installs the DEM fallback watcher (`installDemFallback`).
 */
export function applyStyleOptions(map: MlMap, o: StyleOptions): void {
  if (!styleReady(map)) {
    const first = !pending.has(map);
    pending.set(map, o);
    if (first) {
      map.once('style.load', () => {
        const latest = pending.get(map);
        pending.delete(map);
        if (latest) applyStyleOptions(map, latest);
      });
    }
    return;
  }

  installDemFallback(map);

  setVisible(map, LAYER_IMAGERY, o.imagery);
  for (const id of STATE_IMAGERY_LAYER_IDS) setVisible(map, id, o.imagery);
  // Without the photo: paper land and blue water, so hillshade and relief have something to sit on.
  setVisible(map, LAYER_WATER, !o.imagery);
  setPaint(map, LAYER_BACKGROUND, 'background-color', backgroundColor(o.imagery));
  setVisible(map, LAYER_HILLSHADE, o.hillshade);
  setVisible(map, LAYER_RELIEF, o.relief);
  for (const id of LABEL_LAYER_IDS) setVisible(map, id, o.labels);

  // Hillshade strength/colours (imagery-dependent) and the time-of-day light (WS7, lighting.ts).
  applyLighting(map, o);
  setPaint(map, LAYER_RELIEF, 'color-relief-opacity', reliefOpacity(o.imagery));

  const terrain = map.getTerrain();
  if (!terrain || terrain.source !== SOURCE_DEM || terrain.exaggeration !== o.exaggeration) {
    map.setTerrain({ source: SOURCE_DEM, exaggeration: o.exaggeration });
  }

  applyProjection(map, o.globe);

  // After an automatic fallback, stay on AWS even if the caller still asks for Mapterhorn.
  const provider = hasFallenBack(map) ? 'aws' : o.demProvider;
  requestDemProvider(map, provider);
  // Contour lines (WS7, contours.ts), read from the same DEM provider as the terrain.
  syncContours(map, { contours: o.contours, imagery: o.imagery, provider });
}
