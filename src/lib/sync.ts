import { loadProfile, saveProfile } from './profile';
import { tr } from './i18n';

// Sync between the player's devices (feature 013, Sascha 15.10.2026: "iPhone, iPad and PC should show the same").
// Offline first: the app keeps saving to the device as before; with a Google login and a network the data is
// compared with the copy in Supabase (EU, Frankfurt) – one row per round, game, track and setting – and the newer
// side wins. Nothing is ever deleted without the player: a round deleted on one device goes to the bin on the others.
//
// The engine works on two small interfaces – the device's store and the remote rows – so it is tested without a
// browser or a server (sync.test.ts).

export interface Row {
  kind: string;
  id: string;
  data?: unknown;
  updated_at: string; // ISO time
  deleted?: boolean;
}
export interface LocalStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}
export interface Remote {
  /** All rows of the signed-in player without their data. */
  list(): Promise<Row[]>;
  /** The data of these rows. */
  fetch(keys: { kind: string; id: string }[]): Promise<Row[]>;
  /** Sends the rows; returns those the server refused (the rest is saved – one bad row never blocks the others). */
  upsert(rows: Row[]): Promise<void | { row: Row; error: string }[]>;
}

const META = 'golfos.sync.meta.v1';
const ROUNDS = 'golfos.rounds.v1';
const TRASH = 'golfos.trash.v1';
const GAMES = 'golfos.games.v1';
const GAME_TRASH = 'golfos.games.trash.v1';
/** Single settings: the key on the device is the row id. */
const SETTINGS = [
  'golfos.profile.v1', 'golfos.bag.v1', 'golfos.bagstyle.v1', 'golfos.caddie.v1', 'golfos.partials.v1', 'golfos.unit.v1', 'golfos.lang.v1', 'golfos.me.v1',
];
/** Per round or per course: a key prefix, the rest is the row id. */
const PER = [
  { kind: 'track', prefix: 'golfos.track.v1.' },
  { kind: 'caddielog', prefix: 'golfos.caddielog.v1.' },
  { kind: 'holenotes', prefix: 'golfos.holenotes.v1.' },
  { kind: 'holelines', prefix: 'golfos.holelines.v2.' },
  { kind: 'course', prefix: 'golfos.course.v1.' },
  { kind: 'strategy', prefix: 'golfos.strategy.v1.' },
];
/** Lists of objects with an id: every entry is its own row. */
const LISTS = [
  { kind: 'round', key: ROUNDS, idOf: (x: { id: string }) => x.id },
  { kind: 'game', key: GAMES, idOf: (x: { id: string }) => x.id },
  { kind: 'trash-round', key: TRASH, idOf: (x: { round: { id: string } }) => x.round.id },
  { kind: 'trash-game', key: GAME_TRASH, idOf: (x: { game: { id: string } }) => x.game.id },
  { kind: 'game-fav', key: 'golfos.games.fav.v1', idOf: (x: string) => x },
  // friends one by one: a friend added on the iPad and one added on the phone are both kept
  { kind: 'friend', key: 'golfos.friends.v1', idOf: (x: { id: string }) => x.id },
  // Training (feature 022): every entry its own row, so both devices' entries are kept (never lose data)
  { kind: 'training-log', key: 'golfos.training.log.v1', idOf: (x: { id: string }) => x.id },
  { kind: 'training-session', key: 'golfos.training.sessions.v1', idOf: (x: { id: string }) => x.id },
  { kind: 'training-trash', key: 'golfos.training.trash.v1', idOf: (x: { session: { id: string } }) => x.session.id },
  { kind: 'training-plan', key: 'golfos.training.plans.v1', idOf: (x: { id: string }) => x.id },
  { kind: 'training-order', key: 'golfos.training.orders.v1', idOf: (x: { id: string }) => x.id },
  { kind: 'training-cart', key: 'golfos.training.cart.v1', idOf: (x: { gear: string }) => x.gear },
  { kind: 'training-fav', key: 'golfos.training.fav.v1', idOf: (x: string) => x },
  // mobility screen (feature 030): every screening its own row
  { kind: 'mobility', key: 'golfos.mobility.v1', idOf: (x: { id: string }) => x.id },
  { kind: 'mobility-trash', key: 'golfos.mobility.trash.v1', idOf: (x: { screening: { id: string } }) => x.screening.id },
  // the mobility goal (handicap to reach, what matters most) – one row
  { kind: 'mobility-goal', key: 'golfos.mobility.goal.v1', idOf: (x: { id: string }) => x.id },
  // the guided drill sessions of the mobility pillar – every session its own row
  { kind: 'mobility-session', key: 'golfos.mobility.sessions.v1', idOf: (x: { id: string }) => x.id },
] as const;

