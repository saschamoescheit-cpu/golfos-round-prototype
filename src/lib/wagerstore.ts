import type { Round } from '../types';
import { loadRounds, newId } from './storage';
import { cachedEvent, isSigned, markerOf, type Cell } from './sharedround';
import { newCode } from './sharedgame';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { dayOf, isPool, judge, playedRounds, sameProgress, type EarlierBet, type PoolPlayer, type Wager, type WagerPool } from './wagers';
import { pushBet } from './push';

// The pools of bets on this phone and on the server (Sascha 01.11.2026). A pool lives in the table of the shared games
// (golfos_shared_games, JSON kind 'wager-pool', a 6-letter code as a game) – no new table. Every change is a function
// applied to the pool as it is on the server; the server takes it only if nobody wrote since it was read (else it is
// read and applied again) – two phones changing the pool at once lose nothing, as a round on several phones.

export interface PoolEntry {
  code: string;
  /** the pool player this phone's owner is */
  me: string;
  pool: WagerPool;
  /** the account that set the pool up (the row's owner on the server) – only it changes the bets (Sascha 01.11.2026) */
  owner?: string;
}

/** Is this phone's account the host of the pool – the one who set it up? The others see the bets and their phones
 *  report theirs, but only the host adds, changes, decides, deletes (Sascha 01.11.2026). */
export const isHost = (e: PoolEntry): boolean => !!e.owner && e.owner === myAccount();

const KEY = 'golfos.pools.v1';
export function loadPools(): PoolEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PoolEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.code && isPool(e.pool)) : [];
  } catch {
    return [];
  }
}
function savePools(list: PoolEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full – the pool is still on the server */
  }
  window.dispatchEvent(new Event('golfos:pools-changed'));
}
function keep(code: string, pool: WagerPool, me?: string, owner?: string): void {
  const list = loadPools();
  const old = list.find((e) => e.code === code);
  const mine = me || old?.me || meIn(code);
  if (mine) rememberMe(code, mine);
  const host = owner ?? old?.owner;
  savePools([{ code, me: mine, pool, ...(host ? { owner: host } : {}) }, ...list.filter((e) => e.code !== code)]);
}

// Who this account is in each pool – synced between its devices (lib/sync.ts, kind 'pool-me'): a new phone or the app
// knows it without asking, also for a pool joined before the account was kept in "joined". Only the code and the
// player's id – the pool itself always comes from the shared table.
const ME = 'golfos.pools.me.v1';
function meList(): { code: string; me: string }[] {
  try {
    const x = JSON.parse(localStorage.getItem(ME) ?? '[]');
    return Array.isArray(x) ? x.filter((e) => e && typeof e.code === 'string' && typeof e.me === 'string') : [];
  } catch {
    return [];
  }
}
const meIn = (code: string): string => meList().find((e) => e.code === code)?.me ?? '';
function rememberMe(code: string, me: string): void {
  const list = meList();
  if (list.some((e) => e.code === code && e.me === me)) return;
  try {
    localStorage.setItem(ME, JSON.stringify([...list.filter((e) => e.code !== code), { code, me }]));
  } catch {
    /* asked "who are you?" again on another device */
  }
}
/** Leaves a pool on this phone (it stays on the server) – and does not fetch it again (deleted for good from the bin). */
/** A pool still running – not ended, not deleted, its last day not past. */
export const isLive = (e: PoolEntry, today: string): boolean => !e.pool.deletedAt && !e.pool.finishedAt && e.pool.to >= today;
/** The pools running on this phone – on the start page and in the menu of Games (Sascha 01.11.2026). */
export const runningPools = (): PoolEntry[] => loadPools().filter((e) => isLive(e, dayOf(new Date())));

export function forgetPool(code: string): void {
  try {
    const hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN) ?? '[]') as string[]);
    hidden.add(code);
    localStorage.setItem(HIDDEN, JSON.stringify([...hidden]));
  } catch {
    /* fetched again next time */
  }
  savePools(loadPools().filter((e) => e.code !== code));
}
const HIDDEN = 'golfos.pools.hidden.v1';
const hiddenCodes = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

