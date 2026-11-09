import { useEffect, useState } from 'react';
import { loadNations } from '../data/loadNations';
import { MapView } from '../map/MapView';
import { useAppStore } from '../store/useAppStore';

// WS0 shell. WS5 owns this file from Phase 1 and swaps in <SidePanel>, <InfoCard>, About, Attribution.
export function App() {
  const count = useAppStore((s) => s.nations.length);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNations()
      .then((file) => useAppStore.getState().setNations(file.nations))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="app-grid">
      <aside className="side" data-testid="side-panel" aria-label="Nations & language groups">
        <h1>Country Map</h1>
        <p>Nations &amp; language groups</p>
        <p className="placeholder">
          {error ? `Could not load nations: ${error}` : count ? `${count} loaded.` : 'Loading…'}{' '}
          Side panel coming in WS4.
        </p>
      </aside>
      <main className="main">
        <MapView />
      </main>
    </div>
  );
}
