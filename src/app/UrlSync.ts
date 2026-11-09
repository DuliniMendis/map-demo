// URL state per docs/contracts.md: `?n=<Nation.id>`, `?l=imagery,labels` (enabled layers; omitted =
// defaults), `?x=1.5` (exaggeration; omitted = default). Read once on boot; written back with
// `history.replaceState`, debounced 300 ms. Unknown params are preserved.
import {
  DEFAULT_LAYERS,
  EXAGGERATION_DEFAULT,
  clampExaggeration,
  type AppState,
  type useAppStore,
} from '../store/useAppStore';
import type { Nation } from '../types/nation';

type Layers = AppState['layers'];
type LayerKey = keyof Layers;

export const LAYER_KEYS: readonly LayerKey[] = [
  'imagery',
  'labels',
  'hillshade',
  'relief',
  'contours',
];
export const URL_WRITE_DEBOUNCE_MS = 300;

export interface UrlState {
  /** Requested nation id; validity is checked against the loaded nations later. */
  n: string | null;
  /** Enabled layers, or null when `?l` is absent or names no known layer. */
  layers: Layers | null;
  /** Clamped exaggeration, or null when `?x` is absent or not a number. */
  exaggeration: number | null;
}

export interface UrlWritable {
  selectedId: string | null;
  layers: Layers;
  exaggeration: number;
}

/** Pure: parse a `location.search` string. */
export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);

  const n = p.get('n')?.trim() || null;

  let layers: Layers | null = null;
  const l = p.get('l');
  if (l !== null) {
    const names = l
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const known = names.filter((s): s is LayerKey => (LAYER_KEYS as string[]).includes(s));
    // `?l=` (empty) means "all layers off"; a list of only unknown names is ignored.
    if (names.length === 0 || known.length > 0) {
      layers = { imagery: false, labels: false, hillshade: false, relief: false, contours: false };
      for (const k of known) layers[k] = true;
    }
  }

  let exaggeration: number | null = null;
  const x = p.get('x');
  if (x !== null && x.trim() !== '' && Number.isFinite(Number(x))) {
    exaggeration = clampExaggeration(Number(x));
  }

  return { n, layers, exaggeration };
}

const sameLayers = (a: Layers, b: Layers) => LAYER_KEYS.every((k) => a[k] === b[k]);
const roundX = (x: number) => Math.round(x * 10) / 10;

/**
 * Pure: the `search` string (with leading `?`, or '' when empty) for `state`, keeping any params
 * other than n/l/x from `currentSearch`. Defaults are omitted so a fresh view has a clean URL.
 */
export function serialiseUrlState(state: UrlWritable, currentSearch = ''): string {
  const p = new URLSearchParams(currentSearch);
  p.delete('n');
  p.delete('l');
  p.delete('x');
  if (state.selectedId) p.set('n', state.selectedId);
  if (!sameLayers(state.layers, DEFAULT_LAYERS)) {
    p.set('l', LAYER_KEYS.filter((k) => state.layers[k]).join(','));
  }
  if (roundX(state.exaggeration) !== roundX(EXAGGERATION_DEFAULT)) {
    p.set('x', String(roundX(state.exaggeration)));
  }
  const s = p.toString().replace(/%2C/gi, ',');
  return s ? `?${s}` : '';
}

/** Pure: the id to select on boot, or null if the URL's id is not a loaded nation. */
export function resolveBootSelection(n: string | null, nations: readonly Nation[]): string | null {
  if (!n) return null;
  return nations.some((nation) => nation.id === n) ? n : null;
}

type Store = Pick<typeof useAppStore, 'getState' | 'setState' | 'subscribe'>;

/**
 * Boot step 1 (before the map is created, so the first style already reflects the URL): apply
 * `?l` and `?x` to the store. Returns the requested nation id, which the caller selects once
 * nations have loaded (via `resolveBootSelection`).
 */
export function applyUrlToStore(store: Store, search: string): string | null {
  const url = parseUrlState(search);
  const patch: Partial<UrlWritable> = {};
  if (url.layers) patch.layers = url.layers;
  if (url.exaggeration !== null) patch.exaggeration = url.exaggeration;
  if (Object.keys(patch).length) store.setState(patch);
  return url.n;
}

/**
 * Boot step 3 (after the deep-linked selection, if any, has been resolved): mirror store changes
 * into the URL. Starting earlier would drop `?n=` before nations load. Returns a stop function.
 */
export function startUrlWriter(
  store: Store,
  win: Pick<Window, 'location' | 'history' | 'setTimeout' | 'clearTimeout'> = window,
  delay = URL_WRITE_DEBOUNCE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    timer = undefined;
    const { pathname, search, hash } = win.location;
    const next = serialiseUrlState(store.getState(), search);
    if (next !== search) win.history.replaceState(win.history.state, '', pathname + next + hash);
  };
  const unsubscribe = store.subscribe((s, prev) => {
    if (
      s.selectedId === prev.selectedId &&
      s.layers === prev.layers &&
      s.exaggeration === prev.exaggeration
    ) {
      return;
    }
    if (timer !== undefined) win.clearTimeout(timer);
    timer = win.setTimeout(write, delay);
  });
  // Sync once now, so e.g. an unknown `?n=` is cleared after boot.
  write();
  return () => {
    unsubscribe();
    if (timer !== undefined) win.clearTimeout(timer);
  };
}
