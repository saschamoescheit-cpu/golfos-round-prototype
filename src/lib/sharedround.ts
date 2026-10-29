import type { CourseSummary, HoleEntry, Player, Round, RoundHole, SharedCell } from '../types';
import { emptyEntry } from './scoring';
import { newId } from './storage';
import { DEFAULT_FORMAT, isTeamMode, leaderboard, type Board } from './games';
import { cleanCode, newCode } from './sharedgame';
import { authToken, SUPABASE_KEY, SUPABASE_URL } from './sync';

// A round on several phones (Sascha 29.10.2026: "invite to a round – on Saturday we play in the same scramble team, but
// it must also be possible to set up a kind of tournament over several flights, with a live leaderboard").
// One mechanism for both: the host shares his round as an event with a 6-letter code. A phone that joins either plays
// in a flight already there (the same team, the same flight – it picks who it is) or starts a flight of its own (a
// tournament). Every phone keeps its own round – GPS, shots and putts stay on it – and exchanges the scores of its
// flight every few seconds; the event holds the scores of all flights, so every phone can show the leaderboard of all.
// The event lives in the table of the shared games (golfos_shared_games: the code, the JSON, host and members) – no
// new table. Nothing is overwritten unseen: a phone writes only if the event has not changed since it read it.

export type Cell = SharedCell;

export interface FlightPlayer {
  id: string;
  name: string;
  playingHandicap: number | null;
  tee?: string;
}
export interface Flight {
  id: string;
  name: string;
  players: FlightPlayer[];
  /** scores[playerId][holeIndex] */
  scores: Record<string, Cell[]>;
  finishedAt?: string | null;
}
export interface RoundEvent {
  kind: 'round-event';
  id: string;
  name: string;
  /** several flights: the leaderboard of all (else the flight's own) */
  tournament: boolean;
  course: CourseSummary;
  loopOrder: string[];
  holes: RoundHole[];
  format?: Round['format'];
  tee?: string;
  rating?: Round['rating'];
  roundKind?: Round['kind'];
  createdAt: string;
  flights: Record<string, Flight>;
}
/** A round that is part of an event: the code, its flight, and its flight's scores as last exchanged (the base of the
 *  three-way merge – what changed here, what changed elsewhere). */
export type RoundShare = NonNullable<Round['shared']>;

export const cellOf = (e: HoleEntry | undefined): Cell => (!e ? null : e.pickedUp ? { s: e.strokes ?? null, p: true } : e.strokes != null ? { s: e.strokes } : null);
export const sameCell = (a: Cell | undefined, b: Cell | undefined): boolean => (a?.s ?? null) === (b?.s ?? null) && !!a?.p === !!b?.p;
const withCell = (e: HoleEntry, c: Cell): HoleEntry => ({ ...e, strokes: c?.s ?? null, pickedUp: !!c?.p });

/** The flight's scores in a round: per player, per hole. */
export function scoresOf(round: Round): Record<string, Cell[]> {
  return Object.fromEntries(round.players.map((p) => [p.id, round.holes.map((_, i) => cellOf(round.entries[p.id]?.[i]))]));
}

/** The round's flight for the event: its players (or teams) and scores. */
export function flightOf(round: Round, id: string, name: string): Flight {
  return {
    id,
    name,
    players: round.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, ...(p.tee ? { tee: p.tee } : {}) })),
    scores: scoresOf(round),
    finishedAt: round.finishedAt,
  };
}

/** A flight's name: its players (a scramble team's name is its players already). */
export const flightName = (round: Pick<Round, 'players'>): string => round.players.map((p) => p.name).join(' · ');

