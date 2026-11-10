// Nation markers: one GeoJSON source and five layers (docs/contracts.md "Camera & markers"): a ground shadow,
// the selection ring, the pin, a specular highlight that makes it read as a sphere, and the label.
// The layer specs and GeoJSON builder are pure (unit-tested); MarkersLayer wires them onto a map.

import type { FeatureCollection, Point } from 'geojson';
import type * as maplibregl from 'maplibre-gl';
import type { Nation } from '../../types/nation';
import { LAYER_LABELS_FIRST } from '../style/ids';

export const SOURCE_NATIONS = 'nations';
export const LAYER_NATIONS_CIRCLE = 'nations-circle';
export const LAYER_NATIONS_RING = 'nations-selected-ring';
export const LAYER_NATIONS_LABEL = 'nations-label';
export const LAYER_NATIONS_SHADOW = 'nations-shadow';
export const LAYER_NATIONS_HIGHLIGHT = 'nations-highlight';
/** Bottom to top. The ring sits under the circle so it reads as a halo. Only the circle takes pointer input. */
export const NATIONS_LAYER_IDS = [
  LAYER_NATIONS_SHADOW,
  LAYER_NATIONS_RING,
  LAYER_NATIONS_CIRCLE,
  LAYER_NATIONS_HIGHLIGHT,
  LAYER_NATIONS_LABEL,
];

/** Aboriginal flag colours (see src/index.css): yellow pins, red selection ring, black outlines. */
export const MARKER_COLORS = {
  fill: '#ffc72c', // flag yellow
  fillHover: '#ffd75e',
  stroke: '#7a5200', // deep gold rim: reads as the shaded edge of a sphere
  selectedStroke: '#000000',
  ring: '#e03c31', // flag red
  highlight: '#ffffff',
  shadow: '#000000',
  labelText: '#ffffff',
  labelHalo: '#000000',
} as const;

/** Circle radius 4 px at z3 → 8 px at z10 (linear, clamped outside). */
const RADIUS_STOPS: [number, number][] = [
  [3, 4],
  [10, 8],
];

/** `circle-translate` growing with the pin: `[dx, dy]` per px of radius at each radius stop. */
function translateExpression(
  dx: number,
  dy: number,
): maplibregl.PropertyValueSpecification<[number, number]> {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...RADIUS_STOPS.flatMap(([z, r]) => [z, ['literal', [dx * r, dy * r]]]),
  ] as unknown as maplibregl.PropertyValueSpecification<[number, number]>;
}

/** `circle-radius` as a fraction of the pin's radius. */
function scaledRadius(k: number): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...RADIUS_STOPS.flatMap(([z, r]) => [z, r * k]),
  ] as maplibregl.ExpressionSpecification;
}
export const LABEL_MIN_ZOOM = 6.5;
export const PULSE_MS = 1200;
/** Ring offset (px beyond the circle radius) when the pulse has settled. */
export const RING_REST_OFFSET = 5;
export const DEFAULT_TEXT_FONT = ['Noto Sans Regular'];

export interface NationFeatureProps {
  idx: number;
  code: string;
  name: string;
}

export type NationsGeoJSON = FeatureCollection<Point, NationFeatureProps>;

/** Feature `id` comes from `promoteId: 'idx'`; `code` is Nation.id. */
export function nationsToGeoJSON(nations: readonly Nation[]): NationsGeoJSON {
  return {
    type: 'FeatureCollection',
    features: nations.map((n, idx) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: { idx, code: n.id, name: n.name },
    })),
  };
}

/** `circle-radius` expression: the zoom ramp plus `offset` px. */
export function radiusExpression(offset = 0): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...RADIUS_STOPS.flatMap(([z, r]) => [z, r + offset]),
  ] as maplibregl.ExpressionSpecification;
}

const hovered: maplibregl.ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const selected: maplibregl.ExpressionSpecification = [
  'boolean',
  ['feature-state', 'selected'],
  false,
];

/** Filter that shows the ring only for `code` (nothing for null). */
export function ringFilter(code: string | null): maplibregl.FilterSpecification {
  return ['==', ['get', 'code'], code ?? ''];
}

