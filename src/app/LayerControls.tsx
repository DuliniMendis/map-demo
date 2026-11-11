import type * as maplibregl from 'maplibre-gl';
import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import { CONTOUR_MIN_ZOOM } from '../map/style/layers/contours';
import { formatSunHour, setSunLocationHint } from '../map/style/lighting';
import {
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  SUN_HOUR_MAX,
  SUN_HOUR_MIN,
  useAppStore,
  type AppState,
} from '../store/useAppStore';
import { isFlat, tiltTarget } from './controls/TiltControl';
import { LAYER_KEYS } from './UrlSync';

type LayerKey = keyof AppState['layers'];

const LABELS: Record<LayerKey, string> = {
  imagery: 'Imagery',
  labels: 'Labels',
  hillshade: 'Hillshade',
  relief: 'Relief',
  contours: 'Contours',
};

/**
 * Layers that only show once you are zoomed in: below `from` the hint offers to zoom to `to`.
 * Contours are not drawn at all below z10 (the DEM is too coarse); hillshade is drawn everywhere
 * but Australia is too flat at continent scale for it to show, so it is clear from about z6.
 */
export const ZOOM_HINTS: Partial<Record<LayerKey, { from: number; to: number }>> = {
  hillshade: { from: 6, to: 7 },
  contours: { from: CONTOUR_MIN_ZOOM, to: CONTOUR_MIN_ZOOM + 1 },
};

/** The zoom a "Zoom in to see" hint for `layer` would go to, or null when no hint is needed. */
export function zoomHintTarget(layer: LayerKey, on: boolean, zoom: number): number | null {
  const hint = ZOOM_HINTS[layer];
  return on && hint && zoom < hint.from ? hint.to : null;
}

const startOpen = () =>
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(min-width: 900px)').matches;

/** Where the slider rests while the default (fixed) light is on. */
const SUN_SLIDER_IDLE = 12;
const HINT_MOVE_MS = 1200;

/** Slider → store. The light is computed for the selected nation, else the map centre (lighting.ts). */
function onSunInput(hour: number) {
  const { selectedId, nations, setSunHour } = useAppStore.getState();
  const selected = selectedId === null ? null : nations.find((n) => n.id === selectedId);
  setSunLocationHint(selected ? { lng: selected.lng, lat: selected.lat } : null);
  setSunHour(hour);
}

export type LayerControlsMap = Pick<
  maplibregl.Map,
  'getZoom' | 'getPitch' | 'on' | 'off' | 'easeTo' | 'jumpTo'
>;

const noop = () => () => {};

/** The camera's zoom and whether it is flat, updated when a move ends (not every frame). */
function useCamera(map: LayerControlsMap | null): { zoom: number; flat: boolean } {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!map) return () => {};
      map.on('moveend', cb);
      return () => map.off('moveend', cb);
    },
    [map],
  );
  // Rounded so tiny zoom drift doesn't re-render; the thresholds are whole or half zooms.
  const zoom = useSyncExternalStore(map ? subscribe : noop, () =>
    map ? Math.round(map.getZoom() * 100) / 100 : Infinity,
  );
  const flat = useSyncExternalStore(map ? subscribe : noop, () =>
    map ? isFlat(map.getPitch()) : false,
  );
  return { zoom, flat };
}

/**
 * Compact, collapsible map controls (top-right): layer toggles, exaggeration, time-of-day light,
 * overview. Controls whose effect can't be seen from the current view say so and offer the move
 * that shows it (zoom in for contours and hillshade, tilt to 3D for exaggeration).
 */
export function LayerControls({
  onOverview,
  map = null,
}: {
  onOverview: () => void;
  map?: LayerControlsMap | null;
}) {
  const layers = useAppStore((s) => s.layers);
  const exaggeration = useAppStore((s) => s.exaggeration);
  const sunHour = useAppStore((s) => s.sunHour);
  const flying = useAppStore((s) => s.cameraState === 'flying');
  const { toggleLayer, setExaggeration, setSunHour } = useAppStore.getState();
  const [open, setOpen] = useState(startOpen);
  const { zoom, flat } = useCamera(map);
  const bodyId = useId();
  const sliderId = useId();
  const sunId = useId();
  const sunNoteId = useId();
  const tiltNoteId = useId();
  const sunText = sunHour === null ? 'Default light' : formatSunHour(sunHour);
  const sunOff = !layers.hillshade;

  const move = (to: { zoom?: number; pitch?: number; bearing?: number }) => {
    if (!map) return;
    if (useAppStore.getState().reducedMotion) map.jumpTo(to);
    else map.easeTo({ ...to, duration: HINT_MOVE_MS });
  };

  return (
    <div className="layer-controls overlay-panel">
      <button
        type="button"
        className="layer-controls__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        Layers <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id={bodyId} className="layer-controls__body" hidden={!open}>
        <fieldset>
          <legend className="visually-hidden">Map layers</legend>
          {LAYER_KEYS.map((k) => {
            const target = map ? zoomHintTarget(k, layers[k], zoom) : null;
            return (
              <div key={k} className="layer-controls__item">
                <label className="layer-controls__row">
                  <input
                    type="checkbox"
                    checked={layers[k]}
                    onChange={() => toggleLayer(k)}
                    data-testid={`layer-toggle-${k}`}
                  />
                  {LABELS[k]}
                </label>
                {target !== null && (
                  <button
                    type="button"
                    className="layer-controls__hint"
                    disabled={flying}
                    onClick={() => move({ zoom: target })}
                    aria-label={`Zoom in to see ${LABELS[k].toLowerCase()}`}
                    data-testid={`layer-hint-${k}`}
                  >
                    Zoom in to see
                  </button>
                )}
              </div>
            );
          })}
        </fieldset>
        <div className="layer-controls__section">
          <label htmlFor={sliderId} className="layer-controls__slider-label">
            Terrain exaggeration <output>{exaggeration.toFixed(1)}×</output>
          </label>
          <input
            id={sliderId}
            type="range"
            min={EXAGGERATION_MIN}
            max={EXAGGERATION_MAX}
            step={0.1}
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
            aria-describedby={map && flat ? tiltNoteId : undefined}
            data-testid="exaggeration-slider"
          />
          {map && flat && (
            <p id={tiltNoteId} className="layer-controls__note">
              Height only shows in 3D.{' '}
              <button
                type="button"
                className="layer-controls__hint"
                disabled={flying}
                onClick={() => move(tiltTarget('3d'))}
                data-testid="exaggeration-hint"
              >
                Tilt to 3D
              </button>
            </p>
          )}
        </div>
        <div className="layer-controls__section">
          <label htmlFor={sunId} className="layer-controls__slider-label">
            Hillshade light <output>{sunHour === null ? 'Default' : sunText}</output>
          </label>
          <input
            id={sunId}
            type="range"
            min={SUN_HOUR_MIN}
            max={SUN_HOUR_MAX}
            step={0.25}
            value={sunHour ?? SUN_SLIDER_IDLE}
            aria-valuetext={sunText}
            disabled={sunOff}
            aria-describedby={sunOff ? sunNoteId : undefined}
            onChange={(e) => onSunInput(Number(e.target.value))}
            data-testid="sun-slider"
          />
          {sunOff ? (
            <p id={sunNoteId} className="layer-controls__note">
              Sets the sun for the hillshade. Turn Hillshade on to use it.
            </p>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setSunHour(null)}
              disabled={sunHour === null}
              data-testid="sun-reset"
            >
              Default light
            </button>
          )}
        </div>
        <button type="button" className="btn" onClick={onOverview}>
          Overview
        </button>
      </div>
    </div>
  );
}