type Meta = Record<string, { hash: string; at: string }>; // per "kind|id": what was in sync last time
const k = (kind: string, id: string) => `${kind}|${id}`;

/** A short fingerprint of a value (FNV-1a) – to see whether it changed on the device since the last sync. */
export function hashOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const parse = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Settings of this device that the sync replaced by another device's (key → the value it had here). */
const REPLACED = 'golfos.sync.replaced.v1';
export function replacedSettings(store: LocalStore = browserStore, withinMs = Infinity): string[] {
  const kept = parse<Record<string, { at?: string }>>(store.get(REPLACED), {});
  return Object.keys(kept).filter((key) => withinMs === Infinity || Date.now() - Date.parse(kept[key].at ?? '') < withinMs);
}
/** Keep this device's settings after all: they come back and go to the other devices with the next sync. */
export function keepThisDevice(store: LocalStore = browserStore): void {
  const kept = parse<Record<string, { value: string }>>(store.get(REPLACED), {});
  for (const [key, v] of Object.entries(kept)) store.set(key, v.value);
  store.remove(REPLACED);
}
/** Fine with the other device's settings: forget this device's old ones. */
export function dropReplaced(store: LocalStore = browserStore): void {
  store.remove(REPLACED);
}

/** Rounds and games of this device that lost a conflict to another device's version: kept, never deleted. */
const CONFLICTS = 'golfos.sync.conflicts.v1';
export function conflictCopies(store: LocalStore = browserStore): { kind: string; id: string; at: string; data: unknown }[] {
  return parse(store.get(CONFLICTS), []);
}

/** Settings the app stores as plain text, not JSON (the language: "de"). They travel as a JSON string. */
const RAW_SETTINGS = new Set(['golfos.lang.v1']);
/** A stored value as JSON for the server – null when it is no JSON at all (skipped: one odd value must never stop
 *  the whole sync – Sascha 16.10.2026, the iPhone's "de" did exactly that). */
function asJson(key: string, v: string): string | null {
  if (RAW_SETTINGS.has(key)) return JSON.stringify(v);
  try {
    JSON.parse(v);
    return v;
  } catch {
    return null;
  }
}

/** Everything on this device that is synced, as kind|id → JSON. */
export function localItems(store: LocalStore): Map<string, { kind: string; id: string; json: string }> {
  const out = new Map<string, { kind: string; id: string; json: string }>();
  for (const l of LISTS) {
    const list = parse<unknown[]>(store.get(l.key), []);
    for (const x of list) {
      const id = (l.idOf as (x: unknown) => string)(x);
      if (id) out.set(k(l.kind, id), { kind: l.kind, id, json: JSON.stringify(x) });
    }
  }
  for (const key of SETTINGS) {
    const v = store.get(key);
    const json = v != null ? asJson(key, v) : null;
    if (json != null) out.set(k('setting', key), { kind: 'setting', id: key, json });
  }
  for (const key of store.keys()) {
    const p = PER.find((x) => key.startsWith(x.prefix));
    if (!p) continue;
    const v = store.get(key);
    const json = v != null ? asJson(key, v) : null;
    if (json != null) out.set(k(p.kind, key.slice(p.prefix.length)), { kind: p.kind, id: key.slice(p.prefix.length), json });
  }
  return out;
}

/** Writes one item from the server onto the device (null = remove it from there). */
function apply(store: LocalStore, kind: string, id: string, json: string | null): void {
  const list = LISTS.find((l) => l.kind === kind);
  if (list) {
    const items = parse<unknown[]>(store.get(list.key), []).filter((x) => (list.idOf as (x: unknown) => string)(x) !== id);
    if (json != null) items.unshift(JSON.parse(json));
    store.set(list.key, JSON.stringify(items));
    return;
  }
  if (kind === 'setting') {
    if (json == null) store.remove(id);
    else if (RAW_SETTINGS.has(id)) {
      const v = JSON.parse(json);
      if (typeof v === 'string') store.set(id, v); // back to plain text, as the app reads it
    } else store.set(id, json);
    return;
  }
  const p = PER.find((x) => x.kind === kind);
  if (!p) return;
  if (json == null) store.remove(p.prefix + id);
  else store.set(p.prefix + id, json);
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  at: string;
  /** rows the server refused this time (tried again next sync) and why */
  failed?: number;
  error?: string;
  /** rows of this player on the server – the same on every device once all are synced */
  server?: number;
}

