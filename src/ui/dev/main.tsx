// DEV ONLY: `pnpm dev`, then open /src/ui/dev/dev.html (?rows=10 for just the mock nations).
// Proves the store round-trip without MapLibre: list → store → card, and "map" → store → list.
import { StrictMode, useId } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { useAppStore } from '../../store/useAppStore';
import { DISCLAIMER_STORAGE_KEY, SelectedNationCard, SidePanel } from '../index';
import { synthesiseNations } from './devData';
import './dev.css';

const params = new URLSearchParams(window.location.search);
const rows = Math.max(1, Number(params.get('rows') ?? 455) || 455);
useAppStore.getState().setNations(synthesiseNations(rows));
if (params.get('n')) useAppStore.getState().select(params.get('n'));

let flightTimer: ReturnType<typeof setTimeout> | undefined;
function simulateMapClick(id: string) {
  // What WS5's wiring does on `controller.onMarkerClick`: select, fly, idle on moveend.
  const s = useAppStore.getState();
  s.select(id);
  s.setCameraState('flying');
  clearTimeout(flightTimer);
  flightTimer = setTimeout(() => useAppStore.getState().setCameraState('idle'), 1200);
}

function DevMap() {
  const id = useId();
  const nations = useAppStore((s) => s.nations);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const query = useAppStore((s) => s.query);
  const stateFilter = useAppStore((s) => s.stateFilter);
  const cameraState = useAppStore((s) => s.cameraState);

  return (
    <main className="dev-map" aria-labelledby={`${id}-h`}>
      <div className="dev-map__tools cm-theme">
        <h1 id={`${id}-h`} className="dev-map__title">
          Map placeholder · WS4 dev page
        </h1>
        <div className="dev-map__row">
          <button
            type="button"
            className="cm-button"
            onClick={() => simulateMapClick(nations[Math.floor(Math.random() * nations.length)].id)}
          >
            Simulate map click (random)
          </button>
          <label htmlFor={`${id}-pick`} className="cm-visually-hidden">
            Simulate a map click on
          </label>
          <select
            id={`${id}-pick`}
            className="cm-input cm-select"
            value=""
            onChange={(e) => e.target.value && simulateMapClick(e.target.value)}
          >
            <option value="">Map click on…</option>
            {nations.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cm-button cm-button--quiet"
            onClick={() => useAppStore.getState().select(null)}
          >
            Clear selection
          </button>
          <button
            type="button"
            className="cm-button cm-button--quiet"
            onClick={() => {
              try {
                localStorage.removeItem(DISCLAIMER_STORAGE_KEY);
              } catch {
                /* ignore */
              }
              window.location.reload();
            }}
          >
            Reset disclaimer
          </button>
        </div>
        <dl className="dev-map__state" aria-label="Store state">
          <dt>rows</dt>
          <dd>
            {nations.length} (<a href="?rows=10">10</a> · <a href="?rows=455">455</a>)
          </dd>
          <dt>selectedId</dt>
          <dd data-testid="dev-selected-id">{selectedId ?? '—'}</dd>
          <dt>hoveredId</dt>
          <dd>{hoveredId ?? '—'}</dd>
          <dt>query</dt>
          <dd>{query ? `“${query}”` : '—'}</dd>
          <dt>stateFilter</dt>
          <dd>{stateFilter}</dd>
          <dt>cameraState</dt>
          <dd>{cameraState}</dd>
        </dl>
      </div>
      <SelectedNationCard />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="dev-shell">
      <SidePanel />
      <DevMap />
    </div>
  </StrictMode>,
);
