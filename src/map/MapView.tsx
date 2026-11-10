import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import './setupMaplibre'; // must run before the first `new maplibregl.Map()` (worker URL)
import { buildStyle, MapController } from '../app/integration';
import { constrainCamera, hasWebGL, MAX_ZOOM, MIN_ZOOM } from '../app/mapSetup';
import { styleOptionsFrom, watchDem, wireMap } from '../app/wiring';
import { useAppStore } from '../store/useAppStore';
import { OVERVIEW_CAMERA } from './style/ids';

declare global {
  interface Window {
    /** The live map, for Playwright (WS6). Only set in dev and `VITE_E2E=1` builds. */
    __map?: maplibregl.Map;
  }
}

const EXPOSE_MAP = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

type Status = 'loading' | 'ready' | 'unsupported' | 'lost';

export interface MapViewProps {
  /** Called with the controller once the map has loaded, and with null on teardown. */
  onController?: (c: MapController | null) => void;
  /** Called with the map once it has loaded, and with null on teardown (the info card follows its pin). */
  onMap?: (map: maplibregl.Map | null) => void;
  /** Called when the terrain source falls back to the backup provider. */
  onDemFallback?: () => void;
  /** Called when there will be no map (no WebGL, or the GL context was lost). */
  onUnavailable?: () => void;
}

/**
 * Thin wrapper: owns the MapLibre Map, hands it to the MapController on `load`, and wires both to
 * the store (src/app/wiring.ts). Style, camera and markers live in WS1/WS2 modules.
 */
export function MapView({ onController, onMap, onDemFallback, onUnavailable }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(() => (hasWebGL() ? 'loading' : 'unsupported'));
  // Latest callbacks without re-creating the map when the parent re-renders.
  const callbacks = useRef({ onController, onMap, onDemFallback, onUnavailable });
  useEffect(() => {
    callbacks.current = { onController, onMap, onDemFallback, onUnavailable };
  });
  useEffect(() => {
    if (status === 'unsupported' || status === 'lost') callbacks.current.onUnavailable?.();
  }, [status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || status === 'unsupported') return;

    const store = useAppStore;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: buildStyle(styleOptionsFrom(store.getState(), 'mapterhorn')),
        center: [...OVERVIEW_CAMERA.center],
        zoom: OVERVIEW_CAMERA.zoom,
        pitch: OVERVIEW_CAMERA.pitch,
        bearing: OVERVIEW_CAMERA.bearing,
        // Not maxBounds: the globe (z < 4) ignores it. See constrainCamera in mapSetup.ts.
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        transformConstrain: (lngLat, zoom) => {
          const c = constrainCamera(lngLat.lng, lngLat.lat, zoom);
          return { center: new maplibregl.LngLat(c.lng, c.lat), zoom: c.zoom };
        },
        maxPitch: 85,
        attributionControl: false,
      });
    } catch (err) {
      console.error('[MapView] could not create the map', err);
      queueMicrotask(() => setStatus('unsupported'));
      return;
    }
    if (EXPOSE_MAP) window.__map = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    // With a listener attached MapLibre no longer logs errors itself. Tile failures are expected
    // (ocean tiles, flaky free hosts; WS1 handles DEM fallback), so keep them out of the console.
    map.on('error', (e: maplibregl.ErrorEvent & { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId || e.tile) {
        if (import.meta.env.DEV) console.debug('[MapView] tile error', e.sourceId, e.error);
        return;
      }
      console.error('[MapView]', e.error);
    });
    map.on('webglcontextlost', () => setStatus('lost'));
    const dem = watchDem(map, store, () => callbacks.current.onDemFallback?.());

    let controller: MapController | null = null;
    let unwire: (() => void) | null = null;
    map.on('load', () => {
      controller = new MapController(map, {
        reducedMotion: () => store.getState().reducedMotion,
        onCameraState: (s) => store.getState().setCameraState(s),
      });
      unwire = wireMap(map, controller, store, dem);
      setStatus('ready');
      callbacks.current.onController?.(controller);
      callbacks.current.onMap?.(map);
    });

    return () => {
      unwire?.();
      dem.dispose();
      controller?.destroy();
      if (controller) callbacks.current.onController?.(null);
      callbacks.current.onMap?.(null);
      if (EXPOSE_MAP && window.__map === map) delete window.__map;
      map.remove();
    };
    // `status` only gates the first run (WebGL check); later status changes must not rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={containerRef} className="map-canvas" data-testid="map-canvas" />
      {status === 'loading' && (
        <div className="map-status" role="status">
          <span className="map-status__spinner" aria-hidden="true" />
          Loading terrain…
        </div>
      )}
      {(status === 'unsupported' || status === 'lost') && (
        <div className="map-status map-status--error" role="alert">
          {status === 'unsupported' ? (
            <>
              <strong>The 3D map can’t be shown in this browser.</strong> It needs WebGL, which is
              turned off or unavailable here. You can still browse the list of nations and language
              groups.
            </>
          ) : (
            <>
              <strong>The 3D map stopped</strong> because the graphics context was lost.{' '}
              <button type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