/**
 * One sync: what changed on the device goes up, what changed elsewhere comes down. When both changed, a round or a
 * game keeps the version with more entered (the other is kept in the bin), a setting keeps this device's.
 * A row deleted elsewhere: a round or game goes to this device's bin (the bin row comes down by itself).
 */
export async function syncOnce(store: LocalStore, remote: Remote, now = () => new Date().toISOString()): Promise<SyncResult> {
  const meta = parse<Meta>(store.get(META), {});
  const local = localItems(store);
  const rows = await remote.list();
  const remoteBy = new Map(rows.map((r) => [k(r.kind, r.id), r]));
  const push: Row[] = [];
  const pullKeys: { kind: string; id: string }[] = [];
  const deletedRemote: { kind: string; id: string }[] = [];
  const at = now();

  for (const key of new Set([...local.keys(), ...remoteBy.keys()])) {
    const l = local.get(key);
    const r = remoteBy.get(key);
    const m = meta[key];
    const localChanged = l != null && (!m || m.hash !== hashOf(l.json));
    // any other time stamp than the one last seen or sent is a change elsewhere – never "later than": the time comes
    // from the other device's clock, and a PC a minute behind the iPhone was never newer (Sascha 17.10.2026)
    const remoteChanged = r != null && (!m || r.updated_at !== m.at);
    if (l && !r) {
      push.push({ kind: l.kind, id: l.id, data: JSON.parse(l.json), updated_at: at, deleted: false });
    } else if (!l && r) {
      if (r.deleted) continue;
      if (m && !remoteChanged) {
        // gone on this device since the last sync (deleted or emptied from the bin): gone everywhere
        push.push({ kind: r.kind, id: r.id, updated_at: at, deleted: true });
      } else pullKeys.push({ kind: r.kind, id: r.id });
    } else if (l && r) {
      if (r.deleted && remoteChanged && !localChanged) deletedRemote.push({ kind: l.kind, id: l.id });
      else if (localChanged && !remoteChanged) push.push({ kind: l.kind, id: l.id, data: JSON.parse(l.json), updated_at: at, deleted: false });
      else if (remoteChanged && !localChanged) pullKeys.push({ kind: r.kind, id: r.id });
      else if (localChanged && remoteChanged) pullKeys.push({ kind: r.kind, id: r.id }); // decided after the fetch
    }
  }

  let pulled = 0;
  const fetched = pullKeys.length ? await remote.fetch(pullKeys) : [];
  for (const r of fetched) {
    const key = k(r.kind, r.id);
    const l = local.get(key);
    const m = meta[key];
    if (r.deleted) {
      if (l != null && m != null && m.hash !== hashOf(l.json)) push.push({ kind: r.kind, id: r.id, data: JSON.parse(l.json), updated_at: at, deleted: false }); // edited here after it was deleted there: kept
      else if (l != null) deletedRemote.push({ kind: r.kind, id: r.id });
      continue;
    }
    const json = JSON.stringify(r.data);
    if (l != null && hashOf(l.json) === hashOf(json)) {
      meta[key] = { hash: hashOf(l.json), at: r.updated_at }; // the same on both sides
      continue;
    }
    const conflict = l != null && m != null && m.hash !== hashOf(l.json) && r.updated_at !== m.at;
    if (conflict || (l != null && !m)) {
      // changed on both sides: rounds and games keep the fuller one, a setting this device's (the newer edit).
      // Met for the first time (a new device): a setting takes the server's – a fresh phone must not overwrite the bag.
      const keepLocal = r.kind === 'setting' || r.kind === 'course' ? conflict : fullness(l!.json) > fullness(json);
      if (keepLocal) {
        push.push({ kind: r.kind, id: r.id, data: JSON.parse(l!.json), updated_at: at, deleted: false });
        continue;
      }
      // the other device's version wins: this device's is kept aside, never lost
      if (conflict && r.kind !== 'setting' && r.kind !== 'course') {
        const kept = parse<{ kind: string; id: string; at: string; data: unknown }[]>(store.get(CONFLICTS), []);
        kept.push({ kind: r.kind, id: r.id, at, data: JSON.parse(l!.json) });
        store.set(CONFLICTS, JSON.stringify(kept));
      }
    }
    // a setting of this device replaced by another device's: kept aside, never lost – the player can keep this
    // device's instead (Sascha 16.10.2026: the iPhone, his main device, synced last)
    // (only when this device meets the row for the first time – an ordinary change from the other device is no news)
    if (r.kind === 'setting' && l != null && !m) {
      const kept = parse<Record<string, { value: string; at: string }>>(store.get(REPLACED), {});
      const raw = store.get(r.id);
      if (raw != null) kept[r.id] = { value: raw, at };
      store.set(REPLACED, JSON.stringify(kept));
    }
    apply(store, r.kind, r.id, json);
    meta[key] = { hash: hashOf(localItems(store).get(key)?.json ?? json), at: r.updated_at };
    pulled++;
  }
  // deleted elsewhere: rounds and games into this device's bin, the rest removed
  for (const d of deletedRemote) {
    const key = k(d.kind, d.id);
    const l = local.get(key)!;
    if (d.kind === 'round' || d.kind === 'game') {
      const binKind = d.kind === 'round' ? 'trash-round' : 'trash-game';
      const entry = d.kind === 'round' ? { round: JSON.parse(l.json), keys: {}, deletedAt: at } : { game: JSON.parse(l.json), deletedAt: at };
      if (!local.has(k(binKind, d.id))) apply(store, binKind, d.id, JSON.stringify(entry));
    }
    apply(store, d.kind, d.id, null);
    meta[key] = { hash: '', at: remoteBy.get(key)!.updated_at };
    pulled++;
  }

  const refused = push.length ? ((await remote.upsert(push)) ?? []) : [];
  const failedKeys = new Set(refused.map((f) => k(f.row.kind, f.row.id)));
  const sent = push.filter((p) => !failedKeys.has(k(p.kind, p.id)));
  for (const p of sent) meta[k(p.kind, p.id)] = { hash: p.deleted ? '' : hashOf(JSON.stringify(p.data)), at: p.updated_at };
  // a pushed setting or list entry: its fingerprint as the device stores it
  const after = localItems(store);
  for (const p of sent) if (!p.deleted && after.get(k(p.kind, p.id))) meta[k(p.kind, p.id)].hash = hashOf(after.get(k(p.kind, p.id))!.json);
  store.set(META, JSON.stringify(meta));
  const server = new Set([...rows.filter((r) => !r.deleted).map((r) => k(r.kind, r.id)), ...sent.filter((p) => !p.deleted).map((p) => k(p.kind, p.id))]).size;
  return { pushed: sent.length, pulled, at, server, ...(refused.length ? { failed: refused.length, error: refused[0].error } : {}) };
}

