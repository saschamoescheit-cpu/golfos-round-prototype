import { ModuleSheetHost } from './components/ModuleSheet';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StorageFullToast, UndoToast } from './components/UndoToast';
import { JoinRequests } from './components/JoinRequests';
import { FriendAskHost } from './components/Friends';
import { RoundInviteHost } from './components/RoundInviteHost';
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
import { cancelBigStore, openBigStore } from './lib/bigstore';
import { startErrorLog } from './lib/errorlog';
import { watchForUpdates } from './lib/appupdate';
import { installNativeShims } from './lib/native';
import { liveCodeOf } from './lib/live';
import { installSwipeBack } from './lib/swipeback';

applyTheme(); // sun mode before the first paint
installNativeShims(); // the iOS app: its share sheet for sharing and downloads (01.11.2026)
installSwipeBack(); // back by a swipe from the left edge (Sascha 10.11.2026)
guardStorage(); // storage full: course map copies make room, nothing the player entered is lost silently
startErrorLog(); // app errors reported by themselves – from the live app only (final list, 22.10.2026)
watchForUpdates(); // a new version also reaches the home-screen app that is never closed (24.10.2026)
// a part of the app from before the last deploy could not be loaded: once onto the new version (19.10.2026)
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

// the GPS tracks and course maps in the big store (IndexedDB) before the app reads anything (Sascha 08.11.2026: "storage
// full" right after opening the app); without it – or if it does not answer within 8 s (a phone busy, a big store of
// many rounds) – the app starts as before, with nothing lost
const bigStore = Promise.race([
  openBigStore().catch(() => false),
  new Promise<boolean>((ok) =>
    setTimeout(() => {
      cancelBigStore(); // too late: this session without it, never switched in halfway
      ok(false);
    }, 8000),
  ),
]);
// a spectator's link (#live=…, Sascha 08.11.2026): the leaderboard alone – none of the app around it, no account, no
// sync, no intro; only looking
const LIVE = liveCodeOf(location.hash);
const LiveScreen = lazy(() => import('./screens/LiveView').then((m) => ({ default: m.LiveScreen })));
if (LIVE) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <LiveScreen code={LIVE} />
        </Suspense>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
void bigStore.then(() =>
  !LIVE &&
  ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <UndoToast />
      <FriendAskHost />
      <RoundInviteHost />
      <StorageFullToast />
      <JoinRequests />
      <ModuleSheetHost />
    </ErrorBoundary>
  </React.StrictMode>,
  ),
);