export interface MarkerLayerOptions {
  /** Insert all three layers before this layer if it exists in the style. */
  beforeId?: string;
  /** Omit the label layer (a style without `glyphs` cannot render text). */
  withLabels?: boolean;
  textFont?: string[];
}

/**
 * Layer specs, bottom to top.
 *
 * `circle-pitch-alignment: 'viewport'` (MapLibre's default, stated explicitly): markers stay round discs facing the
 * camera at pitch 60–75 instead of flattening into ellipses on the ground; MapLibre places them at terrain
 * elevation either way. See docs/camera.md "Markers on terrain".
 */
export function markerLayerSpecs(opts: MarkerLayerOptions = {}): maplibregl.LayerSpecification[] {
  const layers: maplibregl.LayerSpecification[] = [
    {
      // Soft shadow lying on the ground, offset down-right: it flattens into an ellipse as the map tilts,
      // which is what makes the pins read as objects standing on the terrain.
      id: LAYER_NATIONS_SHADOW,
      type: 'circle',
      source: SOURCE_NATIONS,
      paint: {
        'circle-radius': scaledRadius(1.15),
        'circle-color': MARKER_COLORS.shadow,
        'circle-opacity': 0.35,
        'circle-blur': 0.7,
        'circle-translate': translateExpression(0.35, 0.5),
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'viewport',
      },
    },
    {
      id: LAYER_NATIONS_RING,
      type: 'circle',
      source: SOURCE_NATIONS,
      filter: ringFilter(null),
      paint: {
        'circle-radius': radiusExpression(RING_REST_OFFSET),
        'circle-radius-transition': { duration: 0, delay: 0 },
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': MARKER_COLORS.ring,
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': 0.9,
        'circle-stroke-opacity-transition': { duration: 0, delay: 0 },
        'circle-pitch-alignment': 'viewport',
        'circle-pitch-scale': 'viewport',
      },
    },
    {
      id: LAYER_NATIONS_CIRCLE,
      type: 'circle',
      source: SOURCE_NATIONS,
      paint: {
        'circle-radius': radiusExpression(0),
        'circle-color': ['case', hovered, MARKER_COLORS.fillHover, MARKER_COLORS.fill],
        'circle-opacity': 1,
        'circle-stroke-color': [
          'case',
          selected,
          MARKER_COLORS.selectedStroke,
          MARKER_COLORS.stroke,
        ],
        'circle-stroke-width': ['case', selected, 2, 1],
        'circle-pitch-alignment': 'viewport',
        'circle-pitch-scale': 'viewport',
      },
    },
    {
      // Specular highlight up and to the left of centre: turns the flat disc into a lit sphere.
      id: LAYER_NATIONS_HIGHLIGHT,
      type: 'circle',
      source: SOURCE_NATIONS,
      paint: {
        'circle-radius': scaledRadius(0.45),
        'circle-color': MARKER_COLORS.highlight,
        'circle-opacity': 0.85,
        'circle-blur': 0.9,
        'circle-translate': translateExpression(-0.3, -0.32),
        'circle-pitch-alignment': 'viewport',
        'circle-pitch-scale': 'viewport',
      },
    },
  ];
  if (opts.withLabels !== false) {
    layers.push({
      id: LAYER_NATIONS_LABEL,
      type: 'symbol',
      source: SOURCE_NATIONS,
      minzoom: LABEL_MIN_ZOOM,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': opts.textFont ?? DEFAULT_TEXT_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6.5, 12, 12, 15],
        'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-max-width': 9,
        'text-allow-overlap': false,
        'text-padding': 4,
        'text-pitch-alignment': 'viewport',
      },
      paint: {
        'text-color': MARKER_COLORS.labelText,
        'text-halo-color': MARKER_COLORS.labelHalo,
        'text-halo-width': 1.6,
        'text-halo-blur': 0.4,
      },
    });
  }
  return layers;
}

/** Hit tolerance around the pointer: markers are 4–8 px, too small to hit exactly. */
const HIT_PX = 8;
/** Above this pitch, a miss in queryRenderedFeatures falls back to projecting the points (see projectedHit). */
const PROJECTED_HIT_MIN_PITCH = 60;

/**
 * Owns the `nations` source and `nations-*` layers on a map. Works before or after `load`, and re-installs itself if
 * the style is replaced.
 */
