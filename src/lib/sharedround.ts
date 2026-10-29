import type { CourseSummary, HoleEntry, Player, Round, RoundHole, SharedCell } from '../types';
import { emptyEntry } from './scoring';
import { newId } from './storage';
import { DEFAULT_FORMAT, isTeamMode, leaderboard, type Board } from './games';
import { cleanCode, isGame, newCode } from './sharedgame';
import { authToken, SUPABASE_KEY, SUPABASE_URL } from './sync';
import { tr } from './i18n';

// A round on several phones (Sascha 29.10.2026: "invite to a round – on Saturday we play in the same scramble team, but
// it must also be possible to set up a kind of tournament over several flights, with a live leaderboard").
// One mechanism for both: the host shares his round as an event with a 6-letter code – already while setting it up,
// with the flight partners (Sascha: "not only once the round has begun"). A phone that joins either plays in a flight
// already there (it picks who it is) or starts a flight of its own (a tournament). Every phone keeps its own round –
// GPS, shots, putts, penalties stay on it – and exchanges the scores of its flight every few seconds; the event holds
// the scores of all flights, so every phone can show the leaderboard of all.
//
// Who writes which score (Sascha 29.10.2026):
// - a player with a phone of his own keeps his own score – the others' phones show it, they cannot change it;
// - scramble and foursomes: one phone keeps the team's card (at first the one that joined first – the host); another
//   phone of the team can take it over (the keeper's battery is empty);
// - single balls (a tournament or not – Sascha, the evening of 29.10.2026, "Sascha keeps his own score and, as marker,
//   Cedric's"): every player keeps his own score and marks one other player (pairs in the flight: 1 ↔ 2, 3 ↔ 4;
//   with three 1 → 2 → 3 → 1); the marker's count is kept apart and shown beside the player's own – a difference shows;
// - a player without a phone: any phone of the flight keeps his score (as on one phone before).
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
  /** the players – in scramble and foursomes the teams */
  players: FlightPlayer[];
  /** each player's own score: scores[playerId][holeIndex] */
  scores: Record<string, Cell[]>;
  /** a tournament: the marker's count of each player */
  marks?: Record<string, Cell[]>;
  /** a tournament: who marks whom – markers[player] = the player who marks him */
  markers?: Record<string, string>;
  /** the phones playing in the flight: which player (or team) each one is */
  phones?: Record<string, { player: string; name: string; at: string }>;
  /** scramble and foursomes: the phone keeping the team's card (missing: the team's first phone) */
  keeper?: Record<string, string>;
  /** the phone that set the flight up – its players come from there */
  by?: string;
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
  /** the phone that set the event up – holes and format come from there */
  by?: string;
  flights: Record<string, Flight>;
}
/** A round that is part of an event: the code, its flight, this phone, and the flight's scores as last exchanged (the
 *  base of the three-way merge – what changed here, what changed elsewhere). */
export type RoundShare = NonNullable<Round['shared']>;
/** What this phone does with a player's score: keeps it (own), marks him (mark – a tournament), only shows it (view –
 *  his own phone or the team's keeper writes it), or keeps it with the others (free – a player without a phone). */
export type Role = 'own' | 'mark' | 'view' | 'free';

export const cellOf = (e: HoleEntry | undefined): Cell => (!e ? null : e.pickedUp ? { s: e.strokes ?? null, p: true } : e.strokes != null ? { s: e.strokes } : null);
export const sameCell = (a: Cell | undefined, b: Cell | undefined): boolean => (a?.s ?? null) === (b?.s ?? null) && !!a?.p === !!b?.p;
const withCell = (e: HoleEntry, c: Cell): HoleEntry => ({ ...e, strokes: c?.s ?? null, pickedUp: !!c?.p });
const nulls = (n: number): Cell[] => Array.from({ length: n }, () => null);
const isTeamEvent = (f: Round['format'] | undefined): boolean => isTeamMode(f?.mode);

/** The flight's scores in a round: per player, per hole. */
export function scoresOf(round: Round): Record<string, Cell[]> {
  return Object.fromEntries(round.players.map((p) => [p.id, round.holes.map((_, i) => cellOf(round.entries[p.id]?.[i]))]));
}

/** Who marks whom in a tournament flight: pairs (1 ↔ 2, 3 ↔ 4), three players in a ring – nobody marks himself. */
export function defaultMarkers(ids: string[]): Record<string, string> {
  if (ids.length < 2) return {};
  if (ids.length % 2 === 1) return Object.fromEntries(ids.map((id, k) => [id, ids[(k + ids.length - 1) % ids.length]]));
  return Object.fromEntries(ids.map((id, k) => [id, ids[k % 2 === 0 ? k + 1 : k - 1]]));
}