/** The event of a round being shared. */
export function eventOf(round: Round, course: CourseSummary, o: { name: string; tournament: boolean; flight: string }): RoundEvent {
  return {
    kind: 'round-event',
    id: newId(),
    name: o.name,
    tournament: o.tournament,
    course,
    loopOrder: round.loopOrder,
    holes: round.holes,
    ...(round.format ? { format: round.format } : {}),
    ...(round.tee ? { tee: round.tee } : {}),
    ...(round.rating ? { rating: round.rating } : {}),
    ...(round.kind ? { roundKind: round.kind } : {}),
    createdAt: new Date().toISOString(),
    flights: { [o.flight]: flightOf(round, o.flight, flightName(round)) },
  };
}

/**
 * Three-way merge of a round's flight with the event's copy, hole by hole: what changed on this phone since the last
 * exchange wins, else the event's (changed on another phone of the flight). Returns the round with the other phones'
 * scores and the flight as it goes to the event.
 */
export function mergeFlight(round: Round, remote: Flight | undefined): { round: Round; flight: Flight; changedHere: boolean } {
  const share = round.shared!;
  const entries = { ...round.entries };
  const scores: Record<string, Cell[]> = {};
  let changedHere = false;
  let changedThere = false;
  for (const p of round.players) {
    const list = (entries[p.id] ?? round.holes.map(() => emptyEntry())).slice();
    scores[p.id] = round.holes.map((_, i) => {
      const local = cellOf(list[i]);
      const base = share.base[p.id]?.[i] ?? null;
      const there = remote?.scores[p.id]?.[i] ?? null;
      if (!sameCell(local, base)) {
        if (!sameCell(local, there)) changedHere = true;
        return local;
      }
      if (!sameCell(there, local)) {
        list[i] = withCell(list[i] ?? emptyEntry(), there);
        changedThere = true;
      }
      return there;
    });
    entries[p.id] = list;
  }
  const finishedAt = round.finishedAt ?? remote?.finishedAt ?? null;
  if (remote && (remote.finishedAt ?? null) !== finishedAt) changedHere = true;
  const flight: Flight = { ...(remote ?? flightOf(round, share.flight, flightName(round))), scores, finishedAt };
  return { round: changedThere ? { ...round, entries } : round, flight, changedHere: changedHere || !remote };
}

/**
 * The exchange took a moment: the round as it is now, with what the exchange brought – a score entered meanwhile stays
 * (it differs from the base and goes with the next exchange).
 */
export function settle(now: Round, sent: Round, got: Round): Round {
  if (now === sent) return got;
  const entries = { ...now.entries };
  for (const p of now.players) {
    const list = (entries[p.id] ?? now.holes.map(() => emptyEntry())).slice();
    now.holes.forEach((_, i) => {
      if (!sameCell(cellOf(now.entries[p.id]?.[i]), cellOf(sent.entries[p.id]?.[i]))) return; // entered meanwhile
      const g = cellOf(got.entries[p.id]?.[i]);
      if (!sameCell(g, cellOf(list[i]))) list[i] = withCell(list[i] ?? emptyEntry(), g);
    });
    entries[p.id] = list;
  }
  return { ...now, entries, shared: got.shared };
}

/** A phone's own round in an event's flight: the flight's players and scores, `me` the player (or team) it plays. */
export function roundFromEvent(ev: RoundEvent, flightId: string, me: string, code: string): Round {
  const f = ev.flights[flightId];
  const players: Player[] = f.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, isMe: p.id === me, ...(p.tee ? { tee: p.tee } : {}) }));
  const entries = Object.fromEntries(players.map((p) => [p.id, ev.holes.map((_, i) => withCell(emptyEntry(), f.scores[p.id]?.[i] ?? null))]));
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    courseId: ev.course.id,
    courseName: ev.course.name,
    loopOrder: ev.loopOrder,
    holes: ev.holes,
    mode: 'detail',
    players,
    entries,
    currentHole: 0,
    ...(ev.format ? { format: ev.format } : {}),
    ...(ev.tee ? { tee: ev.tee } : {}),
    ...(ev.rating ? { rating: ev.rating } : {}),
    ...(ev.roundKind ? { kind: ev.roundKind } : {}),
    shared: { code, flight: flightId, tournament: ev.tournament, base: Object.fromEntries(players.map((p) => [p.id, ev.holes.map((_, i) => f.scores[p.id]?.[i] ?? null)])) },
  };
}

