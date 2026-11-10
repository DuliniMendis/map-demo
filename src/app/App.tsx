import type * as maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadNations } from '../data/loadNations';
import { MapView } from '../map/MapView';
import { useAppStore } from '../store/useAppStore';
import { About } from './About';
import { Attribution } from './Attribution';
import { nativeLandKey } from '../places/nativeLand';
import { PlaceFinder } from '../places/PlaceFinder';
import { GestureHint } from './controls/GestureHint';
import { TiltControl } from './controls/TiltControl';
import {
  DEFAULT_ATTRIBUTION,
  loadAttribution,
  withPlaces,
  type AttributionEntry,
} from './attributionData';
import { Disclaimer, InfoCard, SidePanel, type MapController } from './integration';
import { LayerControls } from './LayerControls';
import { PinnedCard } from './PinnedCard';
import { ListSkeleton, LoadError, Toast } from './LoadStates';
import { resolveBootSelection, startUrlWriter } from './UrlSync';
import { TourButton, TourPanel, tourDriver } from './tour/Tour';
import { ambient } from './vision/ambient';
import { SoundToggle, Vision, hasSeenVision, markVisionSeen } from './vision/Vision';
import { goToOverview } from './wiring';
import './app.css';

/** Wide enough for the card to pop up next to its pin; below this WS4 docks it above the bottom sheet. */
const DESKTOP_QUERY = '(min-width: 900px)';
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const TOAST_MS = 6000;

export interface AppProps {
  /** `?n=` from the URL at boot (see main.tsx); selected once nations load, if it exists. */
  bootNationId?: string | null;
}

export function App({ bootNationId = null }: AppProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [baseAttribution, setAttribution] = useState<AttributionEntry[]>(DEFAULT_ATTRIBUTION);
  const attribution = useMemo(
    () => withPlaces(baseAttribution, nativeLandKey() !== null),
    [baseAttribution],
  );
  const [controller, setController] = useState<MapController | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // The Vision modal greets first-time visitors; afterwards it opens from its button.
  const [visionOpen, setVisionOpen] = useState(() => !hasSeenVision());
  const [toast, setToast] = useState<string | null>(null);
  const bootId = useRef(bootNationId);
  const aboutButtonRef = useRef<HTMLButtonElement>(null);
  const visionButtonRef = useRef<HTMLButtonElement>(null);
  const dialogOpen = aboutOpen || visionOpen;

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

  // Ambient sound starts with the visitor's first click or key press (browsers block it before then).
  useEffect(() => ambient().armOnFirstGesture(), []);

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
  const closeVision = useCallback(() => {
    markVisionSeen();
    setVisionOpen(false);
  }, []);
  const startTourFromVision = useCallback(() => {
    closeVision();
    tourDriver().dispatch({ type: 'start' });
  }, [closeVision]);
  const closeCard = useCallback(() => {
    const store = useAppStore.getState();
    const id = store.selectedId;
    // The card is about to unmount; if it had focus, hand it back to the nation's row in the list.
    const hadFocus = document.activeElement?.closest('[data-testid="info-card"]');
    store.select(null);
    if (hadFocus && id) {
      const row = document.querySelector<HTMLElement>(`[data-nation-id="${CSS.escape(id)}"]`);
      (row ?? document.querySelector<HTMLElement>('[data-testid="search-input"]'))?.focus({
        preventScroll: true,
      });
    }
  }, []);

  // Esc closes the card from anywhere except text fields and dialogs (the card handles its own Esc).
  useEffect(() => {
    if (!showCard || dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, select, textarea, [role="dialog"], [data-testid="info-card"]')) return;
      closeCard();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showCard, dialogOpen, closeCard]);

  const visionButton = (
    <button
      type="button"
      className="btn overlay-panel vision-button"
      onClick={() => setVisionOpen(true)}
      ref={visionButtonRef}
      data-testid="vision-button"
    >
      Vision
    </button>
  );

  return (
    <div className="app">
      <header className="visually-hidden">
        <h1>Country — First Nations of Australia in 3D</h1>
      </header>
      {/* WS4's SidePanel renders its own <aside data-testid="side-panel">; this is layout only. */}
      <div className="app__side">
        {/* The disclaimer banner sits over the map (below), so the panel doesn't repeat it. */}
        {load.kind === 'ready' && <SidePanel showDisclaimerBanner={false} />}
        {load.kind === 'loading' && <ListSkeleton />}
        {load.kind === 'error' && <LoadError message={load.message} onRetry={retry} />}
      </div>

      <main className="app__main">
        <MapView
          onController={setController}
          onMap={setMap}
          onDemFallback={onDemFallback}
          onUnavailable={onMapUnavailable}
        />

        <div className="app__top-left">
          {desktop && visionButton}
          <button
            type="button"
            className="btn overlay-panel"
            onClick={() => setAboutOpen(true)}
            ref={aboutButtonRef}
            data-testid="about-button"
          >
            About<span className="hide-narrow"> &amp; acknowledgement</span>
          </button>
          <TourButton />
          {desktop && <SoundToggle />}
        </div>
        {/* Narrow screens have no room beside the layer controls: Vision, sound and 2D/3D sit bottom-left. */}
        {!desktop && (
          <div className="app__bottom-left">
            {visionButton}
            <SoundToggle />
            {map && <TiltControl map={map} />}
          </div>
        )}
        <PlaceFinder map={map} className="app__places" />
        <div className="app__banner cm-theme">
          <Disclaimer variant="banner" />
        </div>
        <div className="app__top-right">
          {desktop && map && <TiltControl map={map} />}
          <LayerControls onOverview={onOverview} />
        </div>
        {/* WS4's card positions itself (and sits above the bottom sheet on narrow screens). */}
        {showCard &&
          (desktop && map ? (
            <PinnedCard map={map} nation={selected}>
              <InfoCard
                nation={selected}
                onClose={closeCard}
                onBackToOverview={onOverview}
                className="app__card"
              />
            </PinnedCard>
          ) : (
            <InfoCard
              nation={selected}
              onClose={closeCard}
              onBackToOverview={onOverview}
              className="app__card"
            />
          ))}
        <div className="app__bottom-right">
          <Attribution entries={attribution} />
        </div>
        <Toast message={toast} />
        <GestureHint map={map} suppressed={dialogOpen} />
        <TourPanel aboutOpen={dialogOpen} onOverview={onOverview} />
      </main>

      <About
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        returnFocusRef={aboutButtonRef}
        attribution={attribution}
        nation={selected}
      />
      <Vision
        open={visionOpen}
        onClose={closeVision}
        onStartTour={load.kind === 'ready' ? startTourFromVision : undefined}
        returnFocusRef={visionButtonRef}
      />
    </div>
  );
}