const framePlayers = (round: Pick<Round, 'players'>): FlightPlayer[] => round.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, ...(p.tee ? { tee: p.tee } : {}) }));
const sameFrame = (a: FlightPlayer[], b: FlightPlayer[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The round's flight for the event: its players (or teams), scores, and the phone that set it up. */
export function flightOf(round: Round, id: string, name: string, phone: string, tournament: boolean, who: string): Flight {
  const me = round.players.find((p) => p.isMe)?.id ?? round.players[0]?.id;
  return {
    id,
    name,
    players: framePlayers(round),
    scores: scoresOf(round),
    ...(tournament || !isTeamEvent(round.format) ? { marks: {}, markers: defaultMarkers(round.players.map((p) => p.id)) } : {}),
    phones: me ? { [phone]: { player: me, name: who, at: new Date().toISOString() } } : {},
    by: phone,
    finishedAt: round.finishedAt,
  };
}

/** A flight's name: its players (a scramble team's name is its players already). */
export const flightName = (round: Pick<Round, 'players'>): string => round.players.map((p) => p.name).join(' · ');

/** The event of a round being shared. */
export function eventOf(round: Round, course: CourseSummary, o: { name: string; tournament: boolean; flight: string; phone: string; who: string }): RoundEvent {
  return {
    kind: 'round-event',
    id: newId(),
    name: o.name,
    tournament: o.tournament,
    course,
    ...eventFrame(round),
    createdAt: new Date().toISOString(),
    by: o.phone,
    flights: { [o.flight]: flightOf(round, o.flight, flightName(round), o.phone, o.tournament, o.who) },
  };
}
/** What the event takes from the round that set it up: holes and format. */
function eventFrame(round: Round): Pick<RoundEvent, 'loopOrder' | 'holes' | 'format' | 'tee' | 'rating' | 'roundKind'> {
  return {
    loopOrder: round.loopOrder,
    holes: round.holes,
    ...(round.format ? { format: round.format } : {}),
    ...(round.tee ? { tee: round.tee } : {}),
    ...(round.rating ? { rating: round.rating } : {}),
    ...(round.kind ? { roundKind: round.kind } : {}),
  };
}

/** The phone that writes a player's own score: his own phone (the latest), in a team the keeper (else its first phone). */
export function writerOf(f: Flight, player: string, team: boolean): string | null {
  if (team && f.keeper?.[player] && f.phones?.[f.keeper[player]]) return f.keeper[player];
  const ph = Object.entries(f.phones ?? {})
    .filter(([, v]) => v.player === player)
    .sort((a, b) => (team ? a[1].at.localeCompare(b[1].at) : b[1].at.localeCompare(a[1].at)));
  return ph[0]?.[0] ?? null;
}

export function roleOf(f: Flight, player: string, phone: string, team: boolean, tournament: boolean): Role {
  const w = writerOf(f, player, team);
  if (w === phone) return 'own';
  // every player marks a partner – in a tournament and in any round of single balls (Sascha 29.10.2026, testing
  // with Cedric: "Sascha keeps his own score and, as marker, Cedric's; Cedric his own and, as marker, Sascha's")
  if (tournament || !team) {
    const m = f.markers?.[player];
    if (m && m !== player && writerOf(f, m, team) === phone) return 'mark';
  }
  return w == null ? 'free' : 'view';
}

/** For the score panel: per player, what this phone may do, who keeps the score, and the other count beside it. */
export interface ShareView {
  role: Role;
  /** the name of the phone that keeps this score (view) */
  keptBy: string | null;
  /** a team member of this phone: may take the card over */
  canTakeOver: boolean;
  /** a tournament: the other count beside this one – the marker's (own) or the player's own (mark) */
  other: { label: string; cells: Cell[] } | null;
}
export function shareView(round: Round, f: Flight | undefined, tournament: boolean): Record<string, ShareView> {
  const share = round.shared;
  if (!share || !f) return {};
  const phone = share.phone ?? '';
  const team = isTeamEvent(round.format);
  const me = round.players.find((p) => p.isMe)?.id;
  const nameOf = (id: string | undefined) => round.players.find((p) => p.id === id)?.name ?? '';
  const marking = tournament || !team;
  return Object.fromEntries(
    round.players.map((p) => {
      const role = roleOf(f, p.id, phone, team, tournament);
      const w = writerOf(f, p.id, team);
      const marker = f.markers?.[p.id];
      const other =
        !marking || !marker
          ? null
          : role === 'own'
            ? { label: `${nameOf(marker)} (${tr('marker', 'Zähler')})`, cells: f.marks?.[p.id] ?? [] }
            : role === 'mark'
              ? { label: tr(`${p.name} himself`, `${p.name} selbst`), cells: f.scores[p.id] ?? [] }
              : null;
      return [p.id, { role, keptBy: role === 'view' && w ? (f.phones?.[w]?.name ?? null) : null, canTakeOver: team && role === 'view' && p.id === me, other }];
    }),
  );
}

/**
 * Three-way merge of a round's flight with the event's copy, hole by hole, for the scores this phone writes: what
 * changed here since the last exchange wins, else the event's. The scores this phone only shows come from the event.
 * Returns the round with the others' scores and the flight as it goes to the event.
 */
export function mergeFlight(round: Round, remote: Flight | undefined, tournament = !!round.shared?.tournament, who = ''): { round: Round; flight: Flight; changedHere: boolean; base: Record<string, Cell[]>; roles: Record<string, Role> } {
  const share = round.shared!;
  const phone = share.phone ?? '';
  const team = isTeamEvent(round.format);
  const n = round.holes.length;
  let changedHere = !remote;
  let changedThere = false;
  let f: Flight = remote ?? flightOf(round, share.flight, flightName(round), phone, tournament, who);
  const marking = tournament || !team;
  // this phone in the flight: which player (or team) it is
  const me = round.players.find((p) => p.isMe)?.id;
  if (me && !f.phones?.[phone]) {
    f = { ...f, phones: { ...f.phones, [phone]: { player: me, name: who, at: new Date().toISOString() } } };
    changedHere = true;
  }
  // the players: from the phone that set the flight up – the others take them over
  let players = round.players;
  if (f.by === phone || !f.by) {
    // a flight from before every round was marked (29.10.2026, evening): its markers now
    if (!sameFrame(f.players, framePlayers(round)) || (marking && !f.markers)) {
      f = { ...f, players: framePlayers(round), ...(marking ? { markers: defaultMarkers(round.players.map((p) => p.id)) } : {}) };
      changedHere = true;
    }
  } else if (!sameFrame(f.players, framePlayers(round))) {
    players = f.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, isMe: p.id === me, ...(p.tee ? { tee: p.tee } : {}) }));
    changedThere = true;
  }
  const entries: Round['entries'] = {};
  const scores: Record<string, Cell[]> = { ...f.scores };
  const marks: Record<string, Cell[]> = { ...(f.marks ?? {}) };
  const base: Record<string, Cell[]> = {};
  const roles: Record<string, Role> = {};
  for (const p of players) {
    const list = (round.entries[p.id] ?? round.holes.map(() => emptyEntry())).slice();
    const role = roleOf(f, p.id, phone, team, tournament);
    roles[p.id] = role;
    const was = share.roles?.[p.id];
    const field = role === 'mark' ? marks : scores;
    // marking him now, keeping his score before (no phone of his until now): what this phone entered is its count
    const b = role === 'mark' && was !== 'mark' && was != null ? nulls(n) : (share.base[p.id] ?? nulls(n));
    // just took the card over (it was only shown here): first the card as it stands – what this phone showed may be old
    const adopt = role !== 'view' && was === 'view';
    const out: Cell[] = round.holes.map((_, i) => {
      const local = cellOf(list[i]);
      const there = role === 'view' ? (scores[p.id]?.[i] ?? marks[p.id]?.[i] ?? null) : (field[p.id]?.[i] ?? null);
      if (role !== 'view' && !adopt && !sameCell(local, b[i] ?? null)) {
        if (!sameCell(local, there)) changedHere = true;
        return local;
      }
      if (!sameCell(there, local)) {
        list[i] = withCell(list[i] ?? emptyEntry(), there);
        changedThere = true;
      }
      return there;
    });
    if (role !== 'view') field[p.id] = out;
    base[p.id] = out;
    entries[p.id] = list;
  }
  const finishedAt = round.finishedAt ?? f.finishedAt ?? null;
  if ((f.finishedAt ?? null) !== finishedAt) changedHere = true;
  const flight: Flight = { ...f, scores, ...(marking || f.marks ? { marks } : {}), finishedAt };
  const next = changedThere ? { ...round, players, entries } : round;
  return { round: next, flight, changedHere, base, roles };
}

