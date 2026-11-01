import type { Round } from '../types';
import { loadRounds, newId } from './storage';
import { cachedEvent, isSigned } from './sharedround';
import { newCode } from './sharedgame';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { isPool, judge, playedRounds, sameProgress, type EarlierBet, type PoolPlayer, type Wager, type WagerPool } from './wagers';
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
}

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
function keep(code: string, pool: WagerPool, me?: string): void {
  const list = loadPools();
  const old = list.find((e) => e.code === code);
  savePools([{ code, me: me ?? old?.me ?? '', pool }, ...list.filter((e) => e.code !== code)]);
}
/** Leaves a pool on this phone (it stays on the server for the others). */
export function forgetPool(code: string): void {
  savePools(loadPools().filter((e) => e.code !== code));
}

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
        keep(code, pool, me);
        return { code, me, pool };
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
      const r = await fetch(`${at}&select=game,updated_at`, { headers: h });
      if (!r.ok) return null;
      const rows = (await r.json()) as { game: unknown; updated_at?: string | null }[];
      if (!rows.length || !isPool(rows[0].game)) return null;
      const next = change(rows[0].game);
      if (!next) {
        keep(code, rows[0].game);
        return rows[0].game;
      }
      const seen = rows[0].updated_at ? `updated_at=eq.${encodeURIComponent(rows[0].updated_at)}` : 'updated_at=is.null';
      const w = await fetch(`${at}&${seen}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ game: next, updated_at: new Date().toISOString() }) });
      if (!w.ok) return null;
      if (((await w.json()) as unknown[]).length) {
        keep(code, next);
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
  const joined = { name: account, at: new Date().toISOString() };
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

/** Does a round count for a "counted" bet: a marker marked him and both signed the card (lib/sharedround.ts). */
export function countedRound(r: Round, pid: string): boolean {
  if (!r.shared) return false;
  const f = cachedEvent(r.shared.code)?.flights[r.shared.flight];
  return !!f && !!f.markers?.[pid] && isSigned(f, pid);
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
      const rounds = playedRounds(loadRounds(), countedRound);
      for (const e of pools) {
        const mine = e.pool.wagers.filter((w) => w.player === e.me && w.kind !== 'free');
        const fresh = Object.fromEntries(mine.map((w) => [w.id, judge(w, e.pool, rounds)]));
        if (mine.every((w) => sameProgress(e.pool.progress[w.id], fresh[w.id]))) continue;
        let made: string[] = []; // bets made with this report – everyone in the pool hears of it (push)
        const written = await changePool(e.code, (p) => {
          let changed = false;
          made = [];
          const progress = { ...p.progress };
          for (const w of p.wagers.filter((x) => x.player === e.me && x.kind !== 'free')) {
            const now = judge(w, p, rounds); // the bet as it is on the server (changed meanwhile, maybe)
            if (sameProgress(progress[w.id], now)) continue;
            if (now.done && !progress[w.id]?.done && !progress[w.id]?.manual) made.push(w.id);
            progress[w.id] = { ...now, ...(progress[w.id]?.manual ? { manual: progress[w.id].manual } : {}) };
            changed = true;
          }
          return changed ? { ...p, progress } : null;
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
