import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyUrlToStore } from './app/UrlSync';
import './index.css';
import { useAppStore } from './store/useAppStore';

// Boot step 1: apply ?l= / ?x= before the map exists so its first style matches the URL.
// ?n= is held until nations have loaded (App), then selected if it is a known id.
const bootNationId = applyUrlToStore(useAppStore, window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App bootNationId={bootNationId} />
  </StrictMode>,
);