/**
 * The exchange took a moment: the round as it is now, with what the exchange brought – a score entered meanwhile stays
 * (it differs from the base and goes with the next exchange).
 */
export function settle(now: Round, sent: Round, got: Round): Round {
  if (now === sent) return got;
  const entries = { ...now.entries };
  for (const p of got.players) {
    const list = (entries[p.id] ?? got.holes.map(() => emptyEntry())).slice();
    got.holes.forEach((_, i) => {
      if (!sameCell(cellOf(now.entries[p.id]?.[i]), cellOf(sent.entries[p.id]?.[i]))) return; // entered meanwhile
      const g = cellOf(got.entries[p.id]?.[i]);
      if (!sameCell(g, cellOf(list[i]))) list[i] = withCell(list[i] ?? emptyEntry(), g);
    });
    entries[p.id] = list;
  }
  return { ...now, players: got.players, entries, shared: got.shared };
}

/** A phone's own round in an event's flight: the flight's players and scores, `me` the player (or team) it plays. */
export function roundFromEvent(ev: RoundEvent, flightId: string, me: string, code: string, phone = newId(), who = ''): Round {
  const f0 = ev.flights[flightId];
  const f: Flight = { ...f0, phones: { ...f0.phones, [phone]: { player: me, name: who, at: new Date().toISOString() } } };
  const players: Player[] = f.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, isMe: p.id === me, ...(p.tee ? { tee: p.tee } : {}) }));
  const team = isTeamEvent(ev.format);
  const roles = Object.fromEntries(players.map((p) => [p.id, roleOf(f, p.id, phone, team, ev.tournament)]));
  // what this phone shows of each player: his score – or, marking him, its own count of him
  const cells = (pid: string): Cell[] => ev.holes.map((_, i) => (roles[pid] === 'mark' ? (f.marks?.[pid]?.[i] ?? null) : roles[pid] === 'view' ? (f.scores[pid]?.[i] ?? f.marks?.[pid]?.[i] ?? null) : (f.scores[pid]?.[i] ?? null)));
  const entries = Object.fromEntries(players.map((p) => [p.id, cells(p.id).map((c) => withCell(emptyEntry(), c))]));
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
    shared: { code, flight: flightId, tournament: ev.tournament, phone, roles, base: Object.fromEntries(players.map((p) => [p.id, cells(p.id)])) },
  };
}

