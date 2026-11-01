import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

// GolfOS as an iOS app (Sascha 01.11.2026: TestFlight, so GPS and the shot by sound keep running with the phone
// locked). The same code as the website; what only the app can do goes through here. The plugins load on demand,
// so the website never downloads them.

/** Running as the app on the phone (not the website in Safari). */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Where Google sends the player back to the app – registered in Info.plist and in Supabase (Auth → URL Configuration). */
export const AUTH_BACK = 'de.moescheit.golfos://auth';

/** Opens the Google sign-in in the system's browser sheet – Google refuses its sign-in inside an app's web view. */
export async function openSignIn(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover' });
}

/** A position as the browser's watch hands it out – the round's code reads these fields only. */
export interface Position {
  coords: { longitude: number; latitude: number; accuracy: number };
  timestamp: number;
}
const Background = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** The round's GPS watch. On the website the browser's, as before; in the app iOS's own, which goes on with the
 *  phone locked in the pocket (the blue mark in the status bar). Error codes as the browser's: 1 not allowed. */
export function watchPosition(ok: (p: Position) => void, fail: (e: { code: number }) => void, options?: PositionOptions): () => void {
  if (!isNative()) {
    const id = navigator.geolocation.watchPosition(ok, fail, options);
    return () => navigator.geolocation.clearWatch(id);
  }
  let id: string | null = null;
  let stopped = false;
  Background.addWatcher(
    { backgroundMessage: 'GolfOS misst deine Runde.', backgroundTitle: 'GolfOS', requestPermissions: true, stale: false, distanceFilter: 0 },
    (loc, err) => {
      if (stopped) return;
      if (err) return fail({ code: err.code === 'NOT_AUTHORIZED' ? 1 : 2 });
      if (loc) ok({ coords: { longitude: loc.longitude, latitude: loc.latitude, accuracy: loc.accuracy }, timestamp: loc.time ?? Date.now() });
    },
  )
    .then((w) => {
      if (stopped) void Background.removeWatcher({ id: w });
      else id = w;
    })
    .catch(() => fail({ code: 2 }));
  return () => {
    stopped = true;
    if (id) void Background.removeWatcher({ id });
  };
}

/** The app opened by a link (back from Google): `fn` gets the whole address; the browser sheet closes. */
export async function onAppLink(fn: (url: string) => void): Promise<void> {
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
  await App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(AUTH_BACK)) void Browser.close().catch(() => null);
    fn(url);
  });
}