/** A new flight of a tournament: its players – the phone's owner first – as a round of the event. */
export function newFlightRound(ev: RoundEvent, players: { name: string; playingHandicap: number | null }[], code: string): { round: Round; flight: Flight } {
  const fmt = ev.format ?? DEFAULT_FORMAT;
  const single = players.map((p, k) => ({ id: k === 0 ? 'me' : `p${k + 1}`, name: p.name, playingHandicap: p.playingHandicap }));
  // scramble and foursomes: the flight plays as one team (or two with four players, as the round setup does)
  const team = isTeamMode(fmt.mode);
  const sides = team && single.length === 4 ? [single.slice(0, 2), single.slice(2)] : team ? [single] : single.map((p) => [p]);
  const fp: FlightPlayer[] = sides.map((s, k) => ({
    id: k === 0 ? 'me' : `t${k + 1}`,
    name: s.map((p) => p.name).join(' & '),
    playingHandicap: s.length === 1 ? s[0].playingHandicap : teamHcp(fmt.mode, s.map((p) => p.playingHandicap)),
  }));
  const id = newId();
  const flight: Flight = { id, name: fp.map((p) => p.name).join(' · '), players: fp, scores: Object.fromEntries(fp.map((p) => [p.id, ev.holes.map(() => null)])), finishedAt: null };
  return { round: roundFromEvent({ ...ev, flights: { ...ev.flights, [id]: flight } }, id, 'me', code), flight };
}
function teamHcp(mode: string, hcps: (number | null)[]): number | null {
  if (hcps.some((h) => h == null)) return null;
  const hs = (hcps as number[]).slice().sort((a, b) => a - b);
  if (mode === 'foursome') return Math.round(hs.reduce((s, h) => s + h, 0) * 0.5);
  const w = hs.length === 2 ? [0.35, 0.15] : hs.length === 3 ? [0.3, 0.2, 0.1] : [0.25, 0.2, 0.15, 0.1];
  return Math.round(hs.reduce((s, h, k) => s + h * (w[k] ?? 0), 0));
}

/** The live leaderboard of all flights: every player (or team) of every flight, as the round's own board ranks them
 *  (stroke play, net or Stableford; a match in a flight counts as stroke play here). */
export function eventBoard(ev: RoundEvent): Board {
  const fmt = ev.format ?? DEFAULT_FORMAT;
  const players: Player[] = [];
  const entries: Round['entries'] = {};
  for (const f of Object.values(ev.flights)) {
    for (const p of f.players) {
      const id = `${f.id}/${p.id}`;
      players.push({ id, name: p.name, playingHandicap: p.playingHandicap, isMe: false });
      entries[id] = ev.holes.map((_, i) => withCell(emptyEntry(), f.scores[p.id]?.[i] ?? null));
    }
  }
  const round: Round = { id: ev.id, createdAt: ev.createdAt, finishedAt: null, courseId: ev.course.id, courseName: ev.course.name, loopOrder: ev.loopOrder, holes: ev.holes, mode: 'quick', players, entries, currentHole: 0 };
  return leaderboard(round, { ...fmt, mode: isTeamMode(fmt.mode) ? fmt.mode : 'single', matchplay: false });
}

// ---------- the server (the table of the shared games) ----------

const table = () => `${SUPABASE_URL}/rest/v1/golfos_shared_games`;
async function headers(): Promise<Record<string, string> | null> {
  const t = await authToken();
  return t ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : null;
}
const isEvent = (x: unknown): x is RoundEvent => !!x && (x as RoundEvent).kind === 'round-event' && !!(x as RoundEvent).flights;

