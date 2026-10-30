import { getLang } from './i18n';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';

// Push notifications (final list, Sascha 23.10.2026: "push in the web prototype"): a round not yet checked, a fellow
// player joining a game or a game ending, a thunderstorm while a round is played. The server side is the function
// supabase/functions/golfos-push (with supabase/golfos-push.sql); this phone subscribes with the function's key, the
// service worker (public/push-sw.js) shows what arrives and opens the app at the right place.
// On the iPhone this works only for the app added to the home screen (iOS 16.4 and later) – the profile says so.

export type PushKind = 'rounds' | 'games' | 'weather';
export type PushKinds = Record<PushKind, boolean>;
export interface PushState {
  on: boolean;
  endpoint?: string;
  kinds: PushKinds;
}

const KEY = 'golfos.push.v1'; // this phone only – every phone subscribes for itself; its kinds: what the server was told
// which notifications the player wants – the same on all his devices (Sascha 29.10.2026), synced as a setting
const KINDS = 'golfos.pushkinds.v1';
const ALL_ON: PushKinds = { rounds: true, games: true, weather: true };
const fn = () => `${SUPABASE_URL}/functions/v1/golfos-push`;

function phoneState(): PushState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as PushState | null;
  } catch {
    return null;
  }
}
function chosenKinds(): Partial<PushKinds> | null {
  try {
    return JSON.parse(localStorage.getItem(KINDS) ?? 'null') as Partial<PushKinds> | null;
  } catch {
    return null;
  }
}
export function loadPush(): PushState {
  const s = phoneState();
  // the kinds chosen on any device; before 29.10.2026 they were kept with this phone's switch only
  const kinds = { ...ALL_ON, ...(chosenKinds() ?? s?.kinds ?? {}) };
  return s ? { ...s, kinds } : { on: false, kinds };
}
function savePush(s: PushState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    if (JSON.stringify(chosenKinds()) !== JSON.stringify(s.kinds)) localStorage.setItem(KINDS, JSON.stringify(s.kinds));
  } catch {
    /* storage full – the switch shows off again next time */
  }
}
/** After a sync: the kinds chosen on another device go to this phone's subscription on the server too. */
export function pushKindsFromSync(): void {
  const s = phoneState();
  const kinds = chosenKinds();
  if (!s?.on || !s.endpoint || !kinds || !loadSession()) return;
  const want = { ...ALL_ON, ...kinds };
  if (JSON.stringify({ ...ALL_ON, ...s.kinds }) === JSON.stringify(want)) return;
  void call({ action: 'settings', endpoint: s.endpoint, kinds: want })
    .then((r) => r.ok && savePush({ ...s, kinds: want }))
    .catch(() => null); // offline: after the next sync
}
if (typeof window !== 'undefined') window.addEventListener('golfos:synced', pushKindsFromSync);

/** The browser can receive pushes at all (service worker, push manager, notifications). */
export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone or iPad (iPadOS shows itself as a Mac with touch). */
export const isIos = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Opened from the home screen. */
export const standalone = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);

/** What the profile offers: the switch, or why not. */
export function pushAvailability(): 'ok' | 'signin' | 'homescreen' | 'unsupported' {
  if (!syncConfigured()) return 'unsupported';
  if (isIos() && !standalone()) return 'homescreen';
  if (!pushSupported()) return 'unsupported';
  if (!loadSession()) return 'signin';
  return 'ok';
}

