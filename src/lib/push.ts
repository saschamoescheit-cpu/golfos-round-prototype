import { getLang } from './i18n';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { dropNativePush, isNative, nativePushToken } from './native';

// Push notifications (final list, Sascha 23.10.2026: "push in the web prototype"): a round not yet checked, a fellow
// player joining a game or a game ending, a thunderstorm while a round is played. The server side is the function
// supabase/functions/golfos-push (with supabase/golfos-push.sql); this phone subscribes with the function's key, the
// service worker (public/push-sw.js) shows what arrives and opens the app at the right place.
// On the iPhone this works only for the app added to the home screen (iOS 16.4 and later) – the profile says so. The
// iOS app gets Apple's notifications instead (01.11.2026): the same switches, the same function, its phone as "apns:…".

export type PushKind = 'rounds' | 'games' | 'weather' | 'agility' | 'specials';
export type PushKinds = Record<PushKind, boolean>;
export interface PushState {
  on: boolean;
  endpoint?: string;
  kinds: PushKinds;
  /** the time zone the server was told – its tee time reminder counts in it */
  tz?: string;
}

const KEY = 'golfos.push.v1'; // this phone only – every phone subscribes for itself; its kinds: what the server was told
// which notifications the player wants – the same on all his devices (Sascha 29.10.2026), synced as a setting
const KINDS = 'golfos.pushkinds.v1';
const ALL_ON: PushKinds = { rounds: true, games: true, weather: true, agility: true, specials: true };
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

/** The phone in another time zone (Sascha 04.11.2026: the USA trip) – the server told again, its tee time reminder 45
 *  minutes ahead in the time there, not at home; told only at subscribing, so this phone subscribes once more (the
 *  server says hello). A phone from before that kept none: the zone it is in now, as it was told. */
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
let telling = false;
export async function pushTimezone(): Promise<void> {
  const s = phoneState();
  if (!s?.on || !s.endpoint || telling || !loadSession()) return;
  const tz = zone();
  if (!s.tz) return savePush({ ...loadPush(), tz });
  if (s.tz === tz) return;
  telling = true;
  try {
    const subscription = isNative()
      ? { endpoint: s.endpoint, keys: { p256dh: 'apns', auth: 'apns' } }
      : (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.toJSON();
    if (!subscription) return;
    const r = await call({ action: 'subscribe', subscription, kinds: loadPush().kinds, tz, lang: getLang() });
    if (r.ok) savePush({ ...loadPush(), tz });
  } catch {
    /* no connection – told the next time the app comes up */
  } finally {
    telling = false;
  }
}
if (typeof window !== 'undefined') {
  window.setTimeout(() => void pushTimezone(), 4000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void pushTimezone());
}

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
  // the iOS app: Apple's notifications (lib/native) instead of the browser's
  if (isNative()) return loadSession() ? 'ok' : 'signin';
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
  if (isNative()) return enableAppPush();
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
  const state: PushState = { on: true, endpoint: sub.endpoint, kinds: loadPush().kinds, tz: zone() };
  const r = await call({ action: 'subscribe', subscription: sub.toJSON(), kinds: state.kinds, tz: zone(), lang: getLang() });
  if (!r.ok) {
    await sub.unsubscribe().catch(() => false);
    throw new PushError(r.status === 404 ? 'setup' : 'failed', String(r.status));
  }
  savePush(state);
  return state;
}

/** The iOS app: Apple's notifications – the phone's device token goes to the function as "apns:<token>". */
async function enableAppPush(): Promise<PushState> {
  let token: string | null;
  try {
    token = await nativePushToken();
  } catch (e) {
    throw new PushError('failed', String(e));
  }
  if (!token) throw new PushError('denied', 'denied');
  const endpoint = `apns:${token}`;
  const state: PushState = { on: true, endpoint, kinds: loadPush().kinds, tz: zone() };
  const r = await call({ action: 'subscribe', subscription: { endpoint, keys: { p256dh: 'apns', auth: 'apns' } }, kinds: state.kinds, tz: zone(), lang: getLang() });
  // 400: the function on the server is older than the app (it knows only the browser's subscriptions)
  if (!r.ok) throw new PushError(r.status === 404 || r.status === 400 ? 'setup' : 'failed', String(r.status));
  savePush(state);
  return state;
}

/** Turns them off for this phone. */
export async function disablePush(): Promise<PushState> {
  const s = loadPush();
  if (isNative()) await dropNativePush();
  else try {
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

/** A bet made in a pool of bets (Sascha 01.11.2026): everyone in the pool hears of it – the server sends it once and
 *  only when the pool says it is made. */
export function pushBet(code: string, wager: string): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action: 'bet', code, wager }).catch(() => null);
}