export class MarkersLayer {
  private readonly map: maplibregl.Map;
  private readonly opts: MarkerLayerOptions;
  private nations: readonly Nation[] = [];
  private idxByCode = new Map<string, number>();
  private selectedCode: string | null = null;
  private hoveredCode: string | null = null;
  private pointerHoverCode: string | null = null;
  private clickCbs = new Set<(code: string) => void>();
  private hoverCbs = new Set<(code: string | null) => void>();
  private pulseFrame: number | null = null;
  private installed = false;
  private destroyed = false;

  constructor(map: maplibregl.Map, opts: MarkerLayerOptions = {}) {
    this.map = map;
    this.opts = opts;
    map.on('style.load', this.onStyleLoad);
    map.on('click', this.handleClick);
    map.on('mousemove', this.onMouseMove);
    map.getCanvasContainer().addEventListener('mouseleave', this.onMouseLeave);
    this.tryInstall();
  }

  setNations(nations: readonly Nation[]): void {
    this.nations = nations;
    this.idxByCode = new Map(nations.map((n, i) => [n.id, i]));
    this.hoveredCode = this.pointerHoverCode = null;
    if (!this.installed) {
      this.tryInstall();
      return;
    }
    const src = this.map.getSource<maplibregl.GeoJSONSource>(SOURCE_NATIONS);
    src?.setData(nationsToGeoJSON(nations));
    this.map.removeFeatureState({ source: SOURCE_NATIONS });
    this.applySelected(this.selectedCode, null);
  }

  setSelected(code: string | null): void {
    const prev = this.selectedCode;
    this.selectedCode = code;
    if (this.installed && prev !== code) this.applySelected(code, prev);
  }

  setHovered(code: string | null): void {
    const prev = this.hoveredCode;
    this.hoveredCode = code;
    if (!this.installed || prev === code) return;
    this.setState(prev, { hover: false });
    this.setState(code, { hover: true });
  }

  /** Pulses the selected ring for PULSE_MS, then leaves it at rest. */
  pulse(): void {
    this.stopPulse();
    if (!this.installed || this.selectedCode === null) return;
    const start = performance.now();
    const frame = (now: number) => {
      if (this.destroyed || !this.map.getLayer(LAYER_NATIONS_RING)) return;
      const t = Math.min(1, (now - start) / PULSE_MS);
      // Two expanding, fading rings, then ease into the resting ring.
      const phase = (t * 2) % 1;
      const settling = t >= 1;
      const offset = settling ? RING_REST_OFFSET : 2 + phase * 14;
      const opacity = settling ? 0.9 : 1 - phase * 0.85;
      this.map.setPaintProperty(LAYER_NATIONS_RING, 'circle-radius', radiusExpression(offset));
      this.map.setPaintProperty(LAYER_NATIONS_RING, 'circle-stroke-opacity', opacity);
      this.pulseFrame = settling ? null : requestAnimationFrame(frame);
    };
    this.pulseFrame = requestAnimationFrame(frame);
  }

  onClick(cb: (code: string) => void): () => void {
    this.clickCbs.add(cb);
    return () => this.clickCbs.delete(cb);
  }

  onHover(cb: (code: string | null) => void): () => void {
    this.hoverCbs.add(cb);
    return () => this.hoverCbs.delete(cb);
  }

