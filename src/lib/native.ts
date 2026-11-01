import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import type { Impact, Listening, MicHealth } from './impact';
import { tidyTiles, withTileStore } from './tilestore';

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
 *  (`<a download>` of a blob), iOS's own for the Wake Lock, the app's tile store for the service worker's – WKWebView
 *  has none of them. So the code everywhere stays the website's. Once, at the start. */
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
  // the aerial tiles for offline – the website's service worker does that, the app has none
  window.fetch = withTileStore(window.fetch.bind(window));
  setTimeout(() => void tidyTiles(), 20000);
  onPushTap();
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
  // the module, not the plugin: a Capacitor plugin answers every name, also "then" – awaited it never resolves (the
  // screen then locked during the camera tests, 01.11.2026)
  const plugin = () => import('@capacitor-community/keep-awake');
  return {
    request: async () => {
      await (await plugin()).KeepAwake.keepAwake();
      held += 1;
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          held -= 1;
          if (held === 0) await (await plugin()).KeepAwake.allowSleep();
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

/** GolfOS' own plugin (native-plugins/shot-listener): the shot by sound by iOS's audio engine. */
interface ShotHit {
  seq: number;
  t: number;
  level: number;
}
interface ShotListener {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ health: MicHealth; why: string; restarts: number }>;
  take(): Promise<{ impacts: ShotHit[] }>;
  addListener(event: 'impact', fn: (hit: ShotHit) => void): Promise<PluginListenerHandle>;
}
const Shots = registerPlugin<ShotListener>('ShotListener');

/** The shot by sound in the app – as lib/impact listen(), but it hears on with the phone locked in the pocket. A crack
 *  heard while the page slept comes when it wakes (with its own time), each one once. */
export async function listenShots(onImpact: (i: Impact) => void): Promise<Listening> {
  const seen = new Set<number>();
  const hand = (h: ShotHit) => {
    if (seen.has(h.seq)) return;
    seen.add(h.seq);
    onImpact({ t: h.t, level: h.level });
  };
  const handle = await Shots.addListener('impact', hand);
  try {
    await Shots.start();
  } catch (e) {
    void handle.remove();
    throw e;
  }
  let state: { health: MicHealth; why: string } = { health: 'on', why: '' };
  let stopped = false;
  const poll = window.setInterval(() => void Shots.status().then((s) => (state = s), () => undefined), 1000);
  const catchUp = () => {
    if (document.visibilityState === 'visible') void Shots.take().then((r) => r.impacts.forEach(hand), () => undefined);
  };
  document.addEventListener('visibilitychange', catchUp);
  const stop = () => {
    stopped = true;
    window.clearInterval(poll);
    document.removeEventListener('visibilitychange', catchUp);
    void handle.remove();
    void Shots.stop().catch(() => undefined);
  };
  return Object.assign(stop, {
    alive: () => !stopped && state.health !== 'dead',
    health: () => (stopped ? 'dead' : state.health),
    why: () => state.why || state.health,
    wake: () => undefined,
  });
}

/** Apple's notifications for this phone (the app has no web push): asks the player, then the phone's address for them
 *  (its device token) – null when not allowed. */
export async function nativePushToken(): Promise<string | null> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted' && perm.receive !== 'denied') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return null;
  return new Promise((ok, fail) => {
    let done = false;
    const handles: Promise<PluginListenerHandle>[] = [];
    const end = (then: () => void) => {
      if (done) return;
      done = true;
      handles.forEach((h) => void h.then((x) => x.remove()));
      then();
    };
    handles.push(PushNotifications.addListener('registration', (t) => end(() => ok(t.value))));
    handles.push(PushNotifications.addListener('registrationError', (e) => end(() => fail(new Error(e.error)))));
    void PushNotifications.register().catch((e) => end(() => fail(e)));
    setTimeout(() => end(() => fail(new Error('no answer from Apple'))), 20000);
  });
}

/** No more of Apple's notifications for this phone. */
export async function dropNativePush(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.unregister().catch(() => undefined);
}

/** A notification tapped: the app opens where it says (the same places as the website's: #review=…, #games …). */
function onPushTap(): void {
  void import('@capacitor/push-notifications').then(({ PushNotifications }) =>
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = String((a.notification.data as { url?: string } | undefined)?.url ?? '');
      const hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
      if (!hash) return;
      location.hash = hash;
      location.reload(); // App reads the place at its start (lib/push takePushTarget)
    }),
  );
}

/** The app opened by a link (back from Google): `fn` gets the whole address; the browser sheet closes. */
export async function onAppLink(fn: (url: string) => void): Promise<void> {
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
  await App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(AUTH_BACK)) void Browser.close().catch(() => null);
    fn(url);
  });
}
