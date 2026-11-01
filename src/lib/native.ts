import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

// GolfOS as an iOS app (Sascha 01.11.2026: TestFlight, so GPS and the shot by sound keep running with the phone
// locked). The same code as the website; what only the app can do goes through here. The plugins load on demand,
// so the website never downloads them.

/** Running as the app on the phone (not the website in Safari). */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Where Google sends the player back to the app – registered in Info.plist and in Supabase (Auth → URL Configuration). */
export const AUTH_BACK = 'de.moescheit.golfos://auth';

/** The website. Links sent to others (join a round, a game, a pool) open it – the app's own address (capacitor://localhost)
 *  opens on no other phone. */
export const WEB_HOME = 'https://saschamoescheit-cpu.github.io/golfos-round-prototype/';

/** The address a link for others starts with: this page on the website, the website in the app. */
export const linkBase = (): string => (isNative() ? WEB_HOME : location.origin + location.pathname);

/** In the app the iPhone's share sheet stands in for the browser's sharing (navigator.share) and for downloads
 *  (`<a download>` of a blob), iOS's own for the Wake Lock – WKWebView has none of them. So the code everywhere stays
 *  the website's. Once, at the start. */
export function installNativeShims(): void {
  if (!isNative()) return;
  const share = async (d: ShareData): Promise<void> => {
    const { Share } = await import('@capacitor/share');
    const files = d.files?.length ? await Promise.all(d.files.map(toCache)) : undefined;
    try {
      await Share.share({ title: d.title, text: d.text, url: d.url, files });
    } catch (e) {
      // closed without sharing: as the browser says it
      if (/cancel/i.test(String((e as Error)?.message ?? e))) throw new DOMException('Share canceled', 'AbortError');
      throw e;
    }
  };
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: wakeLock() });
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.download || !this.href.startsWith('blob:')) return click.call(this);
    const name = this.download;
    void fetch(this.href)
      .then((r) => r.blob())
      .then((b) => share({ files: [new File([b], name, { type: b.type })] }))
      .catch(() => null);
  };
}

/** A file into the app's cache, for the share sheet – its address there. */
async function toCache(f: File): Promise<string> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem');
  const data = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });
  return (await Filesystem.writeFile({ path: f.name, data, directory: Directory.Cache })).uri;
}

/** The browser's Wake Lock (pocket mode, the camera tests with the phone 2–3 m away) – in the app iOS's own: the
 *  screen stays on while any lock is held. */
function wakeLock(): { request: (type: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: () => void }> } {
  let held = 0;
  const plugin = async () => (await import('@capacitor-community/keep-awake')).KeepAwake;
  return {
    request: async () => {
      await (await plugin()).keepAwake();
      held += 1;
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          held -= 1;
          if (held === 0) await (await plugin()).allowSleep();
        },
        addEventListener: () => undefined, // iOS never takes it away by itself
      };
    },
  };
}

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
