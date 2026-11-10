// Dev-only test page for the basemap style: http://localhost:5173/src/map/style/dev.html
// Query params (all optional): loc=<place key>, l=imagery,labels,hillshade,relief,contours (or
// l=none), x=<exaggeration>, t=<sun hour 5–19>, dem=mapterhorn|aws, hud=0 (hide controls, for
// screenshots).
// Exposes `window.__dev` for scripted screenshots / FPS checks.
import '../setupMaplibre';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  applyStyleOptions,
  buildStyle,
  DEFAULT_STYLE_OPTIONS,
  type StyleOptions,
} from './buildStyle';
import { installDemFallback, onDemFallback } from './demFallback';
import { getActiveDemProvider } from './demProvider';
import { OVERVIEW_CAMERA } from './ids';
import { formatSunHour } from './lighting';
import { MAP_OPTIONS } from './sky';
import type { DemProvider } from './sources';

interface Pose {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

const PLACES: Record<string, { name: string; pose: Pose }> = {
  overview: { name: 'Overview', pose: { ...OVERVIEW_CAMERA, center: [...OVERVIEW_CAMERA.center] } },
  uluru: {
    name: 'Uluru',
    pose: { center: [131.045, -25.37], zoom: 12.4, pitch: 64, bearing: -25 },
  },
  bluemtns: {
    name: 'Blue Mountains',
    pose: { center: [150.305, -33.75], zoom: 12.6, pitch: 66, bearing: 165 },
  },
  kakadu: {
    name: 'Kakadu',
    pose: { center: [132.86, -13.26], zoom: 12.2, pitch: 64, bearing: -30 },
  },
  grampians: {
    name: 'Grampians (Gariwerd)',
    pose: { center: [142.5, -37.17], zoom: 11.8, pitch: 65, bearing: -70 },
  },
  tassw: {
    name: 'Tasmania SW',
    pose: { center: [146.4, -43.18], zoom: 11.6, pitch: 66, bearing: 20 },
  },
};

const params = new URLSearchParams(location.search);
const layerParam = params.get('l');
const enabled = layerParam === null ? null : new Set(layerParam.split(',').filter(Boolean));
const opts: StyleOptions = {
  ...DEFAULT_STYLE_OPTIONS,
  ...(enabled && {
    imagery: enabled.has('imagery'),
    labels: enabled.has('labels'),
    hillshade: enabled.has('hillshade'),
    relief: enabled.has('relief'),
    contours: enabled.has('contours'),
  }),
  sunHour: params.get('t') === null ? null : Number(params.get('t')),
  exaggeration: Number(params.get('x') ?? DEFAULT_STYLE_OPTIONS.exaggeration),
  demProvider: (params.get('dem') as DemProvider | null) ?? DEFAULT_STYLE_OPTIONS.demProvider,
};
const start = PLACES[params.get('loc') ?? 'overview']?.pose ?? PLACES.overview.pose;

const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(opts),
  ...start,
  ...MAP_OPTIONS,
  hash: false,
  attributionControl: { compact: false },
});
// What the app shell should do too: watch for DEM failures from the first tile on.
installDemFallback(map);
// Contours and the sun light are applied at runtime (after style.load), never by buildStyle.
applyStyleOptions(map, opts);
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({}), 'bottom-left');

// ---- HUD ----
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const hud = $('#hud');
if (params.get('hud') === '0') hud.classList.add('hidden');
const status = $('#status');
const layerBoxes = [...document.querySelectorAll<HTMLInputElement>('#layers input')];
const slider = $<HTMLInputElement>('#exaggeration');
const sliderOut = $<HTMLOutputElement>('#exaggeration-value');
const demSelect = $<HTMLSelectElement>('#dem');
const sun = $<HTMLInputElement>('#sun');
const sunOut = $<HTMLOutputElement>('#sun-value');

function syncHud() {
  for (const box of layerBoxes) box.checked = opts[box.name as keyof StyleOptions] as boolean;
  slider.value = String(opts.exaggeration);
  sliderOut.value = opts.exaggeration.toFixed(1);
  demSelect.value = opts.demProvider;
  sun.value = String(opts.sunHour ?? 12);
  sunOut.value = opts.sunHour === null ? 'default light' : formatSunHour(opts.sunHour);
}

function apply(next: Partial<StyleOptions>) {
  Object.assign(opts, next);
  applyStyleOptions(map, opts);
  syncHud();
}

for (const box of layerBoxes) box.onchange = () => apply({ [box.name]: box.checked });
slider.oninput = () => apply({ exaggeration: Number(slider.value) });
demSelect.onchange = () => apply({ demProvider: demSelect.value as DemProvider });
sun.oninput = () => apply({ sunHour: Number(sun.value) });
$<HTMLButtonElement>('#sun-reset').onclick = () => apply({ sunHour: null });
$<HTMLInputElement>('#tiles').onchange = (e) =>
  (map.showTileBoundaries = (e.target as HTMLInputElement).checked);

function go(key: string, animate = true) {
  const pose = PLACES[key]?.pose;
  if (!pose) return;
  if (animate) map.flyTo({ ...pose, speed: 0.8, curve: 1.4, essential: true });
  else map.jumpTo(pose);
}
const places = $('#places');
for (const [key, { name }] of Object.entries(PLACES)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => go(key);
  places.append(b);
}

// FPS: count rendered frames.
let frames = 0;
map.on('render', () => frames++);
let fps = 0;
setInterval(() => {
  fps = frames;
  frames = 0;
  const c = map.getCenter();
  status.textContent =
    `${fps} fps · z${map.getZoom().toFixed(1)} · pitch ${map.getPitch().toFixed(0)}° · ` +
    `${c.lng.toFixed(3)}, ${c.lat.toFixed(3)} · DEM ${getActiveDemProvider(map) ?? '?'}`;
}, 1000);

const events: string[] = [];
onDemFallback(map, (e) => {
  events.push(`dem-fallback ${e.from}→${e.to}`);
  opts.demProvider = e.to;
  syncHud();
  status.title = `Fell back to ${e.to}: ${e.error?.message ?? ''}`;
});

/** Pan continuously for `ms` and return the mean rendered frames per second. */
async function measureFps(ms = 6000, dx = 600): Promise<number> {
  const idle = map.once('idle');
  map.triggerRepaint();
  await idle;
  let n = 0;
  const count = () => n++;
  map.on('render', count);
  const t0 = performance.now();
  const steps = Math.round(ms / 1000);
  for (let i = 0; i < steps; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    map.panBy([dx * dir, 0], { duration: 1000, easing: (t) => t });
    await new Promise((r) => setTimeout(r, 1000));
  }
  map.off('render', count);
  return (n * 1000) / (performance.now() - t0);
}

syncHud();
declare global {
  interface Window {
    __dev: unknown;
  }
}
window.__dev = { map, go, apply, opts, events, measureFps, PLACES };