/** A new flight of a tournament: its players – the phone's owner first – as a round of the event. */
export function newFlightRound(ev: RoundEvent, players: { name: string; playingHandicap: number | null }[], code: string, phone = newId(), who = ''): { round: Round; flight: Flight } {
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
  const flight: Flight = {
    id,
    name: fp.map((p) => p.name).join(' · '),
    players: fp,
    scores: Object.fromEntries(fp.map((p) => [p.id, nulls(ev.holes.length)])),
    marks: {},
    markers: defaultMarkers(fp.map((p) => p.id)),
    phones: { [phone]: { player: 'me', name: who, at: new Date().toISOString() } },
    by: phone,
    finishedAt: null,
  };
  return { round: roundFromEvent({ ...ev, tournament: true, flights: { ...ev.flights, [id]: flight } }, id, 'me', code, phone, who), flight };
}
function teamHcp(mode: string, hcps: (number | null)[]): number | null {
  if (hcps.some((h) => h == null)) return null;
  const hs = (hcps as number[]).slice().sort((a, b) => a - b);
  if (mode === 'foursome') return Math.round(hs.reduce((s, h) => s + h, 0) * 0.5);
  const w = hs.length === 2 ? [0.35, 0.15] : hs.length === 3 ? [0.3, 0.2, 0.1] : [0.25, 0.2, 0.15, 0.1];
  return Math.round(hs.reduce((s, h, k) => s + h * (w[k] ?? 0), 0));
}

/** The score a player stands with: his own – without one (no phone of his), the marker's. */
const scoreAt = (f: Flight, pid: string, i: number): Cell => f.scores[pid]?.[i] ?? f.marks?.[pid]?.[i] ?? null;

