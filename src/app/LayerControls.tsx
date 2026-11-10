import { useId, useState } from 'react';
import {
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  useAppStore,
  type AppState,
} from '../store/useAppStore';
import { LAYER_KEYS } from './UrlSync';

const LABELS: Record<keyof AppState['layers'], string> = {
  imagery: 'Imagery',
  labels: 'Labels',
  hillshade: 'Hillshade',
  relief: 'Relief',
};

const startOpen = () =>
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(min-width: 900px)').matches;

/** Compact, collapsible map controls (top-right): layer toggles, exaggeration, overview. */
export function LayerControls({ onOverview }: { onOverview: () => void }) {
  const layers = useAppStore((s) => s.layers);
  const exaggeration = useAppStore((s) => s.exaggeration);
  const { toggleLayer, setExaggeration } = useAppStore.getState();
  const [open, setOpen] = useState(startOpen);
  const bodyId = useId();
  const sliderId = useId();

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
        <button type="button" className="btn" onClick={onOverview}>
          Overview
        </button>
      </div>
    </div>
  );
}