/** How much a round or game holds: entered scores and shots – the fuller version wins a conflict. */
function fullness(json: string): number {
  // a signed round or a confirmed game is the finished one – it wins over the same round edited elsewhere (night 17.10.2026)
  return (json.match(/"strokes":\d/g)?.length ?? 0) * 10 + (json.match(/"pos":/g)?.length ?? 0) + (json.match(/"finishedAt":"/g)?.length ?? 0) * 100 + (json.match(/"signedAt":"/g)?.length ?? 0) * 1000;
}

// ---------- the browser side: localStorage and Supabase (REST, no library) ----------

/** Filled in once the Supabase project exists (Sascha): the project URL and its public (anon) key. */
export const SUPABASE_URL: string = 'https://rgisfnilwehnqpmbrxmp.supabase.co'; // Sascha's project (EU, Ireland)
export const SUPABASE_KEY: string = 'sb_publishable_41ASfBWeORDK7Mlql3pZyA_XjmtGWvC'; // public key – the row rule protects the data
export const syncConfigured = (): boolean => SUPABASE_URL !== '' && SUPABASE_KEY !== '';

export const browserStore: LocalStore = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, v) => {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* storage full */
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* blocked */
    }
  },
  keys: () => {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(Boolean);
    } catch {
      return [];
    }
  },
};

const AUTH = 'golfos.auth.v1';
export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds
  email: string | null;
  name: string | null;
  /** the account's user name for signing in with user name + password (null: Google only, none set yet) */
  username?: string | null;
}
export const loadSession = (): Session | null => parse<Session | null>(browserStore.get(AUTH), null);
const saveSession = (s: Session | null) => (s ? browserStore.set(AUTH, JSON.stringify(s)) : browserStore.remove(AUTH));

/** "Sign in with Google": Supabase sends the player to Google and back to the app with the tokens in the address. */
export function signIn(): void {
  const back = location.origin + location.pathname;
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}
export function signOut(): void {
  liveClose();
  saveSession(null);
  browserStore.remove(META);
}