/** The signed-in account's id (from its token) – to find the own player in a pool on a new phone. */
export function myAccount(): string | null {
  try {
    const t = loadSession()?.access_token;
    if (!t) return null;
    const json = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * Every pool this account is in, fetched from the server (Sascha 01.11.2026: "the bets must never vanish"): the list on
 * the phone can be emptied – Safari clears the storage of a web app not used for a week, a new phone has none – the
 * pools stay on the server and come back here; the own player found by the account. Nothing on the phone is dropped.
 */
export async function syncPools(): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  try {
    const r = await fetch(`${table()}?select=code,game,owner&game->>kind=eq.wager-pool`, { headers: h });
    if (!r.ok) return false;
    const rows = (await r.json()) as { code: string; game: unknown; owner?: string }[];
    const me = myAccount();
    const hidden = hiddenCodes();
    const list = loadPools();
    let changed = false;
    for (const row of rows) {
      if (!row?.code || !isPool(row.game) || hidden.has(row.code)) continue;
      const old = list.find((e) => e.code === row.code);
      const mine = old?.me || meIn(row.code) || (me ? (row.game.players.find((p) => p.joined?.uid === me)?.id ?? '') : '');
      if (mine) rememberMe(row.code, mine); // also for a pool unchanged – to the account's other devices
      if (old && old.me === mine && old.owner === row.owner && JSON.stringify(old.pool) === JSON.stringify(row.game)) continue;
      const entry: PoolEntry = { code: row.code, me: mine, pool: row.game, ...(row.owner ? { owner: row.owner } : {}) };
      const at = list.findIndex((e) => e.code === row.code);
      if (at >= 0) list[at] = entry;
      else list.push(entry);
      changed = true;
    }
    if (changed) savePools(list);
    return true;
  } catch {
    return false;
  }
}

/** A pool deleted by mistake comes back – for everyone (it was only marked deleted). */
export const restorePool = (code: string): Promise<WagerPool | null> => changePool(code, (p) => ({ ...p, deletedAt: null }));

// ---------- the server ----------

const table = () => `${SUPABASE_URL}/rest/v1/golfos_shared_games`;
async function headers(): Promise<Record<string, string> | null> {
  if (!syncConfigured() || !loadSession()) return null;
  const t = await authToken();
  return t ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : null;
}

/** A new pool on the server; this phone's owner is `me`. The entry, or null (no connection). */
export async function createPool(pool: WagerPool, me: string): Promise<PoolEntry | null> {
  const h = await headers();
  if (!h) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: pool }) });
      if (r.ok) {
        const owner = myAccount() ?? undefined;
        keep(code, pool, me, owner);
        return { code, me, pool, ...(owner ? { owner } : {}) };
      }
      if (r.status !== 409) return null; // 409: the code is taken – another one
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Reads the pool and writes it back changed by `change` – only if nobody wrote in between (else read again, up to four
 * times). The pool as written (or as read when nothing changed); null when offline or it never got through.
 */
