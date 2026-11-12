import type { Round } from '../types';
import { loadRounds, newId } from './storage';
import { cachedEvent, isSigned, markerOf, nameIs, refreshEvent, roundFromEvent, type Cell, type RoundEvent } from './sharedround';
import { loadTours } from './tourstore';
import { newCode } from './sharedgame';
import { tr } from './i18n';
import { loadProfile } from './profile';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { afterPayments, balances, owings, settleDebts, withDuels, cardsFor, dayOf, fromCards, inPool, mergeCards, mergeKept, openPoolTransfers, isPool, judge, withCounted, lower, playedRounds, sameName, sameProgress, shapeOf, wagerLabel, type EarlierBet, type PlayedRound, type PoolPlayer, type Progress, type Wager, type WagerPool } from './wagers';
import { pushBet, pushSettle } from './push';
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
/** The host takes a player's invitation back – or, once accepted, the phone off him (Sascha 09.11.2026: "the host takes
 *  an invitation back and sends it again; also one sent by mistake"): the player stays with his bets, without a phone;
 *  invited again, his phone takes him again. */
export const uninvitePlayer = (code: string, pid: string): Promise<WagerPool | null> =>
  changePool(code, (p) => {
    const x = p.players.find((q) => q.id === pid);
    if (!x || (!x.invited && !x.joined)) return null;
    return { ...p, players: p.players.map((q) => (q.id === pid ? withoutPhone(q) : q)) };
  });
export function withoutPhone(p: PoolPlayer): PoolPlayer {
  const { invited: _i, joined: _j, ...rest } = p;
  void _i;
  void _j;
  return rest;
}
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

/** The players made by hand whose invited account joined on its own as a new player (Sascha 09.11.2026: "Christopher
 *  is still in twice" – Chris invited as Christopher Glatting, who had joined as "Christopher" before): [made by hand,
 *  joined] – the host's phone links them, as "Wer ist Chris?" would. Only one without bets or payments goes. */
export function twinsOf(pool: WagerPool): [string, string][] {
  const out: [string, string][] = [];
  for (const p of pool.players) {
    if (!p.invited?.uid || p.joined?.uid) continue;
    const twin = pool.players.find((q) => q.id !== p.id && q.joined?.uid === p.invited!.uid);
    if (twin && canLinkInto(pool, twin) && !out.some(([, f]) => f === twin.id)) out.push([p.id, twin.id]);
  }
  return out;
}
const linking = new Set<string>();
function linkTwins(code: string, pool: WagerPool): void {
  if (linking.has(code)) return;
  const twins = twinsOf(pool);
  if (!twins.length) return;
  linking.add(code);
  void (async () => {
    for (const [target, from] of twins) await linkPlayer(code, target, from);
  })().finally(() => linking.delete(code));
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
      // the player kept while he is still in the pool – else found by the account or the invitation (linked by the host)
      const mine = meOf(row.game, old?.me || meIn(row.code), me);
      claimInvited(row.code, row.game, mine);
      if (me && row.owner === me && !row.game.deletedAt) linkTwins(row.code, row.game);
      if (mine) rememberMe(row.code, mine); // also for a pool unchanged – to the account's other devices
      if (old && old.me === mine && old.owner === row.owner && JSON.stringify(old.pool) === JSON.stringify(row.game)) continue;
      const entry: PoolEntry = { code: row.code, me: mine, pool: row.game, ...(row.owner ? { owner: row.owner } : {}) };
      const at = list.findIndex((e) => e.code === row.code);
      if (at >= 0) list[at] = entry;
      else list.push(entry);
      changed = true;
    }
    if (changed) savePools(list);
    tellSettlements(list);
    return true;
  } catch {
    return false;
  }
}

const SETTLE_TOLD = 'golfos.settlepush.v1';
/** Pools over – finished by hand, or their last day gone: what is still to give goes to the server (the app judges the
 *  bets), which sends every player the settlement once and, a day later, to who still has to pay what is open (Sascha
 *  07.11.2026). From this phone at most every six hours per pool, for ten days after its end. */