/** Back from Google: the tokens stand in the address (#access_token=…) – keep them, clean the address. */
export async function finishSignIn(): Promise<Session | null> {
  if (!location.hash.includes('access_token=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  if (!access || !refresh) return null;
  const s: Session = { access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') ?? 3600), email: null, name: null };
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access}` } }).then((r) => r.json());
    s.email = u.email ?? null;
    s.name = u.user_metadata?.full_name ?? u.user_metadata?.name ?? null;
    s.username = await ownName(access);
    // the first name, last name and photo from Google into the profile – fields the player filled stay his
    const p = loadProfile();
    const parts = (s.name ?? '').trim().split(/\s+/).filter(Boolean);
    const photo: string | undefined = u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? undefined;
    saveProfile({
      ...p,
      firstName: p.firstName || parts[0] || '',
      lastName: p.lastName || parts.slice(1).join(' '),
      photo: p.photo || photo,
    });
  } catch {
    /* the name comes later */
  }
  saveSession(s);
  return s;
}

// ---------- Sign in with a user name (or e-mail) and password, besides Google ----------
// Sascha 22.10.2026: "as in Schlaufuchs". An account once (user name, e-mail, password), then on every device with user
// name + password. Supabase knows e-mail + password only: the server finds the e-mail to a user name – only with the
// right password (supabase/golfos-login.sql). Signed in with Google, a user name and password can be set later.

export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,19}$/;
export const PASSWORD_MIN = 8;
export const normName = (s: string): string => s.trim().toLowerCase();

const authHeaders = (bearer?: string): Record<string, string> => ({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) });

/** What Supabase answered, in the player's words. */
async function authProblem(r: Response): Promise<Error> {
  const j = (await r.json().catch(() => ({}))) as { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string };
  const code = String(j.error_code ?? j.code ?? '');
  const text = `${j.msg ?? j.message ?? j.error_description ?? ''}`;
  const say = (en: string, de: string) => new Error(tr(en, de));
  if (code === 'user_already_exists' || /already registered/i.test(text)) return say('There is an account with this e-mail already – please sign in.', 'Mit dieser E-Mail gibt es schon ein Konto – bitte anmelden.');
  if (code === 'invalid_credentials' || /invalid login/i.test(text)) return say('User name or password is not right.', 'Benutzername oder Passwort stimmt nicht.');
  if (code === 'weak_password' || (/password/i.test(text) && /least|short|weak/i.test(text))) return say(`The password is too short – at least ${PASSWORD_MIN} characters.`, `Das Passwort ist zu kurz – mindestens ${PASSWORD_MIN} Zeichen.`);
  if (code === 'email_address_invalid' || /email.*invalid/i.test(text)) return say('This e-mail address does not work.', 'Diese E-Mail-Adresse funktioniert nicht.');
  if (code === 'over_request_rate_limit' || r.status === 429) return say('Too many tries – please again in a few minutes.', 'Zu viele Versuche – bitte in ein paar Minuten noch einmal.');
  if (code === 'email_not_confirmed') return say('The e-mail is not confirmed yet.', 'Die E-Mail ist noch nicht bestätigt.');
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return say('Accounts with e-mail are not switched on yet.', 'Konten mit E-Mail sind noch nicht eingeschaltet.');
  if (code === '23505' || /duplicate|unique/i.test(text) || /database error saving new user/i.test(text)) return say('This user name is taken.', 'Dieser Benutzername ist schon vergeben.');
  if (/too_many_attempts/.test(text)) return say('Too many wrong tries – please again in 15 minutes.', 'Zu viele falsche Versuche – bitte in 15 Minuten noch einmal.');
  if (r.status === 404 && /function|golfos_/i.test(text)) return say('Signing in with a user name is not set up on the server yet.', 'Die Anmeldung mit Benutzername ist auf dem Server noch nicht eingerichtet.');
  return say(`Sign-in failed (${r.status}).`, `Anmeldung fehlgeschlagen (${r.status}${text ? `: ${text.slice(0, 80)}` : ''}).`);
}

async function rpc<T>(fn: string, args: Record<string, unknown>, bearer?: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: authHeaders(bearer), body: JSON.stringify(args) });
  if (!r.ok) throw await authProblem(r);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** The account's user name (null: none set). */
async function ownName(bearer: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/golfos_names?select=username`, { headers: authHeaders(bearer) });
    if (!r.ok) return null;
    return ((await r.json()) as { username: string }[])[0]?.username ?? null;
  } catch {
    return null;
  }
}

/** Supabase answered with the keys: signed in, then sync at once. */
async function startSession(j: { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string } }): Promise<void> {
  if (!j.access_token || !j.refresh_token) throw new Error(tr('The account is created but has to be confirmed by e-mail first.', 'Das Konto ist angelegt, muss aber erst per E-Mail bestätigt werden.'));
  browserStore.remove(META); // possibly another account than before on this device: a full sync
  saveSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), email: j.user?.email ?? null, name: null, username: await ownName(j.access_token) });
  noteSyncError(null);
  void syncNow();
}