export async function changePool(code: string, change: (p: WagerPool) => WagerPool | null): Promise<WagerPool | null> {
  const h = await headers();
  if (!h) return null;
  const at = `${table()}?code=eq.${encodeURIComponent(code)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${at}&select=game,updated_at,owner`, { headers: h });
      if (!r.ok) return null;
      const rows = (await r.json()) as { game: unknown; updated_at?: string | null; owner?: string }[];
      if (!rows.length || !isPool(rows[0].game)) return null;
      const owner = rows[0].owner;
      const next = change(rows[0].game);
      if (!next) {
        keep(code, rows[0].game, undefined, owner);
        return rows[0].game;
      }
      const seen = rows[0].updated_at ? `updated_at=eq.${encodeURIComponent(rows[0].updated_at)}` : 'updated_at=is.null';
      const w = await fetch(`${at}&${seen}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ game: next, updated_at: new Date().toISOString() }) });
      if (!w.ok) return null;
      if (((await w.json()) as unknown[]).length) {
        keep(code, next, undefined, owner);
        return next;
      }
      // another phone wrote in between: read again
    } catch {
      return null;
    }
  }
  return null;
}

/** The pool as it is on the server now. */
export const refreshPool = (code: string): Promise<WagerPool | null> => changePool(code, () => null);

/** Joins a pool found by its code (Games' "Join a game"): as a player already in it, or as a new one by name. */
export async function joinPool(code: string, who: { id: string } | { name: string }, account: string): Promise<PoolEntry | null> {
  const id = 'id' in who ? who.id : newId();
  const uid = myAccount();
  const joined = { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) };
  const pool = await changePool(code, (p) => {
    const there = p.players.find((x) => x.id === id);
    const players: PoolPlayer[] = there ? p.players.map((x) => (x.id === id ? { ...x, joined } : x)) : [...p.players, { id, name: 'name' in who ? who.name.trim() : '?', joined }];
    return { ...p, players };
  });
  if (!pool) return null;
  keep(code, pool, id);
  return { code, me: id, pool };
}

// ---------- the bets judged on this phone ----------

/** Does a round count for a "counted" bet: a marker marked him – or the flight's scorer (Sascha 02.11.2026: "one
 *  person enters the score for all") – and both signed the card (lib/sharedround.ts). */
export function countedRound(r: Round, pid: string): boolean {
  if (!r.shared) return false;
  const f = cachedEvent(r.shared.code)?.flights[r.shared.flight];
  return !!f && !!markerOf(f, pid) && isSigned(f, pid);
}

/** The marker's count of a player in a round with a marker, as the event has it (his flight's row): each hole's score
 *  and details – what a bet "with marker" counts. With a scorer there is one count only: the scorer's, in the scores. */
export function markerCount(r: Round, pid: string): Cell[] | null {
  if (!r.shared) return null;
  const f = cachedEvent(r.shared.code)?.flights[r.shared.flight];
  if (!f) return null;
  return f.scorer && f.scorer !== pid ? (f.scores?.[pid] ?? null) : (f.marks?.[pid] ?? null);
}

let running: Promise<void> | null = null;
/**
 * Judges the bets of this phone's owner in every pool from his rounds and reports what changed (Sascha 01.11.2026:
 * "the app works out who made it"). Never throws – called after a round is saved, and when a pool is opened.
 */
export function reportWagers(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const pools = loadPools().filter((e) => e.me && !e.pool.finishedAt && !e.pool.deletedAt);
      if (!pools.length || !(await headers())) return;
      const rounds = playedRounds(loadRounds(), countedRound, markerCount);
      for (const e of pools) {
        const mine = e.pool.wagers.filter((w) => w.player === e.me && w.kind !== 'free');
        const fresh = Object.fromEntries(mine.map((w) => [w.id, judge(w, e.pool, rounds)]));
        if (mine.every((w) => sameProgress(e.pool.progress[w.id], fresh[w.id]))) continue;
        let made: string[] = []; // bets made with this report – everyone in the pool hears of it (push)
        const written = await changePool(e.code, (p) => {
          let changed = false;
          made = [];
          const progress = { ...p.progress };
          // the server takes a report only from the player's own account (supabase/golfos-shared-games.sql, the pool's
          // guard): a join from before the account was kept in "joined" gets it now
          const uid = myAccount();
          const stamp = !!uid && p.players.some((x) => x.id === e.me && x.joined && !x.joined.uid);
          const players = stamp ? p.players.map((x) => (x.id === e.me && x.joined && !x.joined.uid ? { ...x, joined: { ...x.joined, uid: uid! } } : x)) : p.players;
          for (const w of p.wagers.filter((x) => x.player === e.me && x.kind !== 'free')) {
            const now = judge(w, p, rounds); // the bet as it is on the server (changed meanwhile, maybe)
            if (sameProgress(progress[w.id], now)) continue;
            if (now.done && !progress[w.id]?.done && !progress[w.id]?.manual) made.push(w.id);
            progress[w.id] = { ...now, ...(progress[w.id]?.manual ? { manual: progress[w.id].manual } : {}) };
            changed = true;
          }
          return changed ? { ...p, progress, players } : null;
        });
        if (written) for (const id of made) pushBet(e.code, id);
      }
    } catch {
      /* offline or the server unsure – the next round or the next look at the pool tries again */
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------- bets set up before, as templates (Sascha 01.11.2026) ----------

const HISTORY = 'golfos.wagerhistory.v1'; // bets set up on this phone – kept when a pool is removed
/** Keeps bets set up on this phone as templates for later ("USA 2026 · Chris"). */
export function rememberBets(pool: WagerPool, wagers: Wager[]): void {
  const name = (id: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  try {
    const old = JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as EarlierBet[];
    const add = wagers.map((w) => ({ from: `${pool.name} · ${name(w.player)}`, wager: w }));
    localStorage.setItem(HISTORY, JSON.stringify([...add, ...(Array.isArray(old) ? old : [])].slice(0, 300)));
  } catch {
    /* storage full – the pools on this phone still offer their bets */
  }
}
/** The bets to pick from as templates: those of the pools on this phone (newest first), then those kept before. */
export function earlierBets(): EarlierBet[] {
  const fromPools = loadPools().flatMap((e) => e.pool.wagers.map((w) => ({ from: `${e.pool.name} · ${e.pool.players.find((p) => p.id === w.player)?.name ?? '?'}`, wager: w })));
  let kept: EarlierBet[] = [];
  try {
    const x = JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as EarlierBet[];
    kept = Array.isArray(x) ? x.filter((b) => b && b.wager && typeof b.from === 'string') : [];
  } catch {
    /* nothing kept */
  }
  return [...fromPools, ...kept];
}
