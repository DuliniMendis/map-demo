// WS2 dev page (served by Vite at /src/map/controller/dev.html). Uses the terrain spike's style inline until WS1's
// buildStyle lands. Exposes `window.__ws2` for the Playwright test and the timing measurements in docs/camera.md.

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../setupMaplibre';
import mock from '../../data/mock-nations.json';
import type { Nation } from '../../types/nation';
import { AUSTRALIA_BOUNDS, OVERVIEW_CAMERA } from '../style/ids';
import { MapController, type CameraState, type FlightStepEvent } from './MapController';

let nations = (mock as unknown as { nations: Nation[] }).nations;
const params = new URLSearchParams(location.search);
const bounds = AUSTRALIA_BOUNDS.flat() as [number, number, number, number];

const DEM_SOURCE: maplibregl.RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  bounds,
  attribution: 'Terrain Tiles (Mapzen/AWS)',
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the duplicate attribution
const { attribution: _dupAttribution, ...DEM_HILLSHADE_SOURCE } = DEM_SOURCE;

/** spikes/terrain-spike/index.html, plus glyphs for the marker labels and `bounds` so we only fetch Australia. */
const DEV_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    imagery: {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 14,
      bounds,
      attribution: 'Sentinel-2 cloudless 2024 by EOX IT Services GmbH (CC BY 4.0)',
    },
    dem: DEM_SOURCE,
    // Same tiles (HTTP-cached) as a second source: MapLibre warns when hillshade and terrain share one.
    'dem-hillshade': DEM_HILLSHADE_SOURCE,
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1a2a' } },
    { id: 'imagery', type: 'raster', source: 'imagery' },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem-hillshade',
      paint: { 'hillshade-exaggeration': 0.35 },
    },
  ],
  terrain: { source: 'dem', exaggeration: 1.5 },
  sky: {
    'sky-color': '#88bbee',
    'horizon-color': '#ffffff',
    'fog-color': '#ffffff',
    'fog-ground-blend': 0.6,
    'horizon-fog-blend': 0.8,
    'sky-horizon-blend': 0.6,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
  },
};

const reducedBox = document.getElementById('reduced') as HTMLInputElement;
reducedBox.checked =
  params.get('rm') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
if (params.get('hud') === '0') document.body.classList.add('hide-hud');
const statusEl = document.getElementById('status')!;

const map = new maplibregl.Map({
  container: 'map',
  style: DEV_STYLE,
  center: [...OVERVIEW_CAMERA.center],
  zoom: OVERVIEW_CAMERA.zoom,
  pitch: OVERVIEW_CAMERA.pitch,
  bearing: OVERVIEW_CAMERA.bearing,
  maxPitch: 85,
  canvasContextAttributes: { preserveDrawingBuffer: params.get('pdb') === '1' },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));

export interface Sample {
  t: number;
  zoom: number;
  pitch: number;
  bearing: number;
  lng: number;
  lat: number;
  /** Map centre elevation the camera is aimed at (m, as MapLibre holds it). */
  centerElevation: number;
  /** Terrain under the map centre (m). */
  terrainAtCenter: number | null;
  /** Camera altitude above sea level (m). */
  cameraAltitude: number;
  /** Terrain under the camera (m). */
  terrainUnderCamera: number | null;
}

/** Dev-only peek at MapLibre's internal transform for the camera position (no public getter in 6.17). */
function internalTransform(m: maplibregl.Map) {
  return (
    m as unknown as {
      _camera: { transform: { getCameraAltitude(): number; getCameraLngLat(): maplibregl.LngLat } };
    }
  )._camera.transform;
}