/** A tournament: the holes where a player's own score and his marker's differ (both entered). */
export function differences(f: Flight, pid: string): number[] {
  const own = f.scores[pid] ?? [];
  const mark = f.marks?.[pid] ?? [];
  return own.map((c, i) => (c != null && mark[i] != null && !sameCell(c, mark[i]) ? i : -1)).filter((i) => i >= 0);
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
      entries[id] = ev.holes.map((_, i) => withCell(emptyEntry(), scoreAt(f, p.id, i)));
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

/** Shares a round (or the round being set up): a new code, the event on the server. The round with its share, or null
 *  (no connection). */
export async function shareRound(round: Round, course: CourseSummary, o: { name: string; tournament: boolean; who: string }): Promise<Round | null> {
  const h = await headers();
  if (!h) return null;
  const flight = newId();
  const phone = newId();
  const ev = eventOf(round, course, { ...o, flight, phone });
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: ev }) });
      if (r.ok) {
        keepEvent(code, ev);
        const roles = Object.fromEntries(round.players.map((p) => [p.id, roleOf(ev.flights[flight], p.id, phone, isTeamEvent(round.format), o.tournament)]));
        return { ...round, shared: { code, flight, tournament: o.tournament, phone, roles, base: ev.flights[flight].scores } };
      }
      if (r.status !== 409) return null; // 409: the code is taken – another one
    } catch {
      return null;
    }
  }
  return null;
}

/** Joins an event with its code (the phone becomes a member): the event, 'game' for a game's code (join it under
 *  Games), 'none' for nothing with this code, null for no connection. */