export function tellSettlements(list: PoolEntry[], now = Date.now()): string[] {
  const today = dayOf(new Date(now));
  let told: Record<string, number> = {};
  try {
    told = JSON.parse(localStorage.getItem(SETTLE_TOLD) ?? '{}') as Record<string, number>;
  } catch {
    /* told again */
  }
  const sent: string[] = [];
  for (const e of list) {
    if (!e.me || e.pool.deletedAt || isLive(e, today)) continue;
    const end = e.pool.finishedAt ? Date.parse(e.pool.finishedAt) : Date.parse(`${e.pool.to}T23:59:59`);
    if (!(now - end < 10 * 864e5) || now - (told[e.code] ?? 0) < 6 * 3600e3) continue;
    const jp = withDuels(e.pool); // the 5+5+10s from the cards, as the pool shows them
    pushSettle(e.code, openPoolTransfers(jp, balances(jp, today, true), settleDebts(jp, owings(jp, today, true))), prizeSym(prizeOf(jp)));
    told[e.code] = now;
    sent.push(e.code);
  }
  if (sent.length)
    try {
      localStorage.setItem(SETTLE_TOLD, JSON.stringify(told));
    } catch {
      /* storage full */
    }
  return sent;
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
  // entered afterwards by the host ("Scores eintragen"): counts like a signed card (Sascha 08.11.2026: "count fully")
  return !!f && (!!f.entered?.[pid] || (!!markerOf(f, pid) && isSigned(f, pid)));
}

// ---------- the tournaments' scores in the bets (Sascha 08.11.2026: Erik's "2/1" and nothing for the others – the
// rounds on the phones were missing after the app failed; the scores entered afterwards must count too) ----------

/** Which player of a flight is this pool player: the same account on a phone that played him, else the same name (or
 *  first name), else one name the beginning of the other ("Chris" – "Christopher") when only one player fits. */
export function flightPlayerOf(ev: RoundEvent, p: Pick<PoolPlayer, 'name' | 'joined' | 'invited'>): { flight: string; player: string } | null {
  const uid = p.joined?.uid ?? p.invited?.uid;
  const flights = Object.values(ev.flights).filter((f) => f.players.length);
  if (uid)
    for (const f of flights) {
      const ph = Object.values(f.phones ?? {}).find((x) => x.uid === uid && f.players.some((y) => y.id === x.player));
      if (ph) return { flight: f.id, player: ph.player };
    }
  const all = flights.flatMap((f) => f.players.map((x) => ({ flight: f.id, player: x.id, name: x.name })));
  const same = all.filter((x) => sameName(x.name, p.name) || nameIs(x.name, p.name));
  if (same.length === 1) return { flight: same[0].flight, player: same[0].player };
  if (same.length > 1) return null;
  const first = (s: string) => s.trim().toLowerCase().split(/\s+/)[0] ?? '';
  const a = first(p.name);
  const begins = a.length >= 4 ? all.filter((x) => { const b = first(x.name); return b.length >= 4 && (b.startsWith(a) || a.startsWith(b)); }) : [];
  return begins.length === 1 ? { flight: begins[0].flight, player: begins[0].player } : null;
}

/** A tournament's flight as a round of one pool player – his card as the flight row has it, on the tournament's day. */
export function tourRoundOf(ev: RoundEvent, code: string, day: string, p: Pick<PoolPlayer, 'name' | 'joined' | 'invited'>, today = dayOf(new Date())): Round | null {
  if (day > today) return null;
  const at = flightPlayerOf(ev, p);
  if (!at) return null;
  const r = roundFromEvent(ev, at.flight, at.player, code);
  if (!(r.entries[at.player] ?? []).some((e) => e.pickedUp || e.strokes != null)) return null;
  const f = ev.flights[at.flight];
  return { ...r, id: `tour-${code}-${at.flight}-${at.player}`, createdAt: `${day}T12:00:00`, finishedAt: f.finishedAt ?? (day < today ? `${day}T23:00:00` : null) };
}

/** The tournaments of the pool's days on this phone, read fresh – what their flights hold counts for the bets. */
async function poolTours(pools: PoolEntry[]): Promise<{ code: string; day: string; ev: RoundEvent }[]> {
  const from = pools.reduce((m, e) => (e.pool.from < m ? e.pool.from : m), '9999');
  const to = pools.reduce((m, e) => (e.pool.to > m ? e.pool.to : m), '0000');
  const today = dayOf(new Date());
  const out: { code: string; day: string; ev: RoundEvent }[] = [];
  for (const t of loadTours()) {
    if (t.ev.deletedAt || t.ev.date < from || t.ev.date > to || t.ev.date > today) continue;
    const ev = (await refreshEvent(t.code).catch(() => null)) ?? cachedEvent(t.code);
    if (ev) out.push({ code: t.code, day: t.ev.date, ev });
  }
  return out;
}

