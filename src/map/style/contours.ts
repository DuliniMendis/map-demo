// Contour lines (WS7): vector tiles generated in the browser from the terrain DEM by
// maplibre-contour (https://github.com/onthegomap/maplibre-contour, BSD-3-Clause). It registers a
// MapLibre protocol, fetches and decodes the DEM tiles in its own (blob URL) web worker, runs
// marching squares and encodes the isolines as MVT. Nothing new is hosted.
//
// The library (~11 KB gz) is only downloaded the first time contours are switched on, and the
// source and layers are added then, in place (never `setStyle`). Off = `visibility: none`.
import { addProtocol, type Map as MlMap } from 'maplibre-gl';
import type mlcontour from 'maplibre-contour';
import {
  DEM_FALLBACK_EVENT,
  LAYER_CONTOUR_LABELS,
  LAYER_CONTOUR_LINES,
  LAYER_HILLSHADE,
  SOURCE_CONTOURS,
} from './ids';
import {
  CONTOUR_DEM,
  contourColors,
  contourLabelLayer,
  contourLineLayer,
  contourSource,
  contourTileOptions,
} from './layers/contours';
import { visibility } from './layers/visibility';
import { DEM_PROVIDERS, type DemProvider } from './sources';

type ContourLib = { default: typeof mlcontour };
type DemSource = InstanceType<ContourLib['default']['DemSource']>;

export interface ContourOptions {
  contours: boolean;
  imagery: boolean;
  /** The DEM provider the terrain is on (or about to be on); contours always follow it. */
  provider: DemProvider;
}

interface State {
  want: ContourOptions;
  /** Provider of the contour source currently in the style, or null if none was added yet. */
  installed: DemProvider | null;
}

const states = new WeakMap<MlMap, State>();

let libPromise: Promise<ContourLib['default']> | null = null;
/** One DemSource (= one pair of registered protocols) per provider, shared by every map. */
const demSources = new Map<DemProvider, DemSource>();

function loadLib(): Promise<ContourLib['default']> {
  libPromise ??= import('maplibre-contour').then((m) => m.default);
  return libPromise;
}

function demSourceFor(lib: ContourLib['default'], provider: DemProvider): DemSource {
  let src = demSources.get(provider);
  if (!src) {
    const cfg = DEM_PROVIDERS[provider];
    src = new lib.DemSource({
      url: cfg.tiles[0]!,
      encoding: 'terrarium',
      maxzoom: CONTOUR_DEM[provider].maxzoom,
      worker: true,
      // ~ two screens of 512 px DEM tiles at z12; each decoded tile is 1 MB of Float32.
      cacheSize: 64,
      timeoutMs: 10_000,
      id: `contour-${provider}`,
    });
    src.setupMaplibre({ addProtocol } as unknown as Parameters<DemSource['setupMaplibre']>[0]);
    demSources.set(provider, src);
  }
  return src;
}

/** Re-insert point: directly above the hillshade, i.e. below the river/border lines, markers and labels. */
function beforeIdAboveHillshade(map: MlMap): string | undefined {
  const layers = map.getStyle().layers;
  const i = layers.findIndex((l) => l.id === LAYER_HILLSHADE);
  if (i < 0) return layers.find((l) => l.id.startsWith('labels-'))?.id;
  return layers
    .slice(i + 1)
    .find((l) => l.id !== LAYER_CONTOUR_LINES && l.id !== LAYER_CONTOUR_LABELS)?.id;
}

function removeContours(map: MlMap): void {
  for (const id of [LAYER_CONTOUR_LABELS, LAYER_CONTOUR_LINES]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_CONTOURS)) map.removeSource(SOURCE_CONTOURS);
}

function install(map: MlMap, lib: ContourLib['default'], s: State): void {
  const { provider, contours, imagery } = s.want;
  if (s.installed !== null) removeContours(map);
  const dem = demSourceFor(lib, provider);
  map.addSource(
    SOURCE_CONTOURS,
    contourSource(dem.contourProtocolUrl(contourTileOptions(provider))),
  );
  const before = beforeIdAboveHillshade(map);
  map.addLayer(contourLineLayer(contours, imagery), before);
  map.addLayer(contourLabelLayer(contours, imagery), before);
  s.installed = provider;
}

function setVisible(map: MlMap, id: string, on: boolean): void {
  if (!map.getLayer(id)) return;
  const want = visibility(on);
  if ((map.getLayoutProperty(id, 'visibility') ?? 'visible') !== want) {
    map.setLayoutProperty(id, 'visibility', want);
  }
}

function setPaint(map: MlMap, id: string, prop: string, value: string): void {
  if (!map.getLayer(id)) return;
  type P = Parameters<MlMap['setPaintProperty']>[1];
  if (map.getPaintProperty(id, prop as P) !== value) map.setPaintProperty(id, prop as P, value);
}

function update(map: MlMap, s: State): void {
  const { contours, imagery } = s.want;
  setVisible(map, LAYER_CONTOUR_LINES, contours);
  setVisible(map, LAYER_CONTOUR_LABELS, contours);
  const c = contourColors(imagery);
  setPaint(map, LAYER_CONTOUR_LINES, 'line-color', c.line);
  setPaint(map, LAYER_CONTOUR_LABELS, 'text-color', c.text);
  setPaint(map, LAYER_CONTOUR_LABELS, 'text-halo-color', c.halo);
}

function run(map: MlMap, s: State): void {
  const needSource = s.installed !== s.want.provider && (s.want.contours || s.installed !== null);
  if (!needSource) {
    update(map, s);
    return;
  }
  void loadLib()
    .then((lib) => {
      // The latest wish wins; the map may also have gone away while the chunk loaded.
      if (states.get(map) !== s) return;
      if (s.installed !== s.want.provider) install(map, lib, s);
      update(map, s);
    })
    .catch((err: unknown) => {
      console.error('[contours] could not load maplibre-contour', err);
    });
}

/**
 * Bring the contour source/layers in line with `o`. Called by `applyStyleOptions` on every change.
 * The first `contours: true` loads the library and adds the source and layers above the hillshade;
 * after that, visibility and imagery-dependent colours change in place. A provider change (the DEM
 * fallback) replaces the source so contours read from the same host as the terrain.
 */
export function syncContours(map: MlMap, o: ContourOptions): void {
  let s = states.get(map);
  if (!s) {
    s = { want: o, installed: null };
    states.set(map, s);
    // The fallback swaps the terrain at the next idle; follow it even if nobody re-applies options.
    const st = s;
    map.on(DEM_FALLBACK_EVENT as 'data', () => {
      st.want = { ...st.want, provider: 'aws' };
      run(map, st);
    });
  }
  s.want = o;
  run(map, s);
}

/** Test hook: forget the cached library and DEM sources (each test gets fresh mocks). */
export function resetContoursForTests(): void {
  libPromise = null;
  demSources.clear();
}
