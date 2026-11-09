import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import './setupMaplibre';
import { OVERVIEW_CAMERA } from './style/ids';

// WS0 stub: proves MapLibre loads. WS5 turns this into the thin wrapper that applies WS1's style
// and hands the Map to WS2's MapController.
const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b1a2a' } }],
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: EMPTY_STYLE,
      center: [...OVERVIEW_CAMERA.center],
      zoom: OVERVIEW_CAMERA.zoom,
      pitch: OVERVIEW_CAMERA.pitch,
      bearing: OVERVIEW_CAMERA.bearing,
      maxPitch: 85,
      attributionControl: false,
    });
    return () => map.remove();
  }, []);

  return <div ref={containerRef} className="map-canvas" data-testid="map-canvas" />;
}
