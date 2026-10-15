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
  upsert(rows: Row[]): Promise<void>;
}

const META = 'golfos.sync.meta.v1';
const ROUNDS = 'golfos.rounds.v1';
const TRASH = 'golfos.trash.v1';
const GAMES = 'golfos.games.v1';
const GAME_TRASH = 'golfos.games.trash.v1';
/** Single settings: the key on the device is the row id. */
const SETTINGS = ['golfos.profile.v1', 'golfos.bag.v1', 'golfos.bagstyle.v1', 'golfos.caddie.v1', 'golfos.partials.v1', 'golfos.unit.v1', 'golfos.friends.v1', 'golfos.lang.v1', 'golfos.me.v1'];
/** Per round or per course: a key prefix, the rest is the row id. */
const PER = [
  { kind: 'track', prefix: 'golfos.track.v1.' },
  { kind: 'caddielog', prefix: 'golfos.caddielog.v1.' },
  { kind: 'holenotes', prefix: 'golfos.holenotes.v1.' },
  { kind: 'holelines', prefix: 'golfos.holelines.v2.' },
  { kind: 'course', prefix: 'golfos.course.v1.' },
];
/** Lists of objects with an id: every entry is its own row. */
const LISTS = [
  { kind: 'round', key: ROUNDS, idOf: (x: { id: string }) => x.id },
  { kind: 'game', key: GAMES, idOf: (x: { id: string }) => x.id },
  { kind: 'trash-round', key: TRASH, idOf: (x: { round: { id: string } }) => x.round.id },
  { kind: 'trash-game', key: GAME_TRASH, idOf: (x: { game: { id: string } }) => x.game.id },
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
    if (v != null) out.set(k('setting', key), { kind: 'setting', id: key, json: v });
  }
  for (const key of store.keys()) {
    const p = PER.find((x) => key.startsWith(x.prefix));
    if (!p) continue;
    const v = store.get(key);
    if (v != null) out.set(k(p.kind, key.slice(p.prefix.length)), { kind: p.kind, id: key.slice(p.prefix.length), json: v });
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
    else store.set(id, json);
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
    const remoteChanged = r != null && (!m || r.updated_at > m.at);
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
    const conflict = l != null && m != null && m.hash !== hashOf(l.json) && r.updated_at > m.at;
    if (conflict || (l != null && !m)) {
      // changed on both sides: rounds and games keep the fuller one, a setting this device's (the newer edit).
      // Met for the first time (a new device): a setting takes the server's – a fresh phone must not overwrite the bag.
      const keepLocal = r.kind === 'setting' || r.kind === 'course' ? conflict : fullness(l!.json) > fullness(json);
      if (keepLocal) {
        push.push({ kind: r.kind, id: r.id, data: JSON.parse(l!.json), updated_at: at, deleted: false });
        continue;
      }
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

  if (push.length) await remote.upsert(push);
  for (const p of push) meta[k(p.kind, p.id)] = { hash: p.deleted ? '' : hashOf(JSON.stringify(p.data)), at: p.updated_at };
  // a pushed setting or list entry: its fingerprint as the device stores it
  const after = localItems(store);
  for (const p of push) if (!p.deleted && after.get(k(p.kind, p.id))) meta[k(p.kind, p.id)].hash = hashOf(after.get(k(p.kind, p.id))!.json);
  store.set(META, JSON.stringify(meta));
  return { pushed: push.length, pulled, at };
}

/** How much a round or game holds: entered scores and shots – the fuller version wins a conflict. */
function fullness(json: string): number {
  return (json.match(/"strokes":\d/g)?.length ?? 0) * 10 + (json.match(/"pos":/g)?.length ?? 0) + (json.match(/"finishedAt":"/g)?.length ?? 0) * 100;
}

// ---------- the browser side: localStorage and Supabase (REST, no library) ----------

/** Filled in once the Supabase project exists (Sascha): the project URL and its public (anon) key. */
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';
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
}
export const loadSession = (): Session | null => parse<Session | null>(browserStore.get(AUTH), null);
const saveSession = (s: Session | null) => (s ? browserStore.set(AUTH, JSON.stringify(s)) : browserStore.remove(AUTH));

/** "Sign in with Google": Supabase sends the player to Google and back to the app with the tokens in the address. */
export function signIn(): void {
  const back = location.origin + location.pathname;
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}
export function signOut(): void {
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
  } catch {
    /* the name comes later */
  }
  saveSession(s);
  return s;
}

/** A valid access token – refreshed when it runs out (a token lives an hour). */
async function token(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) saveSession(null); // signed out elsewhere
    return null;
  }
  const j = await r.json();
  const next = { ...s, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600) };
  saveSession(next);
  return next.access_token;
}

function supabaseRemote(bearer: string): Remote {
  const base = `${SUPABASE_URL}/rest/v1/golfos_items`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
  const ok = async (r: Response) => {
    if (!r.ok) throw new Error(`sync ${r.status}`);
    return r;
  };
  return {
    list: async () => (await ok(await fetch(`${base}?select=kind,id,updated_at,deleted`, { headers }))).json(),
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
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50).map((r) => ({ kind: r.kind, id: r.id, data: r.data ?? {}, updated_at: r.updated_at, deleted: !!r.deleted }));
        await ok(await fetch(`${base}?on_conflict=user_id,kind,id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) }));
      }
    },
  };
}

const LAST = 'golfos.sync.last.v1';
export const lastSync = (): string | null => browserStore.get(LAST);
let running: Promise<SyncResult | null> | null = null;

/** Syncs now if signed in and online; tells the app to reload what came down. One at a time. */
export function syncNow(): Promise<SyncResult | null> {
  if (!syncConfigured() || !loadSession() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(null);
  if (running) return running;
  running = (async () => {
    try {
      const t = await token();
      if (!t) return null;
      const res = await syncOnce(browserStore, supabaseRemote(t));
      browserStore.set(LAST, res.at);
      if (res.pulled) {
        window.dispatchEvent(new Event('golfos:rounds-changed'));
        window.dispatchEvent(new Event('golfos:games-changed'));
      }
      window.dispatchEvent(new Event('golfos:synced'));
      return res;
    } catch {
      return null; // offline or the server asleep – next time
    } finally {
      running = null;
    }
  })();
  return running;
}
