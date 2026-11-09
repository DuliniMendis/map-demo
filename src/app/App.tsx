import { useCallback, useEffect, useRef, useState } from 'react';
import { loadNations } from '../data/loadNations';
import { MapView } from '../map/MapView';
import { useAppStore } from '../store/useAppStore';
import { About } from './About';
import { Attribution } from './Attribution';
import { DEFAULT_ATTRIBUTION, loadAttribution, type AttributionEntry } from './attributionData';
import { Disclaimer, InfoCard, SidePanel, type MapController } from './integration';
import { LayerControls } from './LayerControls';
import { ListSkeleton, LoadError, Toast } from './LoadStates';
import { resolveBootSelection, startUrlWriter } from './UrlSync';
import { goToOverview } from './wiring';
import './app.css';

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const TOAST_MS = 6000;

export interface AppProps {
  /** `?n=` from the URL at boot (see main.tsx); selected once nations load, if it exists. */
  bootNationId?: string | null;
}

export function App({ bootNationId = null }: AppProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [attribution, setAttribution] = useState<AttributionEntry[]>(DEFAULT_ATTRIBUTION);
  const [controller, setController] = useState<MapController | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bootId = useRef(bootNationId);

  const selected = useAppStore((s) =>
    s.selectedId === null ? null : (s.nations.find((n) => n.id === s.selectedId) ?? null),
  );
  const cameraState = useAppStore((s) => s.cameraState);

  // Boot step 2: load nations, then apply the deep-linked selection (unknown id → overview).
  useEffect(() => {
    let cancelled = false;
    loadNations()
      .then((file) => {
        if (cancelled) return;
        const store = useAppStore.getState();
        store.setNations(file.nations);
        const id = resolveBootSelection(bootId.current, file.nations);
        bootId.current = null;
        if (id) store.select(id);
        setLoad({ kind: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Boot step 3: only once nations are in, mirror state into the URL (keeps ?n= until then).
  useEffect(() => {
    if (load.kind !== 'ready') return;
    return startUrlWriter(useAppStore);
  }, [load.kind]);

  useEffect(() => {
    let cancelled = false;
    void loadAttribution().then((entries) => {
      if (!cancelled) setAttribution(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const retry = useCallback(() => {
    setLoad({ kind: 'loading' });
    setAttempt((a) => a + 1);
  }, []);
  const onDemFallback = useCallback(() => setToast('Using backup terrain'), []);
  const onMapUnavailable = useCallback(() => setMapUnavailable(true), []);
  // The card shows once the camera has arrived; before the map is ready (or with no map) only
  // the selection matters.
  const showCard =
    selected !== null && cameraState === 'idle' && (controller !== null || mapUnavailable);
  const onOverview = useCallback(() => goToOverview(controller, useAppStore), [controller]);
  const closeCard = useCallback(() => useAppStore.getState().select(null), []);

  return (
    <div className="app">
      <aside className="app__side" aria-label="Nations & language groups">
        {load.kind === 'ready' && <SidePanel />}
        {load.kind === 'loading' && <ListSkeleton />}
        {load.kind === 'error' && <LoadError message={load.message} onRetry={retry} />}
      </aside>

      <main className="app__main">
        <MapView
          onController={setController}
          onDemFallback={onDemFallback}
          onUnavailable={onMapUnavailable}
        />

        <div className="app__top-left">
          <button
            type="button"
            className="btn overlay-panel"
            onClick={() => setAboutOpen(true)}
            data-testid="about-button"
          >
            About<span className="hide-narrow"> &amp; acknowledgement</span>
          </button>
        </div>
        <div className="app__banner">
          <Disclaimer variant="banner" />
        </div>
        <div className="app__top-right">
          <LayerControls onOverview={onOverview} />
        </div>
        {showCard && (
          <div className="app__card">
            <InfoCard nation={selected} onClose={closeCard} />
          </div>
        )}
        <div className="app__bottom-right">
          <Attribution entries={attribution} />
        </div>
        <Toast message={toast} />
      </main>

      <About
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        attribution={attribution}
        nation={selected}
      />
    </div>
  );
}
