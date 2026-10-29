import type { Game } from './gameforms';
import { emptyEntry } from './scoring';
import { authToken, loadSession, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './sync';
import { pushGame } from './push';

// One game on several phones (Sascha 15.10.2026: "four players, everyone with the web app – join by a code or a QR
// code; everyone sees the standing and can enter his shot details"). The host shares the game: a 6-letter code and a
// QR code. The others join with it. Every phone keeps its copy and merges with the shared one every few seconds –
// score by score, the later entry wins, so two phones entering at the same time do not overwrite each other.
// Needs the table golfos_shared_games (SQL in features/021-games-modul/feature.md, Nachtrag I); without it the
// buttons stay hidden.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export const newCode = (rand = Math.random): string => Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
export const cleanCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** The time stamp of a score (s:player:hole), a hole's extras (x:hole) – set when the player enters it. */
export function stamp(g: Game, key: string, at = new Date().toISOString()): Game {
  return { ...g, stamps: { ...g.stamps, [key]: at } };
}

/** Both copies of a shared game in one: per score and per hole the later entry, presses from both, finished if one is. */
export function mergeGames(local: Game, remote: Game): Game {
  const ls = local.stamps ?? {};
  const rs = remote.stamps ?? {};
  const newer = (key: string) => (rs[key] ?? '') > (ls[key] ?? '');
  const scores: Game['scores'] = {};
  for (const p of local.players) {
    const mine = local.scores[p.id] ?? [];
    const theirs = remote.scores[p.id] ?? [];
    scores[p.id] = local.holes.map((_, i) => (newer(`s:${p.id}:${i}`) ? (theirs[i] ?? null) : (mine[i] ?? null)));
  }
  const extra = local.holes.map((_, i) => (newer(`x:${i}`) ? (remote.extra[i] ?? {}) : (local.extra[i] ?? {})));
  const presses = [...(local.presses ?? [])];
  for (const p of remote.presses ?? []) if (!presses.some((q) => q.hole === p.hole && q.by === p.by)) presses.push(p);
  presses.sort((a, b) => a.hole - b.hole);
  const stamps: Record<string, string> = { ...ls };
  for (const [k, v] of Object.entries(rs)) if (v > (stamps[k] ?? '')) stamps[k] = v;
  return {
    ...local,
    scores,
    extra,
    presses,
    stamps,
    finishedAt: local.finishedAt ?? remote.finishedAt ?? null,
  };
}

/** What goes to the server: a game on the map sends only its round's frame (course, holes) – the GPS track, shots
 *  and putts stay on the phone; the scores travel in the game. */
export function onWire(g: Game): Game {
  if (!g.round) return g;
  const r = g.round;
  return { ...g, round: { ...r, entries: {}, currentHole: 0, players: r.players.map((p) => ({ ...p, isMe: false })) } };
}

/** The joining phone's own round from the shared frame: nothing entered, its owner is `me` (the host otherwise). */
export function guestRound(g: Game, me?: string): Game {
  if (!g.round) return g;
  const r = g.round;
  const players = r.players.map((p, k) => ({ ...p, isMe: me ? p.id === me : k === 0 }));
  const entries = Object.fromEntries(players.map((p) => [p.id, r.holes.map((_, i) => ({ ...emptyEntry(), strokes: g.scores[p.id]?.[i] ?? null }))]));
  return { ...g, round: { ...r, players, entries, currentHole: g.current ?? 0, finishedAt: null } };
}

// ---------- Supabase ----------

const table = () => `${SUPABASE_URL}/rest/v1/golfos_shared_games`;
async function headers(): Promise<Record<string, string> | null> {
  const t = await authToken();
  return t ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : null;
}

let availableCache: boolean | null = null;
/** Signed in and the table exists (Sascha ran the SQL). */
export async function sharingAvailable(): Promise<boolean> {
  if (!syncConfigured() || !loadSession()) return false;
  if (availableCache != null) return availableCache;
  try {
    const h = await headers();
    if (!h) return false;
    const r = await fetch(`${table()}?select=code&limit=1`, { headers: h });
    availableCache = r.ok;
  } catch {
    return false; // offline – ask again later
  }
  return availableCache;
}

/** Shares the game: a new code, the game on the server. Returns the game with its code. */
export async function shareGame(g: Game): Promise<Game | null> {
  const h = await headers();
  if (!h) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    const shared = { ...g, shared: { code } };
    const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: onWire(shared) }) });
    if (r.ok) return shared;
    if (r.status !== 409) return null; // 409: the code is taken – another one
  }
  return null;
}

/** A game in the table – not a round's event (Rounds keeps its rounds on several phones in the same table). */
export const isGame = (x: unknown): x is Game => !!x && (x as { kind?: string }).kind !== 'round-event' && !!(x as Game).id && Array.isArray((x as Game).players) && !!(x as Game).form;

/** Joins with a code: the game as the host shared it; 'round' when the code is a round's (join it under Rounds),
 *  'none' for no game with this code, null for no connection. */
export async function joinGame(code: string): Promise<Game | 'round' | 'none' | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_join_game`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: cleanCode(code) }) });
    if (!r.ok) return null;
    const g = (await r.json()) as unknown;
    if (g && (g as { kind?: string }).kind === 'round-event') return 'round';
    if (!isGame(g)) return 'none';
    pushGame('joined', cleanCode(code)); // the host hears of it (push, final list 23.10.2026)
    return { ...g, shared: { code: cleanCode(code) } };
  } catch {
    return null;
  }
}

/**
 * One exchange: fetch the shared copy, merge, send the merged one back – as in Rounds (Sascha 29.10.2026) the server
 * takes the write only if nobody wrote since it was read, else it reads again (up to four times). Null when offline.
 */
export async function exchange(g: Game): Promise<Game | null> {
  if (!g.shared) return null;
  const h = await headers();
  if (!h) return null;
  const at = `${table()}?code=eq.${encodeURIComponent(g.shared.code)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${at}&select=game,updated_at`, { headers: h });
      if (!r.ok) return null;
      const rows = (await r.json()) as { game: unknown; updated_at?: string | null }[];
      if (!rows.length || !isGame(rows[0].game)) return null;
      const merged = mergeGames(g, rows[0].game);
      if (JSON.stringify(onWire(merged)) === JSON.stringify(rows[0].game)) return merged;
      const seen = rows[0].updated_at ? `updated_at=eq.${encodeURIComponent(rows[0].updated_at)}` : 'updated_at=is.null';
      const w = await fetch(`${at}&${seen}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ game: onWire(merged), updated_at: new Date().toISOString() }) });
      if (!w.ok) return null;
      if (((await w.json()) as unknown[]).length) return merged;
      // another phone wrote in between: read again
    } catch {
      return null;
    }
  }
  return null;
}

/** The exchange took a moment: the game as it is now with what the exchange brought – an entry made meanwhile is
 *  newer and stays (it goes with the next exchange), as in Rounds. */
export const settleGame = (now: Game, got: Game): Game => mergeGames(now, got);

/** The link in the QR code: opens the app and asks to join. */
export const joinLink = (code: string): string => `${location.origin}${location.pathname}#join=${code}`;
