import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpeechBar } from './components/SpeechBar';
import { UndoToast } from './components/UndoToast';
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

applyTheme(); // sun mode before the first paint

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <SpeechBar />
      <UndoToast />
    </ErrorBoundary>
  </React.StrictMode>,
);