async function call(body: Record<string, unknown>): Promise<Response> {
  const t = await authToken();
  return fetch(fn(), { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t ?? SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const toBytes = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

export class PushError extends Error {
  constructor(public readonly reason: 'denied' | 'setup' | 'failed', message: string) {
    super(message);
  }
}

/** Turns notifications on for this phone: asks the player, subscribes, tells the server (which says hello). */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('denied', 'denied');
  let publicKey: string;
  try {
    const r = await call({ action: 'key' });
    if (!r.ok) throw new Error(String(r.status));
    publicKey = ((await r.json()) as { publicKey: string }).publicKey;
  } catch (e) {
    throw new PushError('setup', String(e));
  }
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe().catch(() => false); // made with another key (or for another account): new one
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
  const state: PushState = { on: true, endpoint: sub.endpoint, kinds: loadPush().kinds };
  const r = await call({ action: 'subscribe', subscription: sub.toJSON(), kinds: state.kinds, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: getLang() });
  if (!r.ok) {
    await sub.unsubscribe().catch(() => false);
    throw new PushError(r.status === 404 ? 'setup' : 'failed', String(r.status));
  }
  savePush(state);
  return state;
}

/** Turns them off for this phone. */
export async function disablePush(): Promise<PushState> {
  const s = loadPush();
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* no service worker – nothing to unsubscribe */
  }
  if (s.endpoint) await call({ action: 'unsubscribe', endpoint: s.endpoint }).catch(() => null);
  const next = { on: false, kinds: s.kinds };
  savePush(next);
  return next;
}

/** One kind on or off. */
export async function setPushKind(kind: PushKind, on: boolean): Promise<PushState> {
  const s = loadPush();
  const next = { ...s, kinds: { ...s.kinds, [kind]: on } };
  savePush(next);
  if (s.on && s.endpoint) await call({ action: 'settings', endpoint: s.endpoint, kinds: next.kinds }).catch(() => null);
  return next;
}

const told = new Set<string>();
/** A round is played here (for the thunderstorm warning) – or no longer (null). Once per round and state. */
export function pushRound(round: { id: string; course: string; lat: number; lng: number } | null, roundId?: string): void {
  const s = loadPush();
  if (!s.on || !s.endpoint || !s.kinds.weather || !loadSession()) return;
  const key = round ? `on:${round.id}` : `off:${roundId ?? ''}`;
  if (told.has(key)) return;
  told.add(key);
  void call({ action: 'round', endpoint: s.endpoint, round: round && { lat: round.lat, lng: round.lng, course: round.course } }).catch(() => told.delete(key));
}

/** A shared game: this phone joined it, or the game ended – the others hear of it. */
export function pushGame(action: 'joined' | 'finished', code: string): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action, code }).catch(() => null);
}

/** A round: invite a player by his GolfOS user name (Sascha 30.10.2026) – let in at once, told by push. 'sent',
 *  'silent' (no notifications on his phones – send him the link), 'unknown' (no such user name), 'not-set-up' (the
 *  function on the server is older), null (no connection). */
export async function inviteByName(code: string, username: string, who: string): Promise<'sent' | 'silent' | 'unknown' | 'not-set-up' | null> {
  if (!loadSession() || !syncConfigured()) return null;
  try {
    const r = await call({ action: 'invite', code, username: username.trim().replace(/^@/, ''), who });
    if (r.status === 400) return 'not-set-up';
    if (!r.ok) return null;
    const j = (await r.json()) as { found?: boolean; sent?: number };
    return !j.found ? 'unknown' : (j.sent ?? 0) > 0 ? 'sent' : 'silent';
  } catch {
    return null;
  }
}

/** A round: this phone asked to join – the host hears of it (Sascha 30.10.2026; the function says it once). */
export function pushAsked(to: { code?: string; ref?: string }): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action: 'asked', ...to }).catch(() => null);
}

/** Where a tapped notification leads: "#review=<round>", "#sign", "#games" (read once, then removed). */
export function takePushTarget(): { review?: string; sign?: boolean; games?: boolean } | null {
  const h = location.hash;
  let out: { review?: string; sign?: boolean; games?: boolean } | null = null;
  if (h.startsWith('#review=')) out = { review: decodeURIComponent(h.slice(8)) };
  else if (h === '#sign') out = { sign: true };
  else if (h === '#games') out = { games: true };
  if (out) history.replaceState(null, '', location.pathname + location.search);
  return out;
}