export async function joinEvent(code: string): Promise<RoundEvent | 'game' | 'none' | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_join_game`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: cleanCode(code) }) });
    if (!r.ok) return null;
    const ev = await r.json();
    if (isGame(ev)) return 'game';
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

/** Scramble and foursomes: this phone takes the team's card over (Sascha: "Sascha's battery is empty – Cedric goes on"). */
export async function takeOver(round: Round, team: string): Promise<boolean> {
  const s = round.shared;
  if (!s?.phone) return false;
  const ev = await update(s.code, (e) => {
    const f = e.flights[s.flight];
    if (!f || f.keeper?.[team] === s.phone) return null;
    return { ...e, flights: { ...e.flights, [s.flight]: { ...f, keeper: { ...f.keeper, [team]: s.phone! } } } };
  });
  return ev != null && ev.flights[s.flight]?.keeper?.[team] === s.phone;
}

/**
 * One exchange of a round with its event: the other phones' scores into the round, this phone's into the event (and
 * the round's players and holes, from the phone that set them up). The round (with the new base) when it got through,
 * null when offline – then nothing changed, the next one tries again.
 */
export async function exchangeRound(round: Round, who = ''): Promise<Round | null> {
  const s0 = round.shared;
  if (!s0) return null;
  // a round shared before phones were told apart (29.10.2026): one now
  const share = s0.phone ? s0 : { ...s0, phone: newId() };
  const r0 = share === s0 ? round : { ...round, shared: share };
  let merged: ReturnType<typeof mergeFlight> | null = null;
  const ev = await update(share.code, (e) => {
    merged = mergeFlight(r0, e.flights[share.flight], e.tournament, who);
    // the holes and the format from the phone that set the event up (changed in the setup after the code was made)
    const frame = e.by === share.phone && JSON.stringify(eventFrame(r0)) !== JSON.stringify(eventFrame({ ...r0, ...pickFrame(e) })) ? eventFrame(r0) : null;
    return merged.changedHere || frame ? { ...e, ...(frame ?? {}), flights: { ...e.flights, [share.flight]: merged.flight } } : null;
  });
  if (!ev || !merged) return null;
  const m = merged as ReturnType<typeof mergeFlight>;
  // another phone set the holes: taken over while nothing is entered yet
  let out = m.round;
  if (ev.by !== share.phone && ev.holes.map((h) => h.label).join() !== out.holes.map((h) => h.label).join() && !Object.values(out.entries).some((l) => l.some((e) => e.strokes != null || e.pickedUp))) {
    out = { ...out, ...eventFrame({ ...out, ...pickFrame(ev) }), entries: Object.fromEntries(out.players.map((p) => [p.id, ev.holes.map(() => emptyEntry())])) };
  }
  return { ...out, shared: { ...share, tournament: ev.tournament, base: m.base, roles: m.roles } };
}
const pickFrame = (e: RoundEvent): Partial<Round> => ({ loopOrder: e.loopOrder, holes: e.holes, format: e.format, tee: e.tee, rating: e.rating, kind: e.roundKind });

// ---------- rounds nearby (Sascha 29.10.2026: "invite only people signed in with Google and nearby – by GPS") ----------
// Not the people – the round: the host's phone puts where it is beside the code (for two hours); a phone signed in and
// within ~300 m sees it under "Join a round" and asks to join with a tap, no code typed – the host lets him in (then
// the phone gets the code) or not. Nothing else of anyone's position is kept; the server forgets it when the two hours
// are over (golfos_nearby_rounds, golfos_request_join, golfos_answer_join – supabase/golfos-shared-games.sql).

export interface NearbyRound {
  /** not the code – the host lets each one in first (Sascha 29.10.2026: "the host must confirm the joining") */
  ref: string;
  name: string;
  course: string;
  host: string;
  tournament: boolean;
  mode?: string;
  /** metres from here */
  dist: number;
}
export const NEARBY_HOURS = 2;
/** The host's phone shows its round nearby: where it is (no GPS: the course, with a wider circle). False when it did
 *  not get through – the code still works. */
export async function showNearby(code: string, at: { lat: number; lon: number; radius: number }, host: string): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  const until = Date.now() + NEARBY_HOURS * 3600 * 1000;
  const ref = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : newId() + newId();
  try {
    const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({ near_lat: at.lat, near_lon: at.lon, near_radius: Math.round(at.radius), near_host: host, near_until: new Date(until).toISOString(), near_ref: ref, near_requests: {} }),
    });
    if (r.ok) keepNear(code, until);
    return r.ok;
  } catch {
    return false;
  }
}

// the rounds this phone shows nearby, till when – its requests are looked for while shown (JoinRequests)
const NEAR = 'golfos.near.v1.';
function keepNear(code: string, until: number): void {
  try {
    localStorage.setItem(NEAR + code, String(until));
    window.dispatchEvent(new Event('golfos:near-changed'));
  } catch {
    /* storage full – the requests wait */
  }
}
/** The codes shown nearby right now (the ones past their time forgotten). */
export function shownNearby(): string[] {
  const out: string[] = [];
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(NEAR)) continue;
      if (Number(localStorage.getItem(k)) > Date.now()) out.push(k.slice(NEAR.length));
      else localStorage.removeItem(k);
    }
  } catch {
    /* no storage */
  }
  return out;
}

export type JoinAnswer = { state: 'asked' | 'no' | 'gone' } | { state: 'ok'; code: string };
/** Asks to join a round nearby – asked again, how it stands ('ok' with the code once the host let this phone in).
 *  Null when offline. */
export async function askToJoin(ref: string, who: string): Promise<JoinAnswer | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_request_join`, { method: 'POST', headers: h, body: JSON.stringify({ join_ref: ref, who }) });
    if (!r.ok) return null;
    const a = (await r.json()) as { state?: string; code?: string } | null;
    if (a?.state === 'ok' && typeof a.code === 'string') return { state: 'ok', code: a.code };
    return a?.state === 'asked' || a?.state === 'no' ? { state: a.state } : { state: 'gone' };
  } catch {
    return null;
  }
}
export interface JoinRequest {
  /** the asking player's account */
  id: string;
  name: string;
  at: string;
}
/** The requests to join a round shown nearby, not answered yet – oldest first. */
export async function joinRequests(code: string): Promise<JoinRequest[]> {
  const h = await headers();
  if (!h) return [];
  try {
    const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=near_requests`, { headers: h });
    if (!r.ok) return [];
    const rows = (await r.json()) as { near_requests?: Record<string, { name?: string; at?: string; state?: string }> | null }[];
    return Object.entries(rows[0]?.near_requests ?? {})
      .filter(([, x]) => x?.state === 'asked')
      .map(([id, x]) => ({ id, name: x.name || tr('A player', 'Ein Spieler'), at: x.at ?? '' }))
      .sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
}
/** The host lets him in (he becomes a member and gets the code) or not. */
export async function answerJoin(code: string, player: string, yes: boolean): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_answer_join`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: code, player, yes }) });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}
/** The rounds shown near here, nearest first – none when offline or not signed in. */
export async function nearbyRounds(lat: number, lon: number): Promise<NearbyRound[]> {
  const h = await headers();
  if (!h) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_nearby_rounds`, { method: 'POST', headers: h, body: JSON.stringify({ at_lat: lat, at_lon: lon }) });
    if (!r.ok) return [];
    const rows = (await r.json()) as NearbyRound[] | null;
    return Array.isArray(rows) ? rows.filter((x) => x && typeof x.ref === 'string').sort((a, b) => a.dist - b.dist) : [];
  } catch {
    return [];
  }
}

/** The link in the QR code: opens Rounds and asks to join. */
export const roundJoinLink = (code: string): string => `${location.origin}${location.pathname}#round=${code}`;
