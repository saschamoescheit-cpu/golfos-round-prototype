import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StorageFullToast, UndoToast } from './components/UndoToast';
// Fonts ship with the app (static weights, latin incl. umlauts): same look on every phone, offline on the course,
// and no request to Google Fonts (privacy).
import '@fontsource/lexend/latin-500.css';
import '@fontsource/lexend/latin-600.css';
import '@fontsource/lexend/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
// The map stylesheet first, our styles after it (they override map positioning) – also with the map loaded lazily.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { applyTheme } from './lib/theme';
import { reloadForNewVersion } from './lib/staleChunk';
import { guardStorage } from './lib/storageguard';
import { startErrorLog } from './lib/errorlog';
import { watchForUpdates } from './lib/appupdate';

applyTheme(); // sun mode before the first paint
guardStorage(); // storage full: course map copies make room, nothing the player entered is lost silently
startErrorLog(); // app errors reported by themselves – from the live app only (final list, 22.10.2026)
watchForUpdates(); // a new version also reaches the home-screen app that is never closed (24.10.2026)
// a part of the app from before the last deploy could not be loaded: once onto the new version (19.10.2026)
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <UndoToast />
      <StorageFullToast />
    </ErrorBoundary>
  </React.StrictMode>,
);