const EVENT = 'golfos.event.v1.'; // the event as last seen, for the leaderboard (this device only)
export function cachedEvent(code: string): RoundEvent | null {
  try {
    const ev = JSON.parse(localStorage.getItem(EVENT + code) ?? 'null');
    return isEvent(ev) ? ev : null;
  } catch {
    return null;
  }
}
function keepEvent(code: string, ev: RoundEvent): void {
  try {
    localStorage.setItem(EVENT + code, JSON.stringify(ev));
    window.dispatchEvent(new Event('golfos:event-changed'));
  } catch {
    /* storage full – the leaderboard waits for the next exchange */
  }
}

/** Shares the round: a new code, the event on the server. The round with its share, or null (no connection). */
export async function shareRound(round: Round, course: CourseSummary, o: { name: string; tournament: boolean }): Promise<Round | null> {
  const h = await headers();
  if (!h) return null;
  const flight = newId();
  const ev = eventOf(round, course, { ...o, flight });
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: ev }) });
      if (r.ok) {
        keepEvent(code, ev);
        return { ...round, shared: { code, flight, tournament: o.tournament, base: ev.flights[flight].scores } };
      }
      if (r.status !== 409) return null; // 409: the code is taken – another one
    } catch {
      return null;
    }
  }
  return null;
}

/** Joins an event with its code (the phone becomes a member): the event, 'none' for no event with this code (or a
 *  game's code), null for no connection. */
export async function joinEvent(code: string): Promise<RoundEvent | 'none' | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_join_game`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: cleanCode(code) }) });
    if (!r.ok) return null;
    const ev = await r.json();
    if (!isEvent(ev)) return 'none';
    keepEvent(cleanCode(code), ev);
    return ev;
  } catch {
    return null;
  }
}

/**
 * Reads the event and writes it back changed by `change` – only if nobody wrote in between (else read again, up to
 * four times). The event as written (or as read when nothing changed); null when offline or never got through.
 */
async function update(code: string, change: (ev: RoundEvent) => RoundEvent | null): Promise<RoundEvent | null> {
  const h = await headers();
  if (!h) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=game,updated_at`, { headers: h });
      if (!r.ok) return null;
      const rows = (await r.json()) as { game: unknown; updated_at: string }[];
      if (!rows.length || !isEvent(rows[0].game)) return null;
      const next = change(rows[0].game);
      if (!next) {
        keepEvent(code, rows[0].game);
        return rows[0].game;
      }
      const w = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&updated_at=eq.${encodeURIComponent(rows[0].updated_at)}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ game: next, updated_at: new Date().toISOString() }),
      });
      if (!w.ok) return null;
      if (((await w.json()) as unknown[]).length) {
        keepEvent(code, next);
        return next;
      }
      // another phone wrote in between: read again
    } catch {
      return null;
    }
  }
  return null;
}

/** A tournament's new flight goes into the event. */
export async function addFlight(code: string, flight: Flight): Promise<boolean> {
  return (await update(code, (ev) => ({ ...ev, tournament: true, flights: { ...ev.flights, [flight.id]: flight } }))) != null;
}

/**
 * One exchange of a round with its event: the other phones' scores into the round, this phone's into the event. The
 * round (with the new base) when it got through, null when offline – then nothing changed, the next one tries again.
 */
export async function exchangeRound(round: Round): Promise<Round | null> {
  const share = round.shared;
  if (!share) return null;
  let merged: ReturnType<typeof mergeFlight> | null = null;
  const ev = await update(share.code, (e) => {
    merged = mergeFlight(round, e.flights[share.flight]);
    return merged.changedHere ? { ...e, flights: { ...e.flights, [share.flight]: merged.flight } } : null;
  });
  if (!ev || !merged) return null;
  const m = merged as ReturnType<typeof mergeFlight>;
  return { ...m.round, shared: { ...share, tournament: ev.tournament, base: m.flight.scores } };
}

/** The link in the QR code: opens Rounds and asks to join. */
export const roundJoinLink = (code: string): string => `${location.origin}${location.pathname}#round=${code}`;