/** Paid or received in the balance (Sascha 03.11.2026: "he gets told that I booked the payment out – and confirms"):
 *  the others of the game or the pool hear of it. */
export function pushPaid(code: string, as: 'paid' | 'received', who: string, to: string, amount: string): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action: 'paid', code, as, who, to, amount }).catch(() => null);
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

/** A round: a linked friend invited with a tap (Sascha 03.11.2026) – let in at once, told by push, and his app, open,
 *  asks him straight away. 'old': the function on the server does not know friends yet (then the host's phone lets him
 *  in itself – see letInvited). */
export async function inviteFriend(code: string, friend: string, name: string, who: string): Promise<'sent' | 'silent' | 'old' | null> {
  if (!loadSession() || !syncConfigured()) return null;
  try {
    const r = await call({ action: 'invite', code, friend, name, who });
    if (r.status === 400) return 'old';
    if (!r.ok) return null;
    const j = (await r.json()) as { found?: boolean; sent?: number };
    return !j.found ? 'old' : (j.sent ?? 0) > 0 ? 'sent' : 'silent';
  } catch {
    return null;
  }
}

/** A friend request accepted (Sascha 03.11.2026: "as on Instagram – a push that we are GolfOS friends now"): the one who
 *  sent the invitation hears of it. A function without it answers 400 – nothing then. */
export function pushFriendAccepted(friend: string, who: string): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action: 'friend-accepted', friend, who }).catch(() => null);
}

/** A round: this phone asked to join – the host hears of it (Sascha 30.10.2026; the function says it once). */
export function pushAsked(to: { code?: string; ref?: string }): void {
  if (!loadSession() || !syncConfigured()) return;
  void call({ action: 'asked', ...to }).catch(() => null);
}

// ---------- tournaments, cards, bets, settlement, special prizes (Sascha 07.11.2026: "please build 1–6") ----------
// The server checks each against the table (only the host changes a tournament, only a phone of it tells) and sends
// every one once; a function on the server from before answers 400 – nothing then.
const tell = (body: Record<string, unknown>): void => {
  if (!loadSession() || !syncConfigured()) return;
  void call(body).catch(() => null);
};
/** 1 · the host changed the tournament: per player (by name, lower case) what changed for him, and for all. */
export const pushTourChanged = (code: string, changes: Record<string, string>, general: string): void => tell({ action: 'tour-changed', code, changes, general });
/** 2 · every flight is in: the standing (and the series' total) – the server says it once to each. */
export async function pushTourResult(code: string, o: { rows: { name: string; pos: string; sort: number | null }[]; hb: boolean; series?: { rows: { name: string; pos: string; sort: number | null }[]; hb: boolean } | null }): Promise<boolean> {
  if (!loadSession() || !syncConfigured()) return false;
  try {
    return (await call({ action: 'tour-result', code, ...o })).ok;
  } catch {
    return false;
  }
}
/** 3 · a card signed – as the player (his marker is asked) or as the marker (the player hears it is in). */
export const pushSigned = (code: string, flight: string, player: string, as: 'player' | 'marker'): void => tell({ action: 'signed', code, flight, player, as });
/** 4 · new bets in a pool: the player and the one it is against hear of it. */
export const pushWagers = (code: string, wagers: string[]): void => tell({ action: 'wager-new', code, wagers });
/** 5 · a pool over: the open transfers (the app judges the bets) – the settlement, and a day later what is open. */
export const pushSettle = (code: string, transfers: { from: string; to: string; amount: number }[], sym: string): void => tell({ action: 'settle', code, transfers, sym });
/** 6 · a special prize's entry – the server works out whether it is a new best. */
export const pushSpecial = (code: string, special: string): void => tell({ action: 'special', code, special });

/** Where a tapped notification leads: "#review=<round>", "#sign", "#games" (read once, then removed). */
export function takePushTarget(): { review?: string; sign?: boolean; games?: boolean; pool?: string; agility?: boolean; tour?: string } | null {
  const h = location.hash;
  let out: { review?: string; sign?: boolean; games?: boolean; pool?: string; agility?: boolean; tour?: string } | null = null;
  if (h.startsWith('#review=')) out = { review: decodeURIComponent(h.slice(8)) };
  else if (h === '#sign') out = { sign: true };
  else if (h === '#games') out = { games: true };
  else if (h === '#agility') out = { agility: true }; // a training day of the physio's routine: Agility's drills
  else if (h.startsWith('#pool=')) out = { pool: decodeURIComponent(h.slice(6)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }; // a bet made: its pool in Games
  else if (h.startsWith('#tour=')) out = { tour: decodeURIComponent(h.slice(6)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }; // a tournament changed, its result, a special prize
  if (out) history.replaceState(null, '', location.pathname + location.search);
  return out;
}
