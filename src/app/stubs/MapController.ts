// TEMPORARY STUB (WS5) for WS2's `src/map/controller/MapController.ts`. Delete when WS2 lands; see
// ./README.md. Public API matches docs/contracts.md exactly. No choreography: a single `flyTo`
// (or `jumpTo` with reduced motion) and plain circle markers, enough to wire and test the shell.
import type { FeatureCollection } from 'geojson';
import type * as maplibregl from 'maplibre-gl';
import { LAYER_LABELS_FIRST, OVERVIEW_CAMERA } from '../../map/style/ids';
import type { Nation } from '../../types/nation';

const SOURCE = 'nations';
const CIRCLE = 'nations-circle';
const RING = 'nations-selected-ring';
const LABEL = 'nations-label';
const FLIGHT_TIMEOUT_MS = 7000;

export interface MapControllerOptions {
  reducedMotion: () => boolean;
  onCameraState: (s: 'idle' | 'flying') => void;
}

export class MapController {
  private readonly map: maplibregl.Map;
  private readonly opts: MapControllerOptions;
  private indexById = new Map<string, number>();
  private selectedIdx: number | null = null;
  private hoveredIdx: number | null = null;
  private flight = 0;
  private clickListeners = new Set<(id: string) => void>();

  constructor(map: maplibregl.Map, opts: MapControllerOptions) {
    this.map = map;
    this.opts = opts;
    map.on('click', CIRCLE, this.handleClick);
    map.on('mouseenter', CIRCLE, this.handleEnter);
    map.on('mouseleave', CIRCLE, this.handleLeave);
  }

  setNations(nations: Nation[]): void {
    this.indexById = new Map(nations.map((n, i) => [n.id, i]));
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features: nations.map((n, i) => ({
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
        properties: { idx: i, code: n.id, name: n.name },
      })),
    };
    const existing = this.map.getSource<maplibregl.GeoJSONSource>(SOURCE);
    if (existing) {
      existing.setData(data);
      return;
    }
    this.map.addSource(SOURCE, { type: 'geojson', data, promoteId: 'idx' });
    const before = this.map.getLayer(LAYER_LABELS_FIRST) ? LAYER_LABELS_FIRST : undefined;
    this.map.addLayer(
      {
        id: RING,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 10, 14],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            1,
            0,
          ],
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: CIRCLE,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 8],
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#f08a3c',
            '#c2641f',
          ],
          'circle-stroke-color': '#1b1f24',
          'circle-stroke-width': 1.2,
          'circle-opacity': 0.9,
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: LABEL,
        type: 'symbol',
        source: SOURCE,
        minzoom: 6.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.9,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#1b1f24', 'text-halo-width': 1.4 },
      },
      before,
    );
  }

  flyToNation(n: Nation, from: Nation | null): Promise<void> {
    void from; // the real controller uses it for the rise step
    const view = n.view ?? {};
    return this.run({
      center: [n.lng, n.lat],
      zoom: view.zoom ?? 10.5,
      pitch: view.pitch ?? 62,
      bearing: view.bearing ?? -18,
    });
  }

  flyToOverview(): Promise<void> {
    return this.run({
      center: [...OVERVIEW_CAMERA.center],
      zoom: OVERVIEW_CAMERA.zoom,
      pitch: OVERVIEW_CAMERA.pitch,
      bearing: OVERVIEW_CAMERA.bearing,
    });
  }

  setSelected(id: string | null): void {
    this.selectedIdx = this.setState(this.selectedIdx, id, 'selected');
  }

  setHovered(id: string | null): void {
    this.hoveredIdx = this.setState(this.hoveredIdx, id, 'hover');
  }

  onMarkerClick(cb: (id: string) => void): () => void {
    this.clickListeners.add(cb);
    return () => this.clickListeners.delete(cb);
  }

  destroy(): void {
    this.flight += 1;
    this.clickListeners.clear();
    this.map.off('click', CIRCLE, this.handleClick);
    this.map.off('mouseenter', CIRCLE, this.handleEnter);
    this.map.off('mouseleave', CIRCLE, this.handleLeave);
  }

  private run(camera: maplibregl.JumpToOptions): Promise<void> {
    const token = ++this.flight;
    this.map.stop();
    this.opts.onCameraState('flying');
    return new Promise<void>((resolve) => {
      const done = () => {
        this.map.off('moveend', done);
        clearTimeout(timer);
        if (token === this.flight) this.opts.onCameraState('idle');
        resolve();
      };
      const timer = setTimeout(done, FLIGHT_TIMEOUT_MS);
      this.map.on('moveend', done);
      if (this.opts.reducedMotion()) this.map.jumpTo(camera);
      else this.map.flyTo({ ...camera, speed: 0.6, curve: 1.42, essential: true });
    });
  }

  private setState(
    prev: number | null,
    id: string | null,
    key: 'selected' | 'hover',
  ): number | null {
    if (!this.map.getSource(SOURCE)) return null;
    if (prev !== null) this.map.setFeatureState({ source: SOURCE, id: prev }, { [key]: false });
    const next = id === null ? undefined : this.indexById.get(id);
    if (next === undefined) return null;
    this.map.setFeatureState({ source: SOURCE, id: next }, { [key]: true });
    return next;
  }

  private handleClick = (e: maplibregl.MapLayerMouseEvent) => {
    const code = e.features?.[0]?.properties?.code;
    if (typeof code !== 'string' || !this.indexById.has(code)) return;
    for (const cb of this.clickListeners) cb(code);
  };

  private handleEnter = () => {
    this.map.getCanvas().style.cursor = 'pointer';
  };

  private handleLeave = () => {
    this.map.getCanvas().style.cursor = '';
  };
}
