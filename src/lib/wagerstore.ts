import type { Round } from '../types';
import { loadRounds, newId } from './storage';
import { cachedEvent, isSigned, markerOf, type Cell } from './sharedround';
import { newCode } from './sharedgame';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { afterPayments, balances, dayOf, isPool, judge, withCounted, lower, playedRounds, sameName, sameProgress, shapeOf, wagerLabel, type EarlierBet, type PlayedRound, type PoolPlayer, type Progress, type Wager, type WagerPool } from './wagers';
import { pushBet } from './push';
import { prizeOf, prizeSym, type Prize } from './prize';
import { poolOfRound, roundsInPlay } from './poolround';

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
  const mine = meOf(pool, me || old?.me || meIn(code), myAccount());
  if (mine) rememberMe(code, mine);
  const host = owner ?? old?.owner;
  savePools([{ code, me: mine, pool, ...(host ? { owner: host } : {}) }, ...list.filter((e) => e.code !== code)]);
  claimInvited(code, pool, mine);
}

/** Who this phone is in the pool: the player kept – while he is still in it (the host linked him into another, Sascha
 *  06.11.2026: "Chris made by hand, Christopher joined – twice") –, else the player of this account, else the one the
 *  host invited this account as. '' – asked "who are you?". */
export function meOf(pool: WagerPool, kept: string | undefined, uid: string | null): string {
  if (kept && pool.players.some((p) => p.id === kept)) return kept;
  if (!uid) return '';
  return pool.players.find((p) => p.joined?.uid === uid)?.id ?? pool.players.find((p) => p.invited?.uid === uid && !p.joined?.uid)?.id ?? '';
}
/** Invited right at a player: this phone takes him – "joined" by its own account, as the server lets a phone do. */
const claiming = new Set<string>();
function claimInvited(code: string, pool: WagerPool, me: string): void {
  const uid = myAccount();
  const p = pool.players.find((x) => x.id === me);
  if (!uid || !p || p.joined?.uid || p.invited?.uid !== uid || claiming.has(code)) return;
  claiming.add(code);
  void joinPool(code, { id: me }, p.invited.name || p.name).finally(() => claiming.delete(code));
}

/** The host invites a linked friend right at a player (Sascha 06.11.2026) – kept on the player; the push goes as for
 *  the pool (InviteCard). The pool as written, or null. */
export const invitePlayer = (code: string, pid: string, friend: { uid: string; name: string }): Promise<WagerPool | null> =>
  changePool(code, (p) => ({ ...p, players: p.players.map((x) => (x.id === pid ? { ...x, invited: { uid: friend.uid, name: friend.name, at: new Date().toISOString() } } : x)) }));

/** A player who joined on his own phone as a new one, without bets, is the one the host made by hand (Sascha
 *  06.11.2026: "I made Chris by hand – now we are friends he is in twice; let me edit Chris"): the host gives `target`
 *  his account and takes `from` out. Only a player without bets or payments is taken out. */
export const canLinkInto = (pool: WagerPool, from: PoolPlayer): boolean =>
  !!from.joined?.uid && !pool.wagers.some((w) => w.player === from.id || w.opponent === from.id) && !(pool.payments ?? []).some((x) => x.from === from.id || x.to === from.id);
