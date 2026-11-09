import type {
  LayerSpecification,
  Map as MlMap,
  SourceSpecification,
  StyleSpecification,
  TerrainSpecification,
} from 'maplibre-gl';

type Listener = (ev: Record<string, unknown>) => void;

/**
 * Just enough of maplibregl.Map, backed by a style JSON, to unit-test applyStyleOptions and the DEM
 * fallback in Node without WebGL. Records every mutating call in `calls`.
 */
export class FakeMap {
  style: StyleSpecification | null = null;
  terrain: TerrainSpecification | null = null;
  moving = false;
  tilesLoaded = true;
  calls: string[] = [];
  _listeners: Record<string, Listener[]> = {};
  _oneTimeListeners: Record<string, Listener[]> = {};

  constructor(style?: StyleSpecification) {
    if (style) this.loadStyle(style);
  }

  /** Simulates the style JSON finishing parsing (fires `style.load`). */
  loadStyle(style: StyleSpecification): void {
    this.style = structuredClone(style);
    this.terrain = this.style.terrain ? { ...this.style.terrain } : null;
    this.fire('style.load');
  }

  asMap(): MlMap {
    return this as unknown as MlMap;
  }

  // ---- events ----
  on(type: string, l: Listener) {
    (this._listeners[type] ??= []).push(l);
    return this;
  }
  once(type: string, l: Listener) {
    (this._oneTimeListeners[type] ??= []).push(l);
    return this;
  }
  off(type: string, l: Listener) {
    for (const bag of [this._listeners, this._oneTimeListeners]) {
      bag[type] = (bag[type] ?? []).filter((x) => x !== l);
    }
    return this;
  }
  fire(type: string, props: Record<string, unknown> = {}) {
    const ev = { type, target: this, ...props };
    for (const l of [...(this._listeners[type] ?? [])]) l(ev);
    const once = this._oneTimeListeners[type] ?? [];
    this._oneTimeListeners[type] = [];
    for (const l of once) l(ev);
    return this;
  }

  // ---- state ----
  isMoving() {
    return this.moving;
  }
  loaded() {
    return this.style !== null && this.tilesLoaded;
  }
  private need(): StyleSpecification {
    if (!this.style) throw new Error('Style is not done loading');
    return this.style;
  }
  getStyle(): StyleSpecification {
    return structuredClone({ ...this.need(), terrain: this.terrain ?? undefined });
  }
  getLayer(id: string) {
    if (!this.style) return undefined;
    return this.style.layers.find((l) => l.id === id);
  }
  getLayoutProperty(id: string, prop: string) {
    return (this.getLayer(id) as { layout?: Record<string, unknown> } | undefined)?.layout?.[prop];
  }
  setLayoutProperty(id: string, prop: string, value: unknown) {
    this.calls.push(`layout ${id} ${prop}=${String(value)}`);
    const l = this.getLayer(id) as { layout?: Record<string, unknown> };
    l.layout = { ...l.layout, [prop]: value };
    return this;
  }
  getPaintProperty(id: string, prop: string) {
    return (this.getLayer(id) as { paint?: Record<string, unknown> } | undefined)?.paint?.[prop];
  }
  setPaintProperty(id: string, prop: string, value: unknown) {
    this.calls.push(`paint ${id} ${prop}=${String(value)}`);
    const l = this.getLayer(id) as { paint?: Record<string, unknown> };
    l.paint = { ...l.paint, [prop]: value };
    return this;
  }
  getTerrain() {
    return this.terrain ? { ...this.terrain } : null;
  }
  setTerrain(t: TerrainSpecification | null) {
    this.calls.push(t ? `terrain ${t.source} x${t.exaggeration}` : 'terrain off');
    this.terrain = t ? { ...t } : null;
    return this;
  }
  getSource(id: string) {
    return this.style?.sources[id];
  }
  addSource(id: string, src: SourceSpecification) {
    const s = this.need();
    if (s.sources[id]) throw new Error(`Source "${id}" already exists.`);
    this.calls.push(`addSource ${id}`);
    s.sources[id] = structuredClone(src);
    return this;
  }
  removeSource(id: string) {
    const s = this.need();
    if (s.layers.some((l) => 'source' in l && l.source === id)) {
      throw new Error(`Source "${id}" cannot be removed while a layer is using it.`);
    }
    if (this.terrain?.source === id) throw new Error('terrain still uses source');
    this.calls.push(`removeSource ${id}`);
    delete s.sources[id];
    return this;
  }
  addLayer(layer: LayerSpecification, beforeId?: string) {
    const s = this.need();
    if (beforeId !== undefined && !s.layers.some((l) => l.id === beforeId)) {
      throw new Error(`Cannot add layer before non-existing layer "${beforeId}".`);
    }
    this.calls.push(`addLayer ${layer.id}${beforeId ? ` before ${beforeId}` : ''}`);
    const i =
      beforeId === undefined ? s.layers.length : s.layers.findIndex((l) => l.id === beforeId);
    s.layers.splice(i, 0, structuredClone(layer));
    return this;
  }
  removeLayer(id: string) {
    const s = this.need();
    this.calls.push(`removeLayer ${id}`);
    s.layers = s.layers.filter((l) => l.id !== id);
    return this;
  }
  setStyle() {
    throw new Error('setStyle must never be called after load');
  }
  layerIds(): string[] {
    return this.need().layers.map((l) => l.id);
  }
}