  destroy(): void {
    this.destroyed = true;
    this.stopPulse();
    this.map.off('style.load', this.onStyleLoad);
    this.map.off('click', this.handleClick);
    this.map.off('mousemove', this.onMouseMove);
    this.map.getCanvasContainer().removeEventListener('mouseleave', this.onMouseLeave);
    this.clickCbs.clear();
    this.hoverCbs.clear();
    if (this.installed && this.map.style) {
      for (const id of NATIONS_LAYER_IDS) if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource(SOURCE_NATIONS)) this.map.removeSource(SOURCE_NATIONS);
    }
    this.installed = false;
  }

  // --- internals ---------------------------------------------------------------------------------

  private tryInstall(): void {
    if (this.destroyed) return;
    try {
      this.install();
    } catch (err) {
      // "Style is not done loading": 'style.load' will call us again.
      if (!/not done loading/i.test(String(err))) throw err;
    }
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE_NATIONS)) {
      map.addSource(SOURCE_NATIONS, {
        type: 'geojson',
        data: nationsToGeoJSON(this.nations),
        promoteId: 'idx',
      });
    }
    const beforeId = this.opts.beforeId ?? LAYER_LABELS_FIRST;
    const before = map.getLayer(beforeId) ? beforeId : undefined;
    const hasGlyphs = Boolean(map.getStyle().glyphs);
    if (!hasGlyphs && this.opts.withLabels !== false) {
      console.warn('[markers] style has no glyphs; nations-label layer skipped');
    }
    for (const spec of markerLayerSpecs({
      ...this.opts,
      withLabels: hasGlyphs && this.opts.withLabels !== false,
    })) {
      if (!map.getLayer(spec.id)) map.addLayer(spec, before);
    }
    this.installed = true;
    this.applySelected(this.selectedCode, null);
    this.setState(this.hoveredCode, { hover: true });
  }

  private readonly onStyleLoad = () => {
    // A new style drops our source and layers (WS1 promises not to setStyle, but be safe).
    if (!this.map.getSource(SOURCE_NATIONS)) {
      this.installed = false;
      this.tryInstall();
    }
  };

  private applySelected(code: string | null, prev: string | null): void {
    this.setState(prev, { selected: false });
    this.setState(code, { selected: true });
    if (this.map.getLayer(LAYER_NATIONS_RING)) {
      this.map.setFilter(LAYER_NATIONS_RING, ringFilter(code));
    }
  }

  private setState(code: string | null, state: Record<string, boolean>): void {
    if (code === null) return;
    const idx = this.idxByCode.get(code);
    if (idx === undefined) return;
    this.map.setFeatureState({ source: SOURCE_NATIONS, id: idx }, state);
  }

  private stopPulse(): void {
    if (this.pulseFrame !== null) cancelAnimationFrame(this.pulseFrame);
    this.pulseFrame = null;
  }

  /** Nearest marker within HIT_PX of a screen point. */
  private hit(point: maplibregl.Point): string | null {
    if (!this.installed || !this.map.getLayer(LAYER_NATIONS_CIRCLE)) return null;
    const features = this.map.queryRenderedFeatures(
      [
        [point.x - HIT_PX, point.y - HIT_PX],
        [point.x + HIT_PX, point.y + HIT_PX],
      ],
      { layers: [LAYER_NATIONS_CIRCLE] },
    );
    let best: string | null = null;
    let bestD = Infinity;
    for (const f of features) {
      const code = (f.properties as Partial<NationFeatureProps>).code;
      if (typeof code !== 'string' || f.geometry.type !== 'Point') continue;
      const p = this.map.project(f.geometry.coordinates as [number, number]);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestD) {
        bestD = d;
        best = code;
      }
    }
    if (best !== null || this.map.getPitch() <= PROJECTED_HIT_MIN_PITCH) return best;
    return this.projectedHit(point);
  }

  /**
   * Fallback hit test by projecting every nation. MapLibre 6.17's queryRenderedFeatures returns no circle features
   * at all above ~70° pitch (measured with and without terrain, docs/camera.md), although the circles are drawn.
   * Ignores terrain occlusion, which is acceptable for a fallback.
   */
  private projectedHit(point: maplibregl.Point): string | null {
    const canvas = this.map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    let best: string | null = null;
    let bestD = HIT_PX;
    for (const n of this.nations) {
      const p = this.map.project([n.lng, n.lat]);
      if (!Number.isFinite(p.x) || p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d <= bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  private readonly handleClick = (e: maplibregl.MapMouseEvent) => {
    const code = this.hit(e.point);
    if (code === null) return;
    for (const cb of this.clickCbs) cb(code);
  };

  private readonly onMouseMove = (e: maplibregl.MapMouseEvent) => {
    this.updatePointerHover(this.hit(e.point));
  };

  private readonly onMouseLeave = () => this.updatePointerHover(null);

  private updatePointerHover(code: string | null): void {
    if (code === this.pointerHoverCode) return;
    this.pointerHoverCode = code;
    this.map.getCanvas().style.cursor = code ? 'pointer' : '';
    this.setHovered(code);
    for (const cb of this.hoverCbs) cb(code);
  }
}