const ws2 = {
  map,
  nations,
  controller: null as MapController | null,
  states: [] as { s: CameraState; at: number }[],
  steps: [] as FlightStepEvent[],
  samples: [] as Sample[],
  sampling: false,
  selected: null as Nation | null,
  ready: false,
  clicks: [] as string[],
  startSampling() {
    ws2.samples = [];
    ws2.sampling = true;
    const tick = () => {
      if (!ws2.sampling) return;
      const c = map.getCenter();
      const tr = internalTransform(map);
      ws2.samples.push({
        t: performance.now(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        lng: c.lng,
        lat: c.lat,
        centerElevation: map.getCenterElevation(),
        terrainAtCenter: map.queryTerrainElevation(c),
        cameraAltitude: tr.getCameraAltitude(),
        terrainUnderCamera: map.queryTerrainElevation(tr.getCameraLngLat()),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  stopSampling() {
    ws2.sampling = false;
    return ws2.samples;
  },
  /** Selects like the app will: flyToNation(next, previous). */
  select(id: string) {
    const next = ws2.nations.find((n) => n.id === id);
    if (!next || !ws2.controller) return Promise.resolve();
    const prev = ws2.selected;
    ws2.selected = next;
    renderButtons();
    return ws2.controller.flyToNation(next, prev);
  },
  /** Fly to an arbitrary Nation object (used for the synthetic near-neighbour measurement). */
  flyTo(n: Nation) {
    const prev = ws2.selected;
    ws2.selected = n;
    renderButtons();
    return ws2.controller!.flyToNation(n, prev);
  },
  overview() {
    ws2.selected = null;
    ws2.controller?.setSelected(null);
    renderButtons();
    return ws2.controller?.flyToOverview() ?? Promise.resolve();
  },
};
declare global {
  interface Window {
    __ws2: typeof ws2;
    __map: maplibregl.Map;
  }
}
window.__ws2 = ws2;
window.__map = map;

function renderButtons() {
  const wrap = document.getElementById('buttons')!;
  wrap.replaceChildren(
    ...ws2.nations.slice(0, 12).map((n) => {
      const b = document.createElement('button');
      b.textContent = `${n.name} (${n.modern.stateCode})`;
      b.dataset.testid = `nation-item-${n.id}`;
      b.setAttribute('aria-pressed', String(ws2.selected?.id === n.id));
      b.onclick = () => void ws2.select(n.id);
      return b;
    }),
    Object.assign(document.createElement('button'), {
      textContent: 'Overview',
      onclick: () => void ws2.overview(),
    }),
  );
}
renderButtons();

let flightStart = 0;
map.on('load', async () => {
  // `?nations=<url>` swaps the 10 mock nations for another nations.json (e.g. WS3's 455).
  const url = params.get('nations');
  if (url) {
    nations = ((await (await fetch(url)).json()) as { nations: Nation[] }).nations;
    ws2.nations = nations;
    renderButtons();
  }
  const controller = new MapController(map, {
    reducedMotion: () => reducedBox.checked,
    onCameraState: (s) => {
      ws2.states.push({ s, at: performance.now() });
      if (s === 'flying') flightStart = performance.now();
      const took = s === 'idle' ? ` (${Math.round(performance.now() - flightStart)} ms)` : '';
      statusEl.textContent = `camera: ${s}${took}\nselected: ${ws2.selected?.name ?? '—'}`;
    },
    onStep: (e) => {
      ws2.steps.push(e);
      if (e.phase === 'start') {
        const s = e.steps[e.index]!;
        const ms = s.type === 'jumpTo' ? s.fadeMs : s.duration;
        console.info(
          `[ws2] flight ${e.flight} ${e.target} step ${e.index + 1}/${e.steps.length} ${s.type} ${ms} ms`,
        );
      }
    },
  });
  controller.setNations(nations);
  controller.onMarkerClick((id) => {
    ws2.clicks.push(id);
    void ws2.select(id);
  });
  controller.onMarkerHover((id) => controller.setHovered(id));
  ws2.controller = controller;
  ws2.ready = true;
  statusEl.textContent = 'camera: idle — click a marker or a button';
});
map.on('error', (e) => console.warn('[map error]', e.error?.message));