/** Sign in: user name (or e-mail) and password. */
export async function signInWithPassword(login: string, password: string): Promise<void> {
  let email = login.trim();
  if (!email.includes('@')) {
    const found = await rpc<string | null>('golfos_login_email', { p_username: normName(login), p_password: password });
    if (!found) throw new Error(tr('User name or password is not right.', 'Benutzername oder Passwort stimmt nicht.'));
    email = found;
  }
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, password }) });
  if (!r.ok) throw await authProblem(r);
  await startSession(await r.json());
}

/** A new account: user name, e-mail, password – this device is signed in afterwards. */
export async function signUp(username: string, email: string, password: string): Promise<void> {
  const name = normName(username);
  if (!USERNAME_RULE.test(name)) throw new Error(tr('User name: 3–20 characters, letters a–z, digits, dot, dash.', 'Benutzername: 3–20 Zeichen, nur Buchstaben a–z, Ziffern, Punkt, Strich.'));
  if (password.length < PASSWORD_MIN) throw new Error(tr(`The password is too short – at least ${PASSWORD_MIN} characters.`, `Das Passwort ist zu kurz – mindestens ${PASSWORD_MIN} Zeichen.`));
  if (!(await rpc<boolean>('golfos_name_free', { p_username: name }))) throw new Error(tr('This user name is taken.', 'Dieser Benutzername ist schon vergeben.'));
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email.trim(), password, data: { golfos_username: name } }) });
  if (!r.ok) throw await authProblem(r);
  const j = await r.json();
  await startSession(j.access_token ? j : { ...j, user: j });
}

/** Signed in (e.g. with Google): set or change user name and password – for signing in on the other devices. */
/** Deletes the own account on the server – synced data, user name, the account (final list, Sascha 22.10.2026). The
 *  data on this phone stay; afterwards the player is signed out. Needs supabase/golfos-delete-account.sql once. */
export async function deleteAccount(): Promise<void> {
  const t = await authToken();
  if (!t) throw new Error(tr('Please sign in again first.', 'Bitte zuerst neu anmelden.'));
  try {
    await rpc('golfos_delete_me', {}, t);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not set up|nicht eingerichtet|404/.test(m)) throw new Error(tr('Deleting the account is not set up on the server yet.', 'Konto löschen ist auf dem Server noch nicht eingerichtet.'));
    throw e;
  }
  signOut();
}

export async function setLogin(username: string | null, password: string | null): Promise<void> {
  const t = await authToken();
  if (!t) throw new Error(tr('Please sign in again first.', 'Bitte zuerst neu anmelden.'));
  if (username != null) {
    const name = normName(username);
    if (!USERNAME_RULE.test(name)) throw new Error(tr('User name: 3–20 characters, letters a–z, digits, dot, dash.', 'Benutzername: 3–20 Zeichen, nur Buchstaben a–z, Ziffern, Punkt, Strich.'));
    if (name !== loadSession()?.username) await rpc('golfos_set_username', { p_username: name }, t);
  }
  if (password != null) {
    if (password.length < PASSWORD_MIN) throw new Error(tr(`The password is too short – at least ${PASSWORD_MIN} characters.`, `Das Passwort ist zu kurz – mindestens ${PASSWORD_MIN} Zeichen.`));
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: authHeaders(t), body: JSON.stringify({ password }) });
    if (!r.ok) throw await authProblem(r);
  }
  const s = loadSession();
  if (s) saveSession({ ...s, username: await ownName(t) });
}

/** A valid access token – refreshed when it runs out (a token lives an hour). One refresh at a time: two at once
 *  (sync and a shared game) would use the same refresh token twice, and the second would sign the player out. */