/** The marker's count of a player in a round with a marker, as the event has it (his flight's row): each hole's score
 *  and details – what a bet "with marker" counts. With a scorer there is one count only: the scorer's, in the scores. */
export function markerCount(r: Round, pid: string): Cell[] | null {
  if (!r.shared) return null;
  const f = cachedEvent(r.shared.code)?.flights[r.shared.flight];
  if (!f) return null;
  return f.scorer && f.scorer !== pid ? (f.scores?.[pid] ?? null) : (f.marks?.[pid] ?? null);
}

/** The opponents of the duels this phone's owner challenged and keeps the score of (Sascha 10.11.2026: "the
 *  challenger keeps both") – not declined. */
export function keptOpponents(pool: WagerPool, me: string): PoolPlayer[] {
  const ids = new Set(pool.wagers.filter((w) => fromCards(w) && w.player === me && w.scorer === 'by' && w.challenge?.state !== 'declined' && w.opponent).map((w) => w.opponent!));
  return pool.players.filter((p) => ids.has(p.id));
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
export function takes(w: Wager, me: string, old: Progress | undefined, now: Progress, pool?: Pick<WagerPool, 'from' | 'to' | 'rounds' | 'skip'>): boolean {
  if (w.player === me || !old) return true;
  // a round counted before that no longer counts – the host narrowed the pool's rounds (Sascha 10.11.2026: a test round
  // on the Hetzenhof made Moritz's bets, "nobody has made a bet yet"): the judgement anew
  // – not for a round the host took out (pool.skip, Sascha 12.11.2026): that one is only left out where shown and judged
  // (countedOnly, inPool); judged anew here, a phone without the others' rounds would wipe their bets
  if (pool && old.perRound?.some((r) => !inPool({ day: r.day, course: r.course }, { from: pool.from, to: pool.to, rounds: pool.rounds }, w))) return true;
  if (shapeOf(w.kind) === 'duel') return (now.duels?.length ?? 0) > (old.duels?.length ?? 0);
  // the standing per round (Sascha 09.11.2026: "only one round in the table"): a round more – from the host's phone too
  if ((now.perRound?.length ?? 0) > (old.perRound?.length ?? 0) && now.rounds >= old.rounds) return true;
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
      // the tournaments of the pools' days: a player's flight counts where this phone has no round of that tournament
      // for him (the round on his phone has his details – putts, greens – the flight row only what came along)
      const tours = await poolTours(pools);
      const fromTours = (rs: Round[], p: Pick<PoolPlayer, 'name' | 'joined' | 'invited'>): Round[] =>
        tours.map((t) => (rs.some((r) => r.shared?.code === t.code) ? null : tourRoundOf(t.ev, t.code, t.day, p))).filter((r): r is Round => !!r);
      for (const e of pools) {
        const meP = e.pool.players.find((x) => x.id === e.me);
        const allMine = meP ? [...all, ...fromTours(all, meP)] : all;
        const rounds = playedRounds(allMine, countedRound, markerCount);
        // "Einer für alle" (Sascha 04.11.2026): a round of this pool, started here – one phone keeps the score of all – counts
        // as marked once finished; else as ever (a shared flight's marker or scorer signed)
        const counted = e.pool.oneScorer ? (r: Round, pid: string) => countedRound(r, pid) || (!!r.finishedAt && poolOfRound(r.id) === e.code) : countedRound;
        const mineRounds = e.pool.oneScorer ? playedRounds(allMine, counted, markerCount) : rounds;
        // whose bets this phone judges: its owner's – the host's phone also the others', from the rounds on it with their
        // whole card (Sascha 02.11.2026: "one phone for all"); the server takes those only from the host
        const host = isHost(e);
        const roundsOf = new Map<string, PlayedRound[]>([[e.me, mineRounds]]);
        if (host)
          for (const p of e.pool.players)
            if (p.id !== e.me) {
              const his = all.filter((r) => keptFor(r, p.name));
              // his tournament flights too – the scores entered afterwards by the host count for him (Sascha 08.11.2026)
              roundsOf.set(p.id, [...playedRounds(his, counted, markerCount, p.name), ...playedRounds(fromTours(his, p), counted, markerCount)]);
            }
        // a duel challenged is judged from the cards (every phone alike) – not reported
        const judged = (w: Wager) => roundsOf.has(w.player) && w.kind !== 'free' && !fromCards(w);
        const mine = e.pool.wagers.filter(judged);
        const fresh = Object.fromEntries(mine.map((w) => [w.id, judge(w, e.pool, roundsOf.get(w.player)!)]));
        // the cards for the duels (Sascha 09.11.2026: "5+5+10 across flights – from the own round"): this phone's owner's
        // own, and – the host's phone – a player's who has none of his own for a round it holds
        const cardsNow = (p: WagerPool): WagerPool['cards'] | null => {
          const inDuel = (pid: string) => p.wagers.some((w) => fromCards(w) && w.challenge?.state !== 'declined' && (w.player === pid || w.opponent === pid));
          const cards = { ...(p.cards ?? {}) };
          let changed = false;
          for (const [pid, rs] of roundsOf) {
            if (!inDuel(pid) || (pid !== e.me && !host)) continue;
            const next = mergeCards(cards[pid], cardsFor(rs, p), pid !== e.me);
            if (JSON.stringify(next) === JSON.stringify(cards[pid] ?? [])) continue;
            cards[pid] = next;
            changed = true;
          }
          // the duels this phone's owner challenged and keeps the score of (Sascha 10.11.2026): his opponent's card from
          // the rounds on this phone he is in – never one of another phone
          for (const opp of keptOpponents(p, e.me)) {
            const his = all.filter((r) => keptFor(r, opp.name));
            if (!his.length) continue;
            const next = mergeKept(cards[opp.id], cardsFor(playedRounds(his, counted, markerCount, opp.name), p), e.me);
            if (JSON.stringify(next) === JSON.stringify(cards[opp.id] ?? [])) continue;
            cards[opp.id] = next;
            changed = true;
          }
          return changed ? cards : null;
        };
        // one's PayPal.me name to one's player in the pool – the others' settlement offers it (Sascha 10.11.2026)
        const pp = loadProfile().paypal || undefined;
        const ppStale = (p: WagerPool) => !!pp && !!myAccount() && p.players.some((x) => x.id === e.me && x.joined?.uid === myAccount() && x.joined.paypal !== pp);
        if (!ppStale(e.pool) && !cardsNow(e.pool) && mine.every((w) => sameProgress(e.pool.progress[w.id], fresh[w.id]) || !takes(w, e.me, e.pool.progress[w.id], fresh[w.id], e.pool))) continue;
        let made: string[] = []; // bets made with this report – everyone in the pool hears of it (push)
        const written = await changePool(e.code, (p) => {
          let changed = false;
          made = [];
          const progress = { ...p.progress };
          // the server takes a report only from the player's own account (supabase/golfos-shared-games.sql, the pool's
          // guard): a join from before the account was kept in "joined" gets it now
          const uid = myAccount();
          const stamp = !!uid && p.players.some((x) => x.id === e.me && x.joined && !x.joined.uid);
          const stamped = stamp ? p.players.map((x) => (x.id === e.me && x.joined && !x.joined.uid ? { ...x, joined: { ...x.joined, uid: uid! } } : x)) : p.players;
          const paypalNow = ppStale({ ...p, players: stamped });
          const players = paypalNow ? stamped.map((x) => (x.id === e.me && x.joined ? { ...x, joined: { ...x.joined, paypal: pp } } : x)) : stamped;
          if (paypalNow) changed = true;
          for (const w of p.wagers.filter(judged)) {
            const now = judge(w, p, roundsOf.get(w.player)!); // the bet as it is on the server (changed meanwhile, maybe)
            if (sameProgress(progress[w.id], now) || !takes(w, e.me, progress[w.id], now, p)) continue;
            if (now.done && !progress[w.id]?.done && !progress[w.id]?.manual) made.push(w.id);
            progress[w.id] = { ...now, ...(progress[w.id]?.manual ? { manual: progress[w.id].manual } : {}) };
            changed = true;
          }
          const cards = cardsNow(p);
          return changed || cards ? { ...p, progress, players, ...(cards ? { cards } : {}) } : null;
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

/** An opponent not in the pool yet (Sascha 10.11.2026: "linked friends, or players made as in a round"): a friend by
 *  his account – invited –, else a player without a phone. */
export type NewOpponent = { name: string; friend?: { uid: string; name: string }; hcp?: string };
/** The pool's player for an opponent: the one there already (by account, else by name), or a new one. */
export function opponentIn(pool: WagerPool, o: string | NewOpponent): { player: PoolPlayer; added: boolean } | null {
  if (typeof o === 'string') {
    const p = pool.players.find((x) => x.id === o);
    return p ? { player: p, added: false } : null;
  }
  const uid = o.friend?.uid;
  const there = (uid && pool.players.find((x) => x.joined?.uid === uid || x.invited?.uid === uid)) || pool.players.find((x) => sameName(x.name, o.name) && (!uid || (!x.joined?.uid && !x.invited?.uid)));
  if (there) return { player: there, added: false };
  const name = o.name.trim();
  if (!name) return null;
  return { player: { id: newId(), name, ...(o.hcp ? { hcp: o.hcp } : {}), ...(o.friend ? { invited: { uid: o.friend.uid, name: o.friend.name, at: new Date().toISOString() } } : {}) }, added: true };
}
/** A player without a phone: nobody joined as him, nobody invited – his duels count at once, the challenger keeps his score. */
export const phoneless = (p: PoolPlayer): boolean => !p.joined && !p.invited;

/** 5+5+10 against one or more players, each a duel of its own (Sascha 09.11.2026) – challenged by this phone's owner (the
 *  host as any player): open until the other accepts; a player without a phone at once. Opponents not in the pool yet
 *  come in (Sascha 10.11.2026): a friend invited, a player made here without a phone. `scorer`: who keeps the
 *  score (default the challenger, for both); `on`: the tournament of the day it is played in. The pool as written, the new
 *  duels and the friends to tell – or null. */
export async function challengeDuels(
  code: string,
  me: string,
  opponents: (string | NewOpponent)[],
  o: { day: string; parts: { front: number; back: number; total: number }; net: boolean; allowance?: number; by: string; scorer?: 'by' | 'own'; on?: Wager['on'] },
): Promise<{ pool: WagerPool; ids: string[]; invite: { uid: string; name: string }[] } | null> {
  const at = new Date().toISOString();
  let ids: string[] = [];
  let invite: { uid: string; name: string }[] = [];
  const pool = await changePool(code, (p) => {
    let players = p.players;
    const fresh: Wager[] = [];
    invite = [];
    for (const x of opponents) {
      const got = opponentIn({ ...p, players }, x);
      if (!got || got.player.id === me) continue;
      const opp = got.player;
      const w: Wager = {
        id: newId(),
        player: me,
        opponent: opp.id,
        kind: 'nassau',
        target: 0,
        stake: 0,
        payout: 'opponent',
        attempts: 'day',
        day: o.day,
        parts: o.parts,
        ...(o.net ? { net: true, ...(o.allowance != null && o.allowance !== 100 ? { allowance: o.allowance } : {}) } : {}),
        // without a phone he keeps no card – the challenger keeps it
        scorer: phoneless(opp) ? 'by' : (o.scorer ?? 'by'),
        ...(o.on ? { on: o.on } : {}),
        by: o.by,
        challenge: { state: phoneless(opp) ? 'accepted' : 'open', at },
      };
      if (p.wagers.some((y) => sameDuel(y, w)) || fresh.some((y) => sameDuel(y, w))) continue;
      if (got.added) {
        players = [...players, opp];
        if (opp.invited) invite.push({ uid: opp.invited.uid, name: opp.name });
      }
      fresh.push(w);
    }
    ids = fresh.map((w) => w.id);
    return fresh.length ? { ...p, players, wagers: [...p.wagers, ...fresh] } : null;
  });
  return pool ? { pool, ids, invite } : null;
}
/** The same duel already there – the two of them, on that day, not declined (either one challenged). */
export const sameDuel = (a: Wager, b: Pick<Wager, 'player' | 'opponent' | 'day'>): boolean =>
  shapeOf(a.kind) === 'duel' && a.challenge?.state !== 'declined' && a.day === b.day && ((a.player === b.player && a.opponent === b.opponent) || (a.player === b.opponent && a.opponent === b.player));
/** The challenged one answers: accepted – it counts – or declined. */
export const answerDuel = (code: string, id: string, state: 'accepted' | 'declined'): Promise<WagerPool | null> =>
  changePool(code, (p) => {
    const w = p.wagers.find((x) => x.id === id);
    if (!w || w.challenge?.state !== 'open') return null;
    return { ...p, wagers: p.wagers.map((x) => (x.id === id ? { ...x, challenge: { state, at: new Date().toISOString() } } : x)) };
  });
/** Taken back by who challenged – while not accepted. */
export const takeBackDuel = (code: string, id: string): Promise<WagerPool | null> =>
  changePool(code, (p) => {
    const w = p.wagers.find((x) => x.id === id);
    if (!w || !w.challenge || w.challenge.state === 'accepted') return null;
    const { [id]: _gone, ...progress } = p.progress;
    void _gone;
    return { ...p, wagers: p.wagers.filter((x) => x.id !== id), progress };
  });
/** The pool a duel of `day` goes into (Sascha 10.11.2026: "a side bet from Rounds into the pool of the day – without one
 *  the app makes one"): the first one running then with this phone's owner in it – else a new one of that day, he its
 *  host and its only player ("Sidebets 10.11."). Null offline. */
export async function poolForDuel(day: string, o: { me: string; currency?: string; /** "without a pool of bets" (Sascha 10.11.2026): a pool of its own for these duels, named "5+5+10 · 10.11." */ own?: boolean }): Promise<PoolEntry | null> {
  const there = o.own ? null : duelPoolsOn(day)[0];
  if (there) return there;
  const uid = myAccount();
  const at = new Date().toISOString();
  const pool: WagerPool = {
    kind: 'wager-pool',
    id: newId(),
    name: o.own ? `5+5+10 · ${day.slice(8, 10)}.${day.slice(5, 7)}.` : tr(`Side bets ${day.slice(8, 10)}.${day.slice(5, 7)}.`, `Side-Bets ${day.slice(8, 10)}.${day.slice(5, 7)}.`),
    from: day,
    to: day,
    createdAt: at,
    players: [{ id: newId(), name: o.me, joined: { name: o.me, at, ...(uid ? { uid } : {}) } }],
    wagers: [],
    progress: {},
    currency: o.currency ?? 'EUR',
  };
  return createPool(pool, pool.players[0].id);
}
/** The pools of a day this phone's owner is in – for a duel against anyone (a friend, a player made then) one alone too. */
export const duelPoolsOn = (day = dayOf(new Date())): PoolEntry[] =>
  loadPools().filter((e) => e.me && !e.pool.finishedAt && !e.pool.deletedAt && e.pool.from <= day && e.pool.to >= day);

/** The pools running on a day this phone's owner can challenge in – his player and at least one other. */
export const duelPools = (day = dayOf(new Date())): PoolEntry[] =>
  loadPools().filter((e) => e.me && !e.pool.finishedAt && !e.pool.deletedAt && e.pool.to >= day && e.pool.players.some((p) => p.id !== e.me));
/** Challenges to this phone's owner not answered yet, over all pools. */
export const openChallenges = (): { e: PoolEntry; w: Wager }[] =>
  loadPools().flatMap((e) => (e.me && !e.pool.finishedAt && !e.pool.deletedAt ? e.pool.wagers.filter((w) => w.opponent === e.me && w.challenge?.state === 'open').map((w) => ({ e, w })) : []));

/** A duel running today for this phone's owner – his card goes to the pool while he plays (Sascha 09.11.2026: the
 *  other flight sees how it stands). After a hole saved: at most every 20 seconds. */
let soon: number | null = null;
export function reportDuelsSoon(today = dayOf(new Date())): void {
  if (soon != null) return;
  const live = loadPools().some(
    (e) => e.me && !e.pool.finishedAt && !e.pool.deletedAt && today >= e.pool.from && today <= e.pool.to &&
      e.pool.wagers.some((w) => fromCards(w) && w.challenge?.state === 'accepted' && (w.player === e.me || w.opponent === e.me) && (w.attempts !== 'day' || !w.day || w.day === today)),
  );
  if (!live) return;
  soon = window.setTimeout(() => {
    soon = null;
    void reportWagers();
  }, 20000);
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
export function myPoolBalances(today = dayOf(new Date())): { code: string; name: string; running: boolean; amount: number; open: number; currency: string; sym: string; prize: Prize }[] {
  return loadPools()
    .filter((e) => !e.pool.deletedAt && e.me && e.pool.players.some((p) => p.id === e.me))
    .sort((a, b) => b.pool.from.localeCompare(a.pool.from))
    .map((e) => {
      const bal = balances(withDuels(e.pool), today, true);
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