export const linkPlayer = (code: string, target: string, from: string): Promise<WagerPool | null> =>
  changePool(code, (p) => {
    const src = p.players.find((x) => x.id === from);
    if (!src || !canLinkInto(p, src) || !p.players.some((x) => x.id === target)) return null;
    return {
      ...p,
      players: p.players
        .filter((x) => x.id !== from)
        .map((x) => {
          if (x.id !== target) return x;
          const { invited: _invited, ...rest } = x;
          void _invited;
          return { ...rest, joined: src.joined, ...(!x.hcp && src.hcp ? { hcp: src.hcp } : {}) };
        }),
    };
  });

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
      // the player kept while he is still in the pool – else found by the account or the invitation (linked by the host)
      const mine = meOf(row.game, old?.me || meIn(row.code), me);
      claimInvited(row.code, row.game, mine);
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
export async function createPool(made: WagerPool, me: string): Promise<PoolEntry | null> {
  const pool = withCounted(made);
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
      const changed = change(rows[0].game);
      const next = changed && withCounted(changed);
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

/** Another player's round judged on this phone only where it kept his card as far as its owner's – this phone played
 *  for him; a partner's few holes would undercount him. */
function keptFor(r: Round, name: string): boolean {
  const him = r.players.find((p) => sameName(p.name, name));
  const me = r.players.find((p) => p.isMe);
  const n = (id?: string) => (id ? (r.entries[id] ?? []).filter((x) => x && (x.pickedUp || x.strokes != null)).length : 0);
  return !!him && !!me && him.id !== me.id && n(him.id) > 0 && n(him.id) >= n(me.id);
}
/** Another player's bet: this phone's judgement only when it knows more – more rounds, or a better result from as many
 *  (his own phone may have reported from rounds this one does not have). His own phone's always. */
function takes(w: Wager, me: string, old: Progress | undefined, now: Progress): boolean {
  if (w.player === me || !old) return true;
  if (shapeOf(w.kind) === 'duel') return (now.duels?.length ?? 0) > (old.duels?.length ?? 0);
  if (now.rounds !== old.rounds) return now.rounds > old.rounds;
  if (now.done !== old.done) return now.done;
  if (now.pending != null && old.pending == null) return true;
  return JSON.stringify(now.best) !== JSON.stringify(old.best) && now.best != null && (old.best == null || (lower(w) ? now.best < old.best : now.best > old.best));
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
      // the rounds of Rounds, and those in play from a pool (judged live – Sascha 02.11.2026)
      const kept = loadRounds();
      const all = [...kept, ...roundsInPlay().filter((r) => !kept.some((k) => k.id === r.id))];
      const rounds = playedRounds(all, countedRound, markerCount);
      for (const e of pools) {
        // "Einer für alle" (Sascha 04.11.2026): a round of this pool, started here – one phone keeps the score of all – counts
        // as marked once finished; else as ever (a shared flight's marker or scorer signed)
        const counted = e.pool.oneScorer ? (r: Round, pid: string) => countedRound(r, pid) || (!!r.finishedAt && poolOfRound(r.id) === e.code) : countedRound;
        const mineRounds = e.pool.oneScorer ? playedRounds(all, counted, markerCount) : rounds;
        // whose bets this phone judges: its owner's – the host's phone also the others', from the rounds on it with their
        // whole card (Sascha 02.11.2026: "one phone for all"); the server takes those only from the host
        const host = isHost(e);
        const roundsOf = new Map<string, PlayedRound[]>([[e.me, mineRounds]]);
        if (host)
          for (const p of e.pool.players)
            if (p.id !== e.me) roundsOf.set(p.id, playedRounds(all.filter((r) => keptFor(r, p.name)), counted, markerCount, p.name));
        const judged = (w: Wager) => roundsOf.has(w.player) && w.kind !== 'free';
        const mine = e.pool.wagers.filter(judged);
        const fresh = Object.fromEntries(mine.map((w) => [w.id, judge(w, e.pool, roundsOf.get(w.player)!)]));
        if (mine.every((w) => sameProgress(e.pool.progress[w.id], fresh[w.id]) || !takes(w, e.me, e.pool.progress[w.id], fresh[w.id]))) continue;
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
          for (const w of p.wagers.filter(judged)) {
            const now = judge(w, p, roundsOf.get(w.player)!); // the bet as it is on the server (changed meanwhile, maybe)
            if (sameProgress(progress[w.id], now) || !takes(w, e.me, progress[w.id], now)) continue;
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

// ---------- own bets for the library (Sascha 02.11.2026: "in the library to pick again and again") ----------

const MINE = 'golfos.mybets.v1';
/** An own bet kept on this phone: how it is built and its number. */
export type MyBet = { id: string; bet: Pick<Wager, 'metric' | 'compare' | 'where' | 'holesOf' | 'run' | 'target'> };
export function loadMyBets(): MyBet[] {
  try {
    const x = JSON.parse(localStorage.getItem(MINE) ?? '[]');
    return Array.isArray(x) ? x.filter((b) => b && typeof b.id === 'string' && b.bet && b.bet.metric) : [];
  } catch {
    return [];
  }
}
/** Keeps an own bet in "Meine Wetten" – once (the same built bet with another number replaces it). */
export function keepMyBet(bet: MyBet['bet'], id = String(Date.now())): MyBet {
  const key = (b: MyBet['bet']) => wagerLabel({ id: '', player: '', kind: 'custom', stake: 0, payout: 'success', attempts: 'any', ...b, target: 0 });
  const list = loadMyBets();
  const same = list.find((b) => key(b.bet) === key(bet));
  const kept: MyBet = { id: same?.id ?? id, bet };
  try {
    localStorage.setItem(MINE, JSON.stringify([kept, ...list.filter((b) => b.id !== kept.id)].slice(0, 100)));
  } catch {
    /* storage full – the bet itself is in the pool */
  }
  return kept;
}
export function forgetMyBet(id: string): void {
  try {
    localStorage.setItem(MINE, JSON.stringify(loadMyBets().filter((b) => b.id !== id)));
  } catch {
    /* kept */
  }
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

/** My balance in every pool on this phone, for the "Bilanz" (Sascha 03.11.2026: the balances of the games and the bets in
 *  one place): what I won or lost (provisional results counted, as in the settlement) and what of it is still open once
 *  the payments marked are off – positive: owed to me, negative: I owe. Deleted pools left out; the latest first. */
export function myPoolBalances(today = dayOf(new Date())): { code: string; name: string; running: boolean; amount: number; open: number; currency: 'EUR' | 'USD'; sym: string; prize: Prize }[] {
  return loadPools()
    .filter((e) => !e.pool.deletedAt && e.me && e.pool.players.some((p) => p.id === e.me))
    .sort((a, b) => b.pool.from.localeCompare(a.pool.from))
    .map((e) => {
      const bal = balances(e.pool, today, true);
      return {
        code: e.code,
        name: e.pool.name,
        running: isLive(e, today),
        amount: Math.round((bal[e.me] ?? 0) * 100) / 100,
        open: Math.round((afterPayments(bal, e.pool.payments)[e.me] ?? 0) * 100) / 100,
        currency: e.pool.currency ?? 'EUR',
        // what is played for (03.11.2026): "€", "$" – or "× Getränk"; the Bilanz adds up per sym
        sym: prizeSym(prizeOf(e.pool)),
        prize: prizeOf(e.pool),
      };
    });
}