let refreshing: Promise<string | null> | null = null;
export async function authToken(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) {
        const why = await r.text().catch(() => '');
        // the login is really gone (signed out elsewhere, revoked): sign in again – said in the profile
        if ((r.status === 400 || r.status === 401) && /invalid|not found|revoked/i.test(why) && !/already used/i.test(why)) {
          saveSession(null);
          noteSyncError(tr('Signed out – please sign in again.', 'Abgemeldet – bitte neu anmelden.'));
        }
        return null;
      }
      const j = await r.json();
      const next = { ...s, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600) };
      saveSession(next);
      return next.access_token as string;
    } catch {
      return null; // offline
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Below the server's request size limit: rows go in packets of at most ~700 KB (a GPS track can be 0.5 MB). */
const PACKET_BYTES = 700_000;
export function packets<T>(items: T[], size: (x: T) => number, max = PACKET_BYTES, maxCount = 50): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const x of items) {
    const b = size(x);
    if (cur.length && (bytes + b > max || cur.length >= maxCount)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(x);
    bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}

function supabaseRemote(bearer: string): Remote {
  const base = `${SUPABASE_URL}/rest/v1/golfos_items`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
  const ok = async (r: Response) => {
    if (!r.ok) throw new Error(`sync ${r.status}`);
    return r;
  };
  return {
    list: async () => {
      // the server hands out at most 1000 rows per request: page through all of them
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const page: Row[] = await (await ok(await fetch(`${base}?select=kind,id,updated_at,deleted&order=kind,id&limit=1000&offset=${from}`, { headers }))).json();
        all.push(...page);
        if (page.length < 1000) return all;
      }
    },
    fetch: async (keys) => {
      const out: Row[] = [];
      const byKind = new Map<string, string[]>();
      for (const x of keys) byKind.set(x.kind, [...(byKind.get(x.kind) ?? []), x.id]);
      for (const [kind, ids] of byKind)
        for (let i = 0; i < ids.length; i += 50) {
          const list = ids.slice(i, i + 50).map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
          out.push(...(await (await ok(await fetch(`${base}?select=kind,id,data,updated_at,deleted&kind=eq.${encodeURIComponent(kind)}&id=in.(${encodeURIComponent(list)})`, { headers }))).json()));
        }
      return out;
    },
    upsert: async (rows) => {
      const body = (r: Row) => ({ kind: r.kind, id: r.id, data: r.data ?? {}, updated_at: r.updated_at, deleted: !!r.deleted });
      const send = (list: Row[]) => fetch(`${base}?on_conflict=user_id,kind,id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list.map(body)) });
      const why = async (x: Response) => `${x.status} ${(await x.text().catch(() => '')).slice(0, 120)}`.trim();
      const failed: { row: Row; error: string }[] = [];
      for (const chunk of packets(rows, (r) => JSON.stringify(body(r)).length)) {
        const r = await send(chunk);
        if (r.ok) continue;
        if (r.status === 401) throw new Error('sync 401'); // the login: nothing goes through – try again later
        // one refused row must not block the others: one by one, and note which ones the server refuses
        if (chunk.length === 1) {
          failed.push({ row: chunk[0], error: await why(r) });
          continue;
        }
        for (const row of chunk) {
          const one = await send([row]);
          if (!one.ok) failed.push({ row, error: await why(one) });
        }
      }
      return failed;
    },
  };
}

const LAST = 'golfos.sync.last.v1';
export const lastSync = (): string | null => browserStore.get(LAST);
/** What went wrong at the last sync (Sascha 16.10.2026: "the iPhone's round is not on the PC" – it said nothing). */
const LAST_ERROR = 'golfos.sync.error.v1';
export const lastSyncError = (): { at: string; text: string } | null => parse<{ at: string; text: string } | null>(browserStore.get(LAST_ERROR), null);
function noteSyncError(text: string | null): void {
  if (text) browserStore.set(LAST_ERROR, JSON.stringify({ at: new Date().toISOString(), text }));
  else browserStore.remove(LAST_ERROR);
}
let running: Promise<SyncResult | null> | null = null;
let again = false; // a change came while a sync was running: one more right after
let inSync = false; // a change during a sync waits for the round right after it

/** Syncs now if signed in and online; tells the app to reload what came down. One at a time. */
export function syncNow(): Promise<SyncResult | null> {
  if (!syncConfigured() || !loadSession() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const t = await authToken();
      if (!t) return null;
      inSync = true;
      const res = await syncOnce(browserStore, supabaseRemote(t)).finally(() => (inSync = false));
      browserStore.set(LAST, res.at);
      noteSyncError(res.failed ? tr(`${res.failed} entries were refused (${res.error}) – tried again at the next sync.`, `${res.failed} Einträge abgelehnt (${res.error}) – beim nächsten Abgleich erneut.`) : null);
      if (res.pushed) nudgeOthers(); // the other open devices fetch it right away
      if (res.pulled) {
        window.dispatchEvent(new Event('golfos:rounds-changed'));
        window.dispatchEvent(new Event('golfos:games-changed'));
        window.dispatchEvent(new Event('golfos:pulled'));
      }
      window.dispatchEvent(new Event('golfos:synced'));
      return res;
    } catch (e) {
      // offline or the server asleep – next time; anything else is shown in the profile
      if (typeof navigator === 'undefined' || navigator.onLine !== false) noteSyncError(tr(`Sync failed: ${(e as Error).message}`, `Abgleich fehlgeschlagen: ${(e as Error).message}`));
      window.dispatchEvent(new Event('golfos:synced'));
      return null;
    } finally {
      running = null;
      liveConnect();
      if (again) {
        again = false;
        syncSoon(500);
      }
    }
  })();
  return running;
}

let soon = 0;
/** A change was saved: sync in a few seconds (several changes in a row become one sync). Was 20 s – Sascha
 *  17.10.2026: "changed the handicap on the PC, the iPhone does not show it, not even after reloading". */
export function syncSoon(ms = 1000): void {
  if (!syncConfigured() || !loadSession()) return;
  window.clearTimeout(soon);
  soon = window.setTimeout(() => syncNow(), ms);
}

/** Is this device key one the sync carries (rounds, games, profile, bag, tracks, plans …)? */
export const isSyncedKey = (key: string): boolean =>
  SETTINGS.includes(key) || LISTS.some((l) => l.key === key) || PER.some((p) => key.startsWith(p.prefix));

/**
 * Every change to synced data starts a sync a few seconds later – the profile, the bag, the caddie settings and the
 * plans did not before (only rounds, games and Training did), so they waited for the 3-minute round.
 */
export function watchChanges(): void {
  if (typeof Storage === 'undefined' || (Storage.prototype as unknown as { __golfosWatched?: boolean }).__golfosWatched) return;
  const proto = Storage.prototype as unknown as { __golfosWatched?: boolean; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
  proto.__golfosWatched = true;
  const set = proto.setItem;
  const remove = proto.removeItem;
  proto.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, k, v);
    if (this === localStorage && isSyncedKey(k)) {
      if (inSync) again = true; // during a sync (its own writes too): one more round right after
      else syncSoon();
    }
  };
  proto.removeItem = function (this: Storage, k: string) {
    remove.call(this, k);
    if (this === localStorage && isSyncedKey(k)) {
      if (inSync) again = true; // during a sync (its own writes too): one more round right after
      else syncSoon();
    }
  };
}

// ---------- live: a change on one device reaches the others within seconds ----------
// Sascha 17.10.2026: "every 20 seconds is not enough, it has to be live". After a sync that sent something, the device
// sends a nudge on the player's own channel (Supabase Realtime broadcast – no data, only "something changed"); every
// other open device of the player hears it and syncs at once. Plain WebSocket (Phoenix protocol), no library.

let live: WebSocket | null = null;
let liveTopic = '';
let liveRef = 1;
let liveBeat = 0;
let liveRetry = 0;
let liveWait = 1000;

/** The player's id from the access token (its "sub") – the name of his channel. */
function userId(): string | null {
  const t = loadSession()?.access_token;
  if (!t) return null;
  try {
    const body = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(body + '==='.slice((body.length + 3) % 4))) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

/** Opens the live channel when signed in (again after a drop, with a growing pause); safe to call often. */
export function liveConnect(): void {
  if (typeof WebSocket === 'undefined' || !syncConfigured()) return;
  const id = userId();
  if (!id) return liveClose();
  const topic = `realtime:golfos-${id}`;
  if (live && liveTopic === topic && (live.readyState === WebSocket.OPEN || live.readyState === WebSocket.CONNECTING)) return;
  liveClose();
  liveTopic = topic;
  const ws = new WebSocket(`${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`);
  live = ws;
  const send = (event: string, payload: unknown, t = topic) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ topic: t, event, payload, ref: String(liveRef++) }));
  ws.onopen = () => {
    liveWait = 1000;
    send('phx_join', { config: { broadcast: { self: false }, presence: { key: '' }, private: false } });
    window.clearInterval(liveBeat);
    liveBeat = window.setInterval(() => send('heartbeat', {}, 'phoenix'), 25000);
  };
  ws.onmessage = (m) => {
    try {
      const d = JSON.parse(String(m.data)) as { event?: string; payload?: { event?: string } };
      if (d.event === 'broadcast' && d.payload?.event === 'changed') syncNow();
    } catch {
      /* not for us */
    }
  };
  ws.onclose = () => {
    if (live !== ws) return;
    live = null;
    window.clearInterval(liveBeat);
    window.clearTimeout(liveRetry);
    liveRetry = window.setTimeout(liveConnect, liveWait);
    liveWait = Math.min(liveWait * 2, 30000);
  };
}

export function liveClose(): void {
  window.clearTimeout(liveRetry);
  window.clearInterval(liveBeat);
  const ws = live;
  live = null;
  ws?.close();
}

function nudgeOthers(): void {
  if (!live || live.readyState !== WebSocket.OPEN) return liveConnect();
  live.send(JSON.stringify({ topic: liveTopic, event: 'broadcast', payload: { type: 'broadcast', event: 'changed', payload: {} }, ref: String(liveRef++) }));
}
