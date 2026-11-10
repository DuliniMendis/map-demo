import { useId, useState } from 'react';
import { formatSunHour, setSunLocationHint } from '../map/style/lighting';
import {
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  SUN_HOUR_MAX,
  SUN_HOUR_MIN,
  useAppStore,
  type AppState,
} from '../store/useAppStore';
import { LAYER_KEYS } from './UrlSync';

const LABELS: Record<keyof AppState['layers'], string> = {
  imagery: 'Imagery',
  labels: 'Labels',
  hillshade: 'Hillshade',
  relief: 'Relief',
  contours: 'Contours',
};

const startOpen = () =>
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(min-width: 900px)').matches;

/** Where the slider rests while the default (fixed) light is on. */
const SUN_SLIDER_IDLE = 12;

/** Slider → store. The light is computed for the selected nation, else the map centre (lighting.ts). */
function onSunInput(hour: number) {
  const { selectedId, nations, setSunHour } = useAppStore.getState();
  const selected = selectedId === null ? null : nations.find((n) => n.id === selectedId);
  setSunLocationHint(selected ? { lng: selected.lng, lat: selected.lat } : null);
  setSunHour(hour);
}

/**
 * Compact, collapsible map controls (top-right): layer toggles, exaggeration, time-of-day light,
 * overview.
 */
export function LayerControls({ onOverview }: { onOverview: () => void }) {
  const layers = useAppStore((s) => s.layers);
  const exaggeration = useAppStore((s) => s.exaggeration);
  const sunHour = useAppStore((s) => s.sunHour);
  const { toggleLayer, setExaggeration, setSunHour } = useAppStore.getState();
  const [open, setOpen] = useState(startOpen);
  const bodyId = useId();
  const sliderId = useId();
  const sunId = useId();
  const sunText = sunHour === null ? 'Default light' : formatSunHour(sunHour);

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
          {LAYER_KEYS.map((k) => (
            <label key={k} className="layer-controls__row">
              <input
                type="checkbox"
                checked={layers[k]}
                onChange={() => toggleLayer(k)}
                data-testid={`layer-toggle-${k}`}
              />
              {LABELS[k]}
            </label>
          ))}
        </fieldset>
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
          data-testid="exaggeration-slider"
        />
        <label htmlFor={sunId} className="layer-controls__slider-label">
          Light (sun time) <output>{sunHour === null ? 'Default' : sunText}</output>
        </label>
        <input
          id={sunId}
          type="range"
          min={SUN_HOUR_MIN}
          max={SUN_HOUR_MAX}
          step={0.25}
          value={sunHour ?? SUN_SLIDER_IDLE}
          aria-valuetext={sunText}
          onChange={(e) => onSunInput(Number(e.target.value))}
          data-testid="sun-slider"
        />
        <button
          type="button"
          className="btn"
          onClick={() => setSunHour(null)}
          disabled={sunHour === null}
          data-testid="sun-reset"
        >
          Default light
        </button>
        <button type="button" className="btn" onClick={onOverview}>
          Overview
        </button>
      </div>
    </div>
  );
}
