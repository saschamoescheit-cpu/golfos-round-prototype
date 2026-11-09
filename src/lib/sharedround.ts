import type { CellDetail, CourseSummary, HoleEntry, Player, Round, RoundHole, SharedCell } from '../types';
import { emptyEntry } from './scoring';
import { newId } from './storage';
import { DEFAULT_FORMAT, formatOf, holeScoresOf, isTeamMode, leaderboard, teamHandicap, teamsOf, type Board } from './games';
import { cleanCode, isGame, newCode } from './sharedgame';
import { isPool } from './wagers';
import { authToken, SUPABASE_KEY, SUPABASE_URL, userId } from './sync';
import { tr } from './i18n';
import { linkBase } from './native';
import type { Special, SpecialEntries, SpecialEntry } from './specials';
import { pushSigned, pushSpecial } from './push';

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
// - with a marker (a tournament always; a round of single balls when chosen – Sascha 29./30.10.2026, "Sascha keeps
//   his own score and, as marker, Cedric's"): every player keeps his own score and marks one other player (pairs in the flight: 1 ↔ 2, 3 ↔ 4;
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
  /** a planned tournament: the handicap index – the host works the playing handicap out again after a change */
  hcpIndex?: number | null;
  /** a planned tournament played as teams (scramble, foursomes, greensome, Chapman – Sascha 07.11.2026): the team's
   *  players, so the plan reads them back one by one */
  members?: TeamMember[];
}
export interface TeamMember {
  name: string;
  playingHandicap: number | null;
  hcpIndex?: number | null;
  tee?: string | null;
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
  /** one player keeps the score of all (Sascha 02.11.2026: "Chris enters it for everyone") – his phone writes every
   *  player's card, the others only see it; he signs as everyone's marker */
  scorer?: string;
  /** the phones playing in the flight: which player (or team) each one is */
  phones?: Record<string, { player: string; name: string; at: string; /** last heard of (every two minutes at most) */ seen?: string; /** the account playing on it (the tee time reminder of its flight – 01.11.2026) */ uid?: string }>;
  /** scramble and foursomes: the phone keeping the team's card (missing: the team's first phone) */
  keeper?: Record<string, string>;
  /** a tournament: the card signed – by the player and by his marker (when) */
  signed?: Record<string, { player?: string; marker?: string }>;
  /** the host entered a player's scores afterwards ("Scores eintragen", when) – they count as a signed card for the
   *  bets (Sascha 08.11.2026: "count fully") */
  entered?: Record<string, string>;
  /** the phone that set the flight up – its players come from there */
  by?: string;
  finishedAt?: string | null;
  /** a planned tournament: the flight's tee time, "HH:MM" on the course (Sascha 01.11.2026) */
  teeTime?: string;
  /** a planned tournament: the hole the flight starts on, 0-based – 9: tee 10 (Sascha 04.11.2026: "from tees 1 and 10");
   *  missing: hole 1 */
  startHole?: number;
  /** the special prizes' entries of the flight's players (lib/specials) */
  specials?: SpecialEntries;
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
  /** a tournament's net classes: limits on the playing handicap ([18]: A up to 18, B above) */
  classes?: number[];
  flights: Record<string, Flight>;
  /** a tournament planned ahead in Games (Sascha 01.11.2026: "planned in Games, played in Rounds"): its day
   *  (YYYY-MM-DD) – played in Rounds on that day */
  date?: string;
  planned?: true;
  /** called off by the host (kept, as the bets) */
  deletedAt?: string | null;
  /** the special prizes – Long Drive, Nearest to the Pin – each on a hole (lib/specials) */
  specials?: Special[];
}
/** A round that is part of an event: the code, its flight, this phone, and the flight's scores as last exchanged (the
 *  base of the three-way merge – what changed here, what changed elsewhere). */
export type RoundShare = NonNullable<Round['shared']>;
/** What this phone does with a player's score: keeps it (own), marks him (mark – a tournament), only shows it (view –
 *  his own phone or the team's keeper writes it), or keeps it with the others (free – a player without a phone). */
export type Role = 'own' | 'mark' | 'view' | 'free';

/** The account on this phone, for its entry in a flight (Games' tee time reminder: who plays in which flight). */
const account = (): { uid?: string } => {
  const uid = userId();
  return uid ? { uid } : {};
};

/** A hole's details (putts, tee shot, sand, penalties) as they go with the score – the marker's count of a player has
 *  them too (Sascha 01.11.2026); undefined when none was entered. */
export function detailOf(e: HoleEntry): CellDetail | undefined {
  const d: CellDetail = {};
  if (e.putts != null) d.pu = e.putts;
  if (e.fairway) d.fw = e.fairway;
  if (e.sandShots) d.sa = e.sandShots;
  if (e.penalties) d.pe = e.penalties;
  return Object.keys(d).length ? d : undefined;
}
export const cellOf = (e: HoleEntry | undefined): Cell => {
  if (!e || (!e.pickedUp && e.strokes == null)) return null;
  const d = detailOf(e);
  return { s: e.strokes ?? null, ...(e.pickedUp ? { p: true as const } : {}), ...(d ? { d } : {}) };
};
/** The same score – strokes and picked up (the counts compared in a tournament). */
export const sameScore = (a: Cell | undefined, b: Cell | undefined): boolean => (a?.s ?? null) === (b?.s ?? null) && !!a?.p === !!b?.p;
const sameDetail = (a: CellDetail | undefined, b: CellDetail | undefined): boolean =>
  (a?.pu ?? null) === (b?.pu ?? null) && (a?.fw ?? null) === (b?.fw ?? null) && (a?.sa ?? 0) === (b?.sa ?? 0) && (a?.pe ?? 0) === (b?.pe ?? 0);
/** The same cell – the score and its details (what goes to the other phones). */
export const sameCell = (a: Cell | undefined, b: Cell | undefined): boolean => sameScore(a, b) && sameDetail(a?.d, b?.d);
const withCell = (e: HoleEntry, c: Cell): HoleEntry => ({
  ...e,
  strokes: c?.s ?? null,
  pickedUp: !!c?.p,
  // the details only when they came along – a phone with an older app sends the score alone
  ...(c?.d ? { putts: c.d.pu ?? null, fairway: c.d.fw ?? null, sandShots: c.d.sa ?? 0, penalties: c.d.pe ?? 0, greensideBunker: (c.d.sa ?? 0) > 0 } : {}),
});
const nulls = (n: number): Cell[] => Array.from({ length: n }, () => null);
const isTeamEvent = (f: Round['format'] | undefined): boolean => isTeamMode(f?.mode);
/** Does every player mark a partner: in a tournament unless it says "everyone his own" (marker: false – Sascha 03.11.2026:
 *  "the choices as in Rounds"); a round of single balls when chosen (Sascha 30.10.2026: "it must be selectable whether
 *  one only enters one's own score or plays with a marker" – by default his own). */
export const marksIn = (f: Round['format'] | undefined, tournament: boolean): boolean => (tournament && f?.marker !== false) || (!isTeamEvent(f) && !!f?.marker);

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
// what a round knows of its players (a planned tournament's handicap index stays with the plan)
const framed = (ps: FlightPlayer[]) => ps.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, ...(p.tee ? { tee: p.tee } : {}) }));
const sameFrame = (a: FlightPlayer[], b: FlightPlayer[]): boolean => JSON.stringify(framed(a)) === JSON.stringify(framed(b));

/** The round's flight for the event: its players (or teams), scores, and the phone that set it up. */
export function flightOf(round: Round, id: string, name: string, phone: string, tournament: boolean, who: string): Flight {
  const me = round.players.find((p) => p.isMe)?.id ?? round.players[0]?.id;
  return {
    id,
    name,
    players: framePlayers(round),
    scores: scoresOf(round),
    ...(marksIn(round.format, tournament) ? { marks: {}, markers: defaultMarkers(round.players.map((p) => p.id)) } : {}),
    ...(round.format?.scorer && round.players.some((p) => p.id === round.format!.scorer) ? { scorer: round.format.scorer } : {}),
    phones: me ? { [phone]: { player: me, name: who, at: new Date().toISOString(), ...account() } } : {},
    by: phone,
    finishedAt: round.finishedAt,
  };
}

/** A flight's name: its players (a scramble team's name is its players already). */
export const flightName = (round: Pick<Round, 'players'>): string => round.players.map((p) => p.name).join(' · ');

/** The event of a round being shared. */
export function eventOf(round: Round, course: CourseSummary, o: { name: string; tournament: boolean; flight: string; phone: string; who: string; classes?: number[] }): RoundEvent {
  return {
    kind: 'round-event',
    id: newId(),
    name: o.name,
    tournament: o.tournament,
    course,
    ...eventFrame(round),
    createdAt: new Date().toISOString(),
    by: o.phone,
    ...(o.classes?.length ? { classes: o.classes } : {}),
    flights: { [o.flight]: flightOf(round, o.flight, flightName(round), o.phone, o.tournament, o.who) },
  };
}
/** The event with the round's frame in place of its own – what the round no longer has (a rating, a tee) goes too. */
export function withFrame(e: RoundEvent, round: Round): RoundEvent {
  const { tee: _t, rating: _r, format: _f, roundKind: _k, ...rest } = e;
  void _t;
  void _r;
  void _f;
  void _k;
  return { ...rest, ...eventFrame(round) };
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
    .filter(([, v]) => v.player === player && !misplaced(f, v, team))
    .sort((a, b) => (team ? a[1].at.localeCompare(b[1].at) : b[1].at.localeCompare(a[1].at)));
  return ph[0]?.[0] ?? null;
}

/** A phone in the flight that is this person's (Sascha 07.11.2026: "after ending the round I could not get back in"):
 *  the same account, or – without one – the same name. Each joining makes a new phone, so the old one still holds the
 *  player; his own player stays his. */
export function samePerson(entry: { uid?: string; name?: string } | undefined, name: string): boolean {
  if (!entry) return false;
  const uid = userId();
  if (uid && entry.uid) return entry.uid === uid;
  return !!name.trim() && (entry.name ?? '').trim().toLowerCase() === name.trim().toLowerCase();
}

const plainName = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Is this player (a team: one of its names) the person of this name? The same name – accents and case aside – or the
 *  same first name when one of the two is only a first name ("Cedric" in the plan, "Cedric Weber" in the profile). */
export function nameIs(player: string, who: string, team = false): boolean {
  const w = plainName(who);
  if (!w) return false;
  return (team ? player.split(' & ') : [player]).some((n) => {
    const x = plainName(n);
    return !!x && (x === w || ((!x.includes(' ') || !w.includes(' ')) && x.split(' ')[0] === w.split(' ')[0]));
  });
}
/** A phone that holds a player not its own (Sascha 08.11.2026, on the course: Cedric's place "on Sascha's phone" – the
 *  plan changed after joining, its places moved): its person is another player of the flight – not counted. */
function misplaced(f: Flight, v: { player: string; name?: string }, team: boolean): boolean {
  const who = v.name ?? '';
  const held = f.players.find((p) => p.id === v.player);
  if (!who.trim() || !held || nameIs(held.name, who, team)) return false;
  return f.players.some((p) => p.id !== v.player && nameIs(p.name, who, team));
}

/** Who signs a player's card as his marker: with a scorer, the scorer (his own card: his marker as usual). */
export const markerOf = (f: Flight, pid: string): string | undefined => (f.scorer && pid !== f.scorer ? f.scorer : f.markers?.[pid]);

export function roleOf(f: Flight, player: string, phone: string, team: boolean, marking: boolean): Role {
  if (isSigned(f, player)) return 'view'; // signed by player and marker: nobody changes it any more
  // one player keeps the score of all: his phone writes every card, the others only show them
  if (f.scorer) return writerOf(f, f.scorer, team) === phone ? (player === f.scorer ? 'own' : 'free') : 'view';
  const w = writerOf(f, player, team);
  if (w === phone) return 'own';
  // marking (marksIn): every player marks a partner (Sascha 29.10.2026, testing with Cedric: "Sascha keeps his own
  // score and, as marker, Cedric's; Cedric his own and, as marker, Sascha's")
  if (marking) {
    const m = f.markers?.[player];
    if (m && m !== player && writerOf(f, m, team) === phone) return 'mark';
  }
  return w == null ? 'free' : 'view';
}

// ---------- the card handed in (Sascha's concept 30.10.2026: "player and marker confirm, then it is locked") ----------
/** Signed by the player and by his marker (a player without a marker: by himself) – locked. */
export function isSigned(f: Flight, pid: string): boolean {
  const s = f.signed?.[pid];
  return !!s?.player && (!!s.marker || !markerOf(f, pid));
}
/** May the card be signed now: every hole with the own score and the marker's count, none differing. */
export function signable(f: Flight, pid: string, holes: number): { ok: true } | { ok: false; missing: number[]; differ: number[] } {
  const own = f.scores[pid] ?? [];
  const mark = f.marks?.[pid] ?? [];
  const marked = !f.scorer && !!f.markers?.[pid]; // with a scorer there is one count only
  const missing = Array.from({ length: holes }, (_, i) => i).filter((i) => own[i] == null || (marked && mark[i] == null));
  const differ = differences(f, pid);
  return missing.length || differ.length ? { ok: false, missing, differ } : { ok: true };
}
/** Signs a player's card – as the player himself or as his marker. False when not signable (yet) or offline. */
export async function signCard(round: Round, pid: string, as: 'player' | 'marker'): Promise<boolean> {
  const s = round.shared;
  if (!s) return false;
  const at = new Date().toISOString();
  const ev = await changeFlight(s.code, s.flight, !!s.tournament, (f) =>
    !f || f.signed?.[pid]?.[as] || !signable(f, pid, round.holes.length).ok ? null : { ...f, signed: { ...f.signed, [pid]: { ...f.signed?.[pid], [as]: at } } },
  );
  const ok = !!ev?.flights[s.flight]?.signed?.[pid]?.[as];
  // signed as the player: his marker is asked to countersign; as the marker: the player hears it is in (07.11.2026)
  if (ok && s.tournament) pushSigned(s.code, s.flight, pid, as);
  return ok;
}

/** A phone tells the flight it is still there at most this often (a write of its own otherwise only with a score). */
export const SEEN_EVERY = 2 * 60000;
/** Quiet this long, a team's keeper is likely gone (battery) – the others are offered the card. */
export const QUIET_AFTER = 10 * 60000;
/** Scramble and foursomes: the keeper of a team's card when his phone has been quiet a while – his name and the
 *  minutes; null while he is there (or this phone keeps it). */
export function quietKeeper(f: Flight | undefined, team: string, phone: string, now = Date.now()): { name: string; minutes: number } | null {
  if (!f || f.finishedAt) return null;
  const w = writerOf(f, team, true);
  if (!w || w === phone) return null;
  const ph = f.phones?.[w];
  if (!ph) return null;
  const quiet = now - new Date(ph.seen ?? ph.at).getTime();
  return quiet >= QUIET_AFTER ? { name: ph.name, minutes: Math.floor(quiet / 60000) } : null;
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
  /** the card signed by player and marker – locked */
  locked: boolean;
}
export function shareView(round: Round, f: Flight | undefined, tournament: boolean): Record<string, ShareView> {
  const share = round.shared;
  if (!share || !f) return {};
  const phone = share.phone ?? '';
  const team = isTeamEvent(round.format);
  const me = round.players.find((p) => p.isMe)?.id;
  const nameOf = (id: string | undefined) => round.players.find((p) => p.id === id)?.name ?? '';
  const marking = marksIn(round.format, tournament);
  return Object.fromEntries(
    round.players.map((p) => {
      const role = roleOf(f, p.id, phone, team, marking);
      const w = writerOf(f, p.id, team);
      const marker = f.markers?.[p.id];
      const other =
        !marking || !marker || f.scorer
          ? null
          : role === 'own'
            ? { label: `${nameOf(marker)} (${tr('marker', 'Zähler')})`, cells: f.marks?.[p.id] ?? [] }
            : role === 'mark'
              ? { label: tr(`${p.name} himself`, `${p.name} selbst`), cells: f.scores[p.id] ?? [] }
              : null;
      const locked = isSigned(f, p.id);
      return [p.id, { role, keptBy: role === 'view' && w ? (f.phones?.[w]?.name ?? null) : null, canTakeOver: !locked && team && role === 'view' && p.id === me, other, locked }];
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
  const marking = marksIn(round.format, tournament);
  // this phone in the flight: which player (or team) it is
  let me = round.players.find((p) => p.isMe)?.id;
  // the plan changed after joining and its places moved (Sascha 08.11.2026: Cedric's place "on Sascha's phone"): a
  // phone that took its players from the plan goes back to its person's own player
  let moved = false;
  if (f.by && f.by !== phone && who.trim()) {
    const now = f.players.find((p) => p.id === me);
    const named = f.players.filter((p) => nameIs(p.name, who, team));
    if (named.length === 1 && named[0].id !== me && !(now && nameIs(now.name, who, team))) {
      me = named[0].id;
      moved = true;
    }
  }
  if (me && f.phones?.[phone] && f.phones[phone].player !== me) {
    f = { ...f, phones: { ...f.phones, [phone]: { ...f.phones[phone], player: me, at: new Date().toISOString() } } };
    changedHere = true;
  } else if (me && !f.phones?.[phone]) {
    f = { ...f, phones: { ...f.phones, [phone]: { player: me, name: who, at: new Date().toISOString(), ...account() } } };
    changedHere = true;
  } else if (me && f.phones?.[phone] && Date.now() - new Date(f.phones[phone].seen ?? f.phones[phone].at).getTime() > SEEN_EVERY) {
    // still here (Sascha 30.10.2026: the keeper's battery – the others see when his phone went quiet)
    f = { ...f, phones: { ...f.phones, [phone]: { ...f.phones[phone], seen: new Date().toISOString() } } };
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
    // the scorer chosen in the setup after the code was made (02.11.2026) – only the phone that set the flight up
    const scorer = round.format?.scorer && round.players.some((p) => p.id === round.format!.scorer) ? round.format.scorer : undefined;
    if (f.by === phone && (f.scorer ?? undefined) !== scorer) {
      const { scorer: _old, ...rest } = f;
      f = scorer ? { ...rest, scorer } : rest;
      changedHere = true;
    }
  } else if (moved || !sameFrame(f.players, framePlayers(round))) {
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
    const role = roleOf(f, p.id, phone, team, marking);
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
      // a scorer keeps the cards – this player's own analysis stays on his phone (Sascha 02.11.2026: "each player can
      // still do his round analysis on his phone"): the scorer's strokes and penalties, his own putts, sand, tee shot
      if (role === 'view' && p.id === me && f.scorer) {
        if (!sameScore(there, local) || (there?.d?.pe ?? 0) !== (local?.d?.pe ?? 0)) {
          const own = list[i] ?? emptyEntry();
          const w = withCell(own, there);
          list[i] = { ...w, penalties: there?.d?.pe ?? 0, putts: own.putts, fairway: own.fairway, sandShots: own.sandShots, greensideBunker: own.greensideBunker, upAndDown: own.upAndDown, ...(own.puttsAt ? { puttsAt: own.puttsAt } : {}) };
          changedThere = true;
        }
        return there;
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
  const f: Flight = { ...f0, phones: { ...f0.phones, [phone]: { player: me, name: who, at: new Date().toISOString(), ...account() } } };
  const players: Player[] = f.players.map((p) => ({ id: p.id, name: p.name, playingHandicap: p.playingHandicap, isMe: p.id === me, ...(p.tee ? { tee: p.tee } : {}) }));
  const team = isTeamEvent(ev.format);
  const roles = Object.fromEntries(players.map((p) => [p.id, roleOf(f, p.id, phone, team, marksIn(ev.format, ev.tournament))]));
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
    // a flight off tee 10 (Games: flight.startHole, 9 = tee 10 – 04.11.2026) starts there and plays round to 9
    ...(() => { const s = (f as Flight & { startHole?: number }).startHole ?? 0; return s > 0 && s < ev.holes.length ? { currentHole: s, startHole: s } : { currentHole: 0 }; })(),
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
    playingHandicap: s.length === 1 ? s[0].playingHandicap : teamHandicap(fmt.mode, s.map((p) => p.playingHandicap)),
  }));
  const id = newId();
  const flight: Flight = {
    id,
    name: fp.map((p) => p.name).join(' · '),
    players: fp,
    scores: Object.fromEntries(fp.map((p) => [p.id, nulls(ev.holes.length)])),
    marks: {},
    markers: defaultMarkers(fp.map((p) => p.id)),
    phones: { [phone]: { player: 'me', name: who, at: new Date().toISOString(), ...account() } },
    by: phone,
    finishedAt: null,
  };
  return { round: roundFromEvent({ ...ev, tournament: true, flights: { ...ev.flights, [id]: flight } }, id, 'me', code, phone, who), flight };
}

/** The score a player stands with: his own – without one (no phone of his), the marker's. */
const scoreAt = (f: Flight, pid: string, i: number): Cell => f.scores[pid]?.[i] ?? f.marks?.[pid]?.[i] ?? null;

/** A tournament: the holes where a player's own score and his marker's differ (both entered). */
export function differences(f: Flight, pid: string): number[] {
  const own = f.scores[pid] ?? [];
  const mark = f.marks?.[pid] ?? [];
  return own.map((c, i) => (c != null && mark[i] != null && !sameScore(c, mark[i]) ? i : -1)).filter((i) => i >= 0);
}

/** The live leaderboard of all flights: every player (or team) of every flight, as the round's own board ranks them
 *  (stroke play, net or Stableford; a match in a flight counts as stroke play here). */
export function eventBoard(ev: RoundEvent): Board {
  const fmt = ev.format ?? DEFAULT_FORMAT;
  const players: Player[] = [];
  const entries: Round['entries'] = {};
  for (const f of liveFlights(ev)) {
    for (const p of f.players) {
      const id = `${f.id}/${p.id}`;
      players.push({ id, name: p.name, playingHandicap: p.playingHandicap, isMe: false });
      entries[id] = ev.holes.map((_, i) => withCell(emptyEntry(), scoreAt(f, p.id, i)));
    }
  }
  const round: Round = { id: ev.id, createdAt: ev.createdAt, finishedAt: null, courseId: ev.course.id, courseName: ev.course.name, loopOrder: ev.loopOrder, holes: ev.holes, mode: 'quick', players, entries, currentHole: 0 };
  return leaderboard(round, { ...fmt, mode: isTeamMode(fmt.mode) ? fmt.mode : 'single', matchplay: false });
}

// ---------- a tournament's standings (Sascha's concept 30.10.2026, the night run) ----------
// Gross or net, net classes by playing handicap, "T3" for a tie, "F" for a round finished – and once everyone is in,
// a tie broken by countback (R&A: the last 9, 6, 3 and the last hole, the holes' own net values with the handicap).

export interface Standing {
  key: string; // "<flight>/<player>"
  name: string;
  flight: string;
  /** the class by playing handicap: "A", "B" … ('' without classes) */
  cls: string;
  value: string;
  sort: number | null;
  thru: number;
  finished: boolean;
  /** "1", "T3", "–" */
  pos: string;
  /** placed by countback */
  countback: boolean;
  /** the card signed by player and marker */
  signed: boolean;
}
/** the names of the net classes, A to J (Sascha 03.11.2026: "there can be more than four – freely configurable") */
export const CLASS_NAMES = 'ABCDEFGHIJ'.split('');
/** The class of a playing handicap: limits [18] – A up to 18, B above; [12, 24] – A, B, C. */
export const classOf = (hcp: number | null, limits: number[] | undefined): string => (!limits?.length ? '' : CLASS_NAMES[limits.filter((l) => (hcp ?? 54) > l).length] ?? '');
/** Countback sums of a player's hole values: the last 9, 6, 3, 1 holes (fewer holes: as many as there are). */
const countbackOf = (per: (number | null)[]): number[] => [9, 6, 3, 1].map((n) => per.slice(-Math.min(n, per.length)).reduce<number>((s, v) => s + (v ?? 0), 0));

export function eventStandings(ev: RoundEvent, o: { gross?: boolean; cls?: string | null } = {}): { title: string; higherBetter: boolean; rows: Standing[] } {
  const fmt = ev.format ?? DEFAULT_FORMAT;
  const players: Player[] = [];
  const entries: Round['entries'] = {};
  const meta: Record<string, { flight: string; cls: string; signed: boolean }> = {};
  for (const f of liveFlights(ev)) {
    for (const p of f.players) {
      const id = `${f.id}/${p.id}`;
      players.push({ id, name: p.name, playingHandicap: p.playingHandicap, isMe: false });
      entries[id] = ev.holes.map((_, i) => withCell(emptyEntry(), scoreAt(f, p.id, i)));
      meta[id] = { flight: f.name, cls: classOf(p.playingHandicap, ev.classes), signed: isSigned(f, p.id) };
    }
  }
  const round: Round = { id: ev.id, createdAt: ev.createdAt, finishedAt: null, courseId: ev.course.id, courseName: ev.course.name, loopOrder: ev.loopOrder, holes: ev.holes, mode: 'quick', players, entries, currentHole: 0 };
  const hb = fmt.scoring === 'stableford';
  const gross = !!o.gross || (fmt.allowance ?? 100) === 0;
  const n = ev.holes.length;
  const single = players.filter((p) => !o.cls || meta[p.id].cls === o.cls).map((p) => ({ p, per: holeScoresOf(round, p.id, fmt, gross) }));
  // Better Ball (Sascha 07.11.2026: every mode in a tournament): each flight's pairs – players 1 & 2, 3 & 4 – rank as
  // one; on every hole the better of the two counts
  const sides =
    fmt.mode !== 'fourball'
      ? single
      : liveFlights(ev).flatMap((f) =>
          teamsOf('fourball', f.players.length).flatMap((team) => {
            const members = team.map((k) => single.find((x) => x.p.id === `${f.id}/${f.players[k].id}`)).filter((x): x is (typeof single)[number] => !!x);
            if (!members.length) return [];
            const per = ev.holes.map((_, i) => {
              const vs = members.map((m) => m.per[i]).filter((v): v is number => v != null);
              return vs.length ? (hb ? Math.max(...vs) : Math.min(...vs)) : null;
            });
            const id = members[0].p.id;
            meta[id] = { ...meta[id], signed: members.every((m) => meta[m.p.id].signed) };
            return [{ p: { ...members[0].p, name: members.map((m) => m.p.name).join(' & ') }, per }];
          }),
        );
  const all = sides.map(({ p, per }) => {
    const xs = per.filter((v): v is number => v != null);
    return { p, per, sort: xs.length ? xs.reduce((s, v) => s + v, 0) : null, thru: xs.length, cb: countbackOf(per) };
  });
  const better = (a: number, b: number) => (hb ? b - a : a - b);
  const everyoneIn = all.length > 0 && all.every((x) => x.thru === n);
  const cmp = (a: (typeof all)[number], b: (typeof all)[number]): number => {
    if (a.sort == null || b.sort == null) return a.sort == null ? (b.sort == null ? 0 : 1) : -1;
    if (a.sort !== b.sort) return better(a.sort, b.sort);
    if (!everyoneIn) return 0;
    for (let k = 0; k < 4; k++) if (a.cb[k] !== b.cb[k]) return better(a.cb[k], b.cb[k]);
    return 0;
  };
  const sorted = all.slice().sort(cmp);
  const unit = (v: number) => (hb ? tr(`${v} pts`, `${v} Pkt.`) : v === 0 ? 'Par' : v > 0 ? `+${v}` : String(v));
  const rows = sorted.map((x, k) => {
    const first = sorted.findIndex((y) => cmp(x, y) === 0);
    const tied = sorted.filter((y) => cmp(x, y) === 0).length > 1;
    const sameScore = sorted.filter((y) => y.sort != null && y.sort === x.sort).length > 1;
    return {
      key: x.p.id,
      name: x.p.name,
      flight: meta[x.p.id].flight,
      cls: meta[x.p.id].cls,
      value: x.sort == null ? '–' : unit(x.sort),
      sort: x.sort,
      thru: x.thru,
      finished: x.thru === n,
      pos: x.sort == null ? '–' : `${tied ? 'T' : ''}${first + 1}`,
      countback: everyoneIn && sameScore && !tied,
      signed: meta[x.p.id].signed,
      _k: k,
    };
  });
  const title = `${formatOf({ ...fmt, mode: isTeamMode(fmt.mode) ? fmt.mode : 'single', matchplay: false }).name()} · ${gross ? (hb ? tr('Stableford gross', 'Stableford brutto') : tr('gross', 'brutto')) : hb ? tr('Stableford net', 'Stableford netto') : tr('net', 'netto')}`;
  return { title, higherBetter: hb, rows: rows.map(({ _k, ...r }) => r) };
}
/** One player's card of an event – key "<flight>/<player>" as in eventStandings (Games' leaderboards, Sascha 04.11.2026:
 *  "every player's scorecards"): a round of him alone, for the scorecard table. */
export function eventCard(ev: RoundEvent, key: string): Round | null {
  const [fid, pid] = key.split('/');
  const f = ev.flights[fid];
  const p = f?.players.find((x) => x.id === pid);
  if (!f || !p) return null;
  return {
    id: ev.id + '-' + key,
    createdAt: ev.createdAt,
    finishedAt: null,
    courseId: ev.course.id,
    courseName: ev.course.name,
    loopOrder: ev.loopOrder,
    holes: ev.holes,
    mode: 'quick',
    players: [{ id: key, name: p.name, playingHandicap: p.playingHandicap, isMe: true }],
    entries: { [key]: ev.holes.map((_, i) => withCell(emptyEntry(), scoreAt(f, pid, i))) },
    currentHole: 0,
    ...(p.tee ? { tee: p.tee } : {}),
  };
}
/** The results as a list to keep or pass on (CSV, semicolons as a spreadsheet in German takes them). */
export function standingsCsv(ev: RoundEvent, gross = false): string {
  const s = eventStandings(ev, { gross });
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = [tr('Place', 'Platz'), tr('Player', 'Spieler'), 'Flight', ...(ev.classes?.length ? [tr('Class', 'Klasse')] : []), s.higherBetter ? tr('Points', 'Punkte') : tr('To par', 'Zu Par'), tr('Holes', 'Löcher'), tr('Countback', 'Stechen')];
  const lines = s.rows.map((r) => [r.pos, r.name, r.flight, ...(ev.classes?.length ? [r.cls] : []), r.sort ?? '', r.thru, r.countback ? tr('yes', 'ja') : ''].map(q).join(';'));
  return [`${q(ev.name)};${q(s.title)}`, head.map(q).join(';'), ...lines].join('\n');
}
/** A tournament's flights as they stand: holes played, and when a phone of the flight was last heard of. */
export function flightStatus(ev: RoundEvent, now = Date.now()): { id: string; name: string; thru: number; quietMin: number | null; finished: boolean }[] {
  return liveFlights(ev).map((f) => {
    const thru = Math.max(0, ...f.players.map((p) => ev.holes.filter((_, i) => scoreAt(f, p.id, i) != null).length));
    const last = Math.max(0, ...Object.values(f.phones ?? {}).map((ph) => new Date(ph.seen ?? ph.at).getTime()));
    return { id: f.id, name: f.name, thru, quietMin: last ? Math.floor((now - last) / 60000) : null, finished: !!f.finishedAt || thru === ev.holes.length };
  });
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
export async function shareRound(round: Round, course: CourseSummary, o: { name: string; tournament: boolean; who: string; classes?: number[] }): Promise<Round | null> {
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
        keepHosted(code, Date.now() + HOSTED_HOURS * 3600 * 1000); // the host lets the others in
        const roles = Object.fromEntries(round.players.map((p) => [p.id, roleOf(ev.flights[flight], p.id, phone, isTeamEvent(round.format), marksIn(round.format, o.tournament))]));
        return { ...round, shared: { code, flight, tournament: o.tournament, phone, roles, base: ev.flights[flight].scores } };
      }
      if (r.status !== 409) return null; // 409: the code is taken – another one
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A round invited in its setup, started now (03.11.2026: the code is made as soon as the setup opens – Sascha: "the QR
 * code at once, without a click"; what was changed after it must reach the others): the event takes the round as it
 * starts – holes, format, its players, the scorer and the markers; the phones that joined meanwhile stay. The round
 * with its roles anew; as it was when offline (the code and the QR code still work, the exchange follows).
 */
export async function startShared(round: Round, who: string): Promise<Round> {
  const s = round.shared;
  if (!s?.phone || s.tournament) return round;
  const fresh = flightOf(round, s.flight, flightName(round), s.phone, false, who);
  const ev = await update(s.code, (e) => {
    const old = e.flights[s.flight];
    // the scores entered by a joined phone already stay (none yet as a rule – nobody plays before the start)
    const scores = old ? Object.fromEntries(Object.entries(fresh.scores).map(([pid, cells]) => [pid, old.scores?.[pid] ?? cells])) : fresh.scores;
    return { ...withFrame(e, round), flights: { ...e.flights, [s.flight]: { ...fresh, scores, phones: { ...fresh.phones, ...(old?.phones ?? {}) } } } }; // the phones as they joined – the host's first (he keeps a team's card)
  });
  const f = ev?.flights[s.flight];
  if (!f) return round;
  keepEvent(s.code, ev!);
  const roles = Object.fromEntries(round.players.map((p) => [p.id, roleOf(f, p.id, s.phone!, isTeamEvent(round.format), marksIn(round.format, false))]));
  return { ...round, shared: { ...s, roles, base: f.scores } };
}

/** A series of planned tournaments (Sascha 01.11.2026: "several tournaments as a series, one code for all"): its
 *  rounds as the series' row shows them – the events themselves are the truth (Games keeps this list in step). */
export interface TourSeries {
  kind: 'tour-series';
  id: string;
  name: string;
  createdAt: string;
  deletedAt?: string | null;
  rounds: { code: string; date: string; name: string; course: { id: string; name: string } }[];
}
export const isSeries = (x: unknown): x is TourSeries => !!x && (x as TourSeries).kind === 'tour-series' && Array.isArray((x as TourSeries).rounds);

/** Joins an event with its code: the event (host, or let in), a series (in all its rounds), 'ask' when the host has to let this phone in first
 *  (askByCode), 'game' for a game's code (join it under Games), 'none' for nothing with this code, null for no
 *  connection. */
export async function joinEvent(code: string): Promise<RoundEvent | TourSeries | 'ask' | 'game' | 'none' | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/golfos_join_game`, { method: 'POST', headers: h, body: JSON.stringify({ join_code: cleanCode(code) }) });
    if (!r.ok) return null;
    const ev = await r.json();
    if (isGame(ev) || isPool(ev)) return 'game'; // a pool of bets lives in Games too (01.11.2026)
    if ((ev as { kind?: string } | null)?.kind === 'ask-host') return 'ask';
    if (isSeries(ev)) return ev; // a series of tournaments: this account is in all its rounds now
    if (!isEvent(ev)) return 'none';
    // a tournament: its flights as their own rows have them (who is where, the scores)
    const rows = ev.tournament ? await flightRows(cleanCode(code), h) : 'legacy';
    const out = rows && rows !== 'legacy' ? withRows(ev, rows) : ev;
    keepEvent(cleanCode(code), out);
    return out;
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

// ---------- a tournament: one row per flight (Sascha 30.10.2026, the night run: "12 or more phones must not slow each
// other down") ----------
// The event's row keeps the frame (name, holes, format); each flight has a row "<code>-<flight>" of its own, written
// by its phones only – a tournament's phones no longer queue for one row. The leaderboard reads all of them. A round
// of one flight stays in the event's row (as before – the Saturday's scramble); so does a tournament on a server
// without the SQL of 30.10.2026 (event_code) – it is asked once.
interface FlightRow {
  kind: 'round-flight';
  flight: Flight;
}
const isFlightRow = (x: unknown): x is FlightRow => !!x && (x as FlightRow).kind === 'round-flight' && !!(x as FlightRow).flight;
const flightCode = (code: string, fid: string) => `${code}-${fid}`;
let split: boolean | null = null; // the server keeps flights apart: unknown yet / yes / no
type Rows = Record<string, { flight: Flight; at: string }>;
/** The flights' own rows of an event – 'legacy' for a server without them, null when offline. */
async function flightRows(code: string, h: Record<string, string>): Promise<Rows | 'legacy' | null> {
  if (split === false) return 'legacy';
  try {
    const r = await fetch(`${table()}?event_code=eq.${encodeURIComponent(code)}&select=game,updated_at`, { headers: h });
    if (r.status === 400) {
      split = false; // no column event_code: the SQL not run yet
      return 'legacy';
    }
    if (!r.ok) return null;
    split = true;
    const out: Rows = {};
    for (const row of (await r.json()) as { game: unknown; updated_at: string }[]) if (isFlightRow(row.game)) out[row.game.flight.id] = { flight: row.game.flight, at: row.updated_at };
    return out;
  } catch {
    return null;
  }
}
const withRows = (ev: RoundEvent, rows: Rows): RoundEvent => ({ ...ev, flights: { ...ev.flights, ...Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.flight])) } });
/** The event with its flights' own rows (kept for the leaderboard). */
async function readEvent(code: string, h: Record<string, string>): Promise<{ ev: RoundEvent; rows: Rows | 'legacy' } | null> {
  const [r, rows] = await Promise.all([fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=game`, { headers: h }).catch(() => null), flightRows(code, h)]);
  if (!r?.ok || rows == null) return null;
  const game = ((await r.json()) as { game: unknown }[])[0]?.game;
  if (!isEvent(game)) return null;
  return { ev: rows === 'legacy' ? game : withRows(game, rows), rows };
}
/** The event as it stands, read only (the scorecard, away from the hole map's exchange) – kept for the boards. */
export async function refreshEvent(code: string): Promise<RoundEvent | null> {
  const h = await headers();
  if (!h) return null;
  const read = await readEvent(code, h);
  if (read) keepEvent(code, read.ev);
  return read?.ev ?? null;
}
/**
 * A flight's row changed by `change` – only if nobody wrote in between (else read again, up to four times); a flight
 * without a row yet gets one. The event with all flights; 'legacy' when the server keeps flights in the event's row,
 * null when offline.
 */
async function updateFlight(code: string, fid: string, change: (f: Flight | undefined, ev: RoundEvent) => Flight | null): Promise<RoundEvent | 'legacy' | null> {
  const h = await headers();
  if (!h) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const read = await readEvent(code, h);
    if (!read) return null;
    if (read.rows === 'legacy') return 'legacy';
    const own = read.rows[fid];
    const next = change(own?.flight ?? read.ev.flights[fid], read.ev);
    if (!next) {
      keepEvent(code, read.ev);
      return read.ev;
    }
    try {
      const w = own
        ? await fetch(`${table()}?code=eq.${encodeURIComponent(flightCode(code, fid))}&updated_at=eq.${encodeURIComponent(own.at)}`, {
            method: 'PATCH',
            headers: { ...h, Prefer: 'return=representation' },
            body: JSON.stringify({ game: { kind: 'round-flight', flight: next }, updated_at: new Date().toISOString() }),
          })
        : await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ code: flightCode(code, fid), event_code: code, game: { kind: 'round-flight', flight: next } }) });
      if (!w.ok && w.status !== 409) return null;
      if (w.ok && ((await w.json()) as unknown[]).length) {
        const ev = { ...read.ev, flights: { ...read.ev.flights, [fid]: next } };
        keepEvent(code, ev);
        return ev;
      }
      // another phone wrote (or made the row) in between: read again
    } catch {
      return null;
    }
  }
  return null;
}
/** The flight changed by `change`: its own row in a tournament (if the server has them), else in the event's row. */
async function changeFlight(code: string, fid: string, tournament: boolean, change: (f: Flight | undefined, ev: RoundEvent) => Flight | null): Promise<RoundEvent | null> {
  if (tournament) {
    const ev = await updateFlight(code, fid, change);
    if (ev !== 'legacy') return ev;
  }
  return update(code, (e) => {
    const f = change(e.flights[fid], e);
    return f ? { ...e, flights: { ...e.flights, [fid]: f } } : null;
  });
}

// ---------- a tournament planned ahead in Games (Sascha 01.11.2026: "tournaments planned in Games, played in Rounds")
// The host sets the day, the course, the format and the flights with their markers; Rounds joins a flight on the day
// ("which player am I") and plays it as any tournament – marks, signing, the leaderboard. Only the host changes the plan.

export interface PlanFlight {
  name?: string;
  /** "HH:MM" on the course */
  teeTime?: string;
  /** the hole it starts on, 0-based (9: tee 10) */
  startHole?: number;
  /** in scramble and foursomes the teams */
  players: { name: string; playingHandicap: number | null; tee?: string | null; hcpIndex?: number | null; members?: TeamMember[] }[];
  /** markers[player] = who marks him, by the players' places "p1", "p2" … – missing: in pairs (1 ↔ 2, 3 ↔ 4) */
  markers?: Record<string, string>;
  /** one player keeps the score of all, by his place ("p2") – Sascha 02.11.2026 */
  scorer?: string;
}
const planFlight = (pf: PlanFlight, holes: number, by: string, id = newId()): Flight => {
  const players: FlightPlayer[] = pf.players.map((p, k) => ({ id: `p${k + 1}`, name: p.name, playingHandicap: p.playingHandicap, ...(p.tee ? { tee: p.tee } : {}), ...(p.hcpIndex != null ? { hcpIndex: p.hcpIndex } : {}), ...(p.members?.length ? { members: p.members } : {}) }));
  return {
    id,
    name: pf.name?.trim() || players.map((p) => p.name).join(' · '),
    ...(pf.teeTime ? { teeTime: pf.teeTime } : {}),
    ...(pf.startHole ? { startHole: pf.startHole } : {}),
    players,
    scores: Object.fromEntries(players.map((p) => [p.id, nulls(holes)])),
    marks: {},
    markers: pf.markers ?? defaultMarkers(players.map((p) => p.id)),
    ...(pf.scorer && players.some((p) => p.id === pf.scorer) ? { scorer: pf.scorer } : {}),
    phones: {},
    by,
    finishedAt: null,
  };
};

/** A tournament planned ahead: the event with its flights – nobody playing yet. `holes` and `loopOrder` from
 *  lib/loops (buildRoundHoles, the option's loops), the playing handicaps from lib/handicap playingHandicapFor. */
export function plannedEvent(o: {
  name: string;
  date: string;
  course: CourseSummary;
  holes: RoundHole[];
  loopOrder: string[];
  format: NonNullable<Round['format']>;
  tee?: string;
  rating?: Round['rating'];
  roundKind?: Round['kind'];
  classes?: number[];
  flights: PlanFlight[];
  /** Long Drive, Nearest to the Pin (lib/specials) */
  specials?: Special[];
}): RoundEvent {
  const by = newId(); // the planner – never a playing phone: every phone takes the players from the plan
  const flights = Object.fromEntries(o.flights.map((pf) => planFlight(pf, o.holes.length, by)).map((f) => [f.id, f]));
  return {
    kind: 'round-event',
    id: newId(),
    name: o.name,
    tournament: true,
    course: o.course,
    loopOrder: o.loopOrder,
    holes: o.holes,
    format: o.format,
    ...(o.tee ? { tee: o.tee } : {}),
    ...(o.rating ? { rating: o.rating } : {}),
    ...(o.roundKind ? { roundKind: o.roundKind } : {}),
    ...(o.classes?.length ? { classes: o.classes } : {}),
    ...(o.specials?.length ? { specials: o.specials } : {}),
    createdAt: new Date().toISOString(),
    by,
    flights,
    date: o.date,
    planned: true,
  };
}

/** One more flight for a planned tournament (the host adds it later) – then updatePlannedEvent. */
export const plannedFlight = (ev: RoundEvent, pf: PlanFlight): Flight => planFlight(pf, ev.holes.length, ev.by ?? newId());

/** Puts a planned tournament on the server: the event and a row per flight. Its code, or null (no connection). */
export async function publishPlannedEvent(ev: RoundEvent): Promise<string | null> {
  const h = await headers();
  if (!h) return null;
  const { flights, ...frame } = ev;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    try {
      // the frame first with its flights (a server without flight rows keeps them there), then each flight's own row
      const r = await fetch(table(), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ code, game: { ...frame, flights } }) });
      if (r.status === 409) continue; // the code is taken – another one
      if (!r.ok) return null;
      for (const f of Object.values(flights)) if (!(await addFlight(code, f))) return null;
      keepEvent(code, ev);
      return code;
    } catch {
      return null;
    }
  }
  return null;
}

/** The host changes the plan: name, day, course, format, flights (players, markers) – and calls it off (deletedAt). A
 *  flight already played keeps its scores, marks and phones; a flight left out is emptied (no players). The event as
 *  written, or null (no connection, or another change came in between four times). */
export async function updatePlannedEvent(code: string, ev: RoundEvent): Promise<RoundEvent | null> {
  const { flights, ...frame } = ev;
  // what the setup may take away is taken away (Sascha 09.11.2026: "3 net classes set to none and saved – it shows 3
  // again"): the net classes, the special prizes, the tee – absent from the change, absent from the event
  const written = await update(code, (now) => {
    const { classes: _c, specials: _s, tee: _t, ...kept } = now as RoundEvent & { tee?: string };
    void _c;
    void _s;
    void _t;
    return { ...kept, ...frame, flights: now.flights };
  });
  // every flight as it stands – its own rows too (a flight added after the plan lives only there)
  const now = written ? await refreshEvent(code) : null;
  if (!now) return null;
  const ids = new Set([...Object.keys(now.flights), ...Object.keys(flights)]);
  for (const fid of ids) {
    const want = flights[fid];
    const done = await changeFlight(code, fid, true, (f) => {
      if (!want) return f && f.players.length ? { ...f, players: [], markers: {} } : null;
      const players = want.players;
      const next: Flight = { ...(f ?? want), name: want.name, players, markers: want.markers, scorer: want.scorer, ...(want.teeTime ? { teeTime: want.teeTime } : {}), startHole: want.startHole ?? 0, scores: Object.fromEntries(players.map((p) => [p.id, f?.scores[p.id] ?? nulls(ev.holes.length)])) };
      return f && JSON.stringify(f) === JSON.stringify(next) ? null : next;
    });
    if (!done) return null;
  }
  return refreshEvent(code);
}

/** A special prize's entry of a player – by his phone at the hole, or the host's correction from Games; null takes it
 *  back. Written into the flight's own row, as the scores. The event as written, or null (no connection). */
export async function setSpecial(code: string, fid: string, sid: string, pid: string, entry: SpecialEntry | null): Promise<RoundEvent | null> {
  const ev = await writeSpecial(code, fid, sid, pid, entry);
  // a new best? the server works it out – everyone in the tournament hears of it (their own switch, 07.11.2026)
  if (ev && entry) pushSpecial(code, sid);
  return ev;
}
function writeSpecial(code: string, fid: string, sid: string, pid: string, entry: SpecialEntry | null): Promise<RoundEvent | null> {
  return changeFlight(code, fid, true, (f) => {
    if (!f) return null;
    const now = { ...(f.specials?.[sid] ?? {}) };
    if (entry) now[pid] = entry;
    else if (now[pid]) delete now[pid];
    else return null;
    return { ...f, specials: { ...f.specials, [sid]: now } };
  });
}

/** A flight ended by mistake opened again by the host (Sascha 03.11.2026: "Cedric ended the round by accident – then he
 *  did not get in any more"): finished no more, its scores kept – its players take part again. The event, or null. */
export function reopenFlight(code: string, fid: string): Promise<RoundEvent | null> {
  return changeFlight(code, fid, true, (f) => (f?.finishedAt ? { ...f, finishedAt: null } : null));
}

/** A flight's scores entered afterwards by the host (Sascha 08.11.2026: "we also need to enter yesterday's scores
 *  afterwards"): the strokes of each player per hole – null clears a hole. They are the card: the player's own and, where
 *  a marker counted, his count too (no "marker differs" left behind); the details of a hole kept while its strokes stay.
 *  Pure – for the tests and for writeScores. */
export function withScores(f: Flight, typed: Record<string, (number | null)[]>): Flight {
  const put = (row: Cell[] | undefined, vals: (number | null)[]): Cell[] =>
    vals.map((v, i) => {
      const old = row?.[i] ?? null;
      if (v == null) return null;
      return old && old.s === v ? old : { s: v, ...(old?.d ? { d: old.d } : {}) };
    });
  const scores = { ...f.scores };
  const marks = { ...(f.marks ?? {}) };
  const entered = { ...(f.entered ?? {}) };
  const now = new Date().toISOString();
  for (const [pid, vals] of Object.entries(typed)) {
    if (!f.players.some((p) => p.id === pid)) continue;
    scores[pid] = put(f.scores[pid], vals);
    if (f.marks?.[pid]) marks[pid] = put(f.marks[pid], vals);
    // entered by the host: counted for the bets as a signed card (Sascha 08.11.2026)
    if (vals.some((v) => v != null)) entered[pid] = now;
  }
  return { ...f, scores, ...(f.marks ? { marks } : {}), ...(Object.keys(entered).length ? { entered } : {}) };
}
/** The host's scores of a flight written into its row (the leaderboard, the series, the spectators – and the bets, from
 *  the tournaments in a pool's days: lib/wagerstore tourRounds). The event, or null. */
export function writeScores(code: string, fid: string, typed: Record<string, (number | null)[]>): Promise<RoundEvent | null> {
  return changeFlight(code, fid, true, (f) => (f ? withScores(f, typed) : null));
}

/** The flights that play – a flight the host took out of the plan keeps its row, empty (updatePlannedEvent). */
export const liveFlights = (ev: RoundEvent): Flight[] => Object.values(ev.flights).filter((f) => f.players.length > 0);

/** Today on this phone, "YYYY-MM-DD". */
export const localDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A planned tournament before its day: joined already, played only on the day. */
export const plannedAhead = (ev: RoundEvent, today = localDay()): boolean => !!ev.planned && !!ev.date && ev.date > today;
/** The flight a name plays in (a team's name holds it with " & ") – for "your flight · 09:20". */
export function flightOfName(ev: RoundEvent, name: string): Flight | null {
  if (!name.trim()) return null;
  const hits = liveFlights(ev).filter((f) => f.players.some((p) => nameIs(p.name, name, true)));
  return hits.length === 1 ? hits[0] : null;
}

/** A tournament that is over for this player (Sascha 02.11.2026: "an expired tournament must go from the start page
 *  again"): its day gone, his own flight finished, every flight finished – or six hours after the last tee time. */
export function tournamentOver(ev: RoundEvent, name: string, now = new Date()): boolean {
  const flights = liveFlights(ev);
  if (flightOfName(ev, name)?.finishedAt) return true;
  if (flights.length > 0 && flights.every((f) => f.finishedAt)) return true;
  return playOver(ev, now);
}

/** Back into a tournament (Sascha 07.11.2026, on the course: "some ended the round and could not get back in –
 *  finished and taking part again must work"): on its day his own flight finished – offered
 *  as "Wieder teilnehmen"; joining opens the flight again. */
export function canRejoin(ev: RoundEvent, name: string, now = new Date()): boolean {
  if (ev.deletedAt || (ev.date && ev.date !== localDay(now))) return false;
  return !!flightOfName(ev, name)?.finishedAt; // the whole day – ended by mistake at any hour
}

/** The day is gone, or six hours after the last tee time (from when it was set up, set up later). */
function playOver(ev: RoundEvent, now: Date): boolean {
  const today = localDay(now);
  if (ev.date && ev.date < today) return true;
  const flights = liveFlights(ev);
  const last = flights.map((f) => f.teeTime ?? '').filter((t) => /^\d{1,2}:\d{2}$/.test(t)).sort((a, b) => a.padStart(5, '0').localeCompare(b.padStart(5, '0'))).pop();
  if (ev.date === today && last) {
    const [h, m] = last.split(':').map(Number);
    const tee = new Date(now);
    tee.setHours(h, m, 0, 0);
    // set up after its tee time (Sascha 03.11.2026: "planned for today at four, 09:00 left as it was – Cedric could take
    // part, I could not"): the six hours from when it was set up
    const from = Math.max(tee.getTime(), new Date(ev.createdAt).getTime() || 0);
    if (now.getTime() - from > 6 * 3600 * 1000) return true;
  }
  return false;
}

/** This account's planned tournaments on their day – Rounds shows them from 00:01 (Sascha 01.11.2026): the ones it
 *  planned and the ones it joined by code or link; called off ones not. */
export async function tournamentsToday(): Promise<{ code: string; ev: RoundEvent }[]> {
  return (await tournamentsAhead()).filter((t) => t.ev.date === localDay());
}

/** This account's planned tournaments from today on, soonest first – Rounds shows them ahead too (Sascha 02.11.2026:
 *  "tournaments already planned should show under Rounds"); called off ones not. */
export async function tournamentsAhead(): Promise<{ code: string; ev: RoundEvent }[]> {
  const h = await headers();
  if (!h) return [];
  try {
    const r = await fetch(`${table()}?select=code,game&event_code=is.null&game->>planned=eq.true&game->>date=gte.${localDay()}`, { headers: h });
    if (!r.ok) return [];
    const out: { code: string; ev: RoundEvent }[] = [];
    for (const row of (await r.json()) as { code: string; game: unknown }[]) {
      if (!isEvent(row.game) || row.game.deletedAt) continue;
      // today's with its flights as they stand (who is on which phone); the later ones as planned
      out.push({ code: row.code, ev: row.game.date === localDay() ? ((await refreshEvent(row.code)) ?? row.game) : row.game });
    }
    return out.sort((a, b) => (a.ev.date ?? '').localeCompare(b.ev.date ?? ''));
  } catch {
    return [];
  }
}

/** A tournament's new flight goes into the event (its own row, the event marked a tournament). */
export async function addFlight(code: string, flight: Flight): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  const rows = await flightRows(code, h);
  if (rows == null) return false;
  if (rows === 'legacy') return (await update(code, (ev) => ({ ...ev, tournament: true, flights: { ...ev.flights, [flight.id]: flight } }))) != null;
  if ((await update(code, (ev) => (ev.tournament ? null : { ...ev, tournament: true }))) == null) return false;
  return (await updateFlight(code, flight.id, () => flight)) != null;
}

/** Scramble and foursomes: this phone takes the team's card over (Sascha: "Sascha's battery is empty – Cedric goes on"). */
export async function takeOver(round: Round, team: string): Promise<boolean> {
  const s = round.shared;
  if (!s?.phone) return false;
  const ev = await changeFlight(s.code, s.flight, !!s.tournament, (f) => (!f || f.keeper?.[team] === s.phone ? null : { ...f, keeper: { ...f.keeper, [team]: s.phone! } }));
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
  // the holes and the format from the phone that set the event up (changed in the setup after the code was made)
  const frameOf = (e: RoundEvent) => (e.by === share.phone && JSON.stringify(eventFrame(r0)) !== JSON.stringify(eventFrame({ ...r0, ...pickFrame(e) })) ? eventFrame(r0) : null);
  let ev: RoundEvent | null = null;
  // a tournament: the flight's own row (the frame, rarely changed, in the event's row)
  const own = share.tournament ? await updateFlight(share.code, share.flight, (f, e) => ((merged = mergeFlight(r0, f, e.tournament, who)).changedHere ? merged.flight : null)) : 'legacy';
  if (own === null) return null;
  if (own !== 'legacy') {
    ev = own;
    if (frameOf(own)) {
      const written = await update(share.code, (e) => (frameOf(e) ? withFrame(e, r0) : null));
      if (written) {
        ev = { ...written, flights: own.flights }; // the flights as their own rows have them
        keepEvent(share.code, ev);
      }
    }
  } else
    ev = await update(share.code, (e) => {
      merged = mergeFlight(r0, e.flights[share.flight], e.tournament, who);
      const frame = frameOf(e);
      return merged.changedHere || frame ? { ...(frame ? withFrame(e, r0) : e), flights: { ...e.flights, [share.flight]: merged.flight } } : null;
    });
  if (!ev || !merged) return null;
  const m = merged as ReturnType<typeof mergeFlight>;
  // another phone set the holes: taken over while nothing is entered yet
  let out = m.round;
  if (ev.by !== share.phone && ev.holes.map((h) => h.label).join() !== out.holes.map((h) => h.label).join() && !Object.values(out.entries).some((l) => l.some((e) => e.strokes != null || e.pickedUp))) {
    out = { ...out, ...eventFrame({ ...out, ...pickFrame(ev) }), entries: Object.fromEntries(out.players.map((p) => [p.id, ev.holes.map(() => emptyEntry())])) };
  }
  // … and the format changed after this phone joined (03.11.2026: the code is made as the setup opens – the host picks
  // scramble or the scorer after it): taken over while nothing is entered yet
  else if (ev.by !== share.phone && JSON.stringify(ev.format ?? null) !== JSON.stringify(out.format ?? null) && !Object.values(out.entries).some((l) => l.some((e) => e.strokes != null || e.pickedUp))) {
    out = { ...out, ...(ev.format ? { format: ev.format } : {}), ...(ev.roundKind ? { kind: ev.roundKind } : {}) };
  }
  // the flight ended here – every flight in: the tournament's result is told (lib/tourstore, Sascha 07.11.2026)
  if (ev.tournament && round.finishedAt && liveFlights(ev).every((f) => f.finishedAt)) window.dispatchEvent(new CustomEvent('golfos:event-in', { detail: { code: share.code, ev } }));
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
      body: JSON.stringify({ near_lat: at.lat, near_lon: at.lon, near_radius: Math.round(at.radius), near_host: host, near_until: new Date(until).toISOString(), near_ref: ref }),
    });
    if (r.ok) {
      keepHosted(code, until);
      setNearbyUntil(code, until);
    }
    return r.ok;
  } catch {
    return false;
  }
}

/** No longer shown nearby (Sascha 04.11.2026: "I could switch it on, but not off again"). */
export async function hideNearby(code: string): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  try {
    const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({ near_lat: null, near_lon: null, near_radius: null, near_host: null, near_until: null, near_ref: null }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
/** Till when this phone shows the round nearby (the switch stays on when the setup opens again). */
const NEAR_ON = 'golfos.nearon.v1.';
export function nearbyUntil(code: string): number {
  try {
    return Number(localStorage.getItem(NEAR_ON + code) ?? 0);
  } catch {
    return 0;
  }
}
export function setNearbyUntil(code: string, until: number): void {
  try {
    if (until > Date.now()) localStorage.setItem(NEAR_ON + code, String(until));
    else localStorage.removeItem(NEAR_ON + code);
  } catch {
    /* no storage – the switch starts off */
  }
}

// the rounds this phone hosts, till when – their join requests are looked for meanwhile (JoinRequests): 12 hours from
// the code, or as long as shown nearby (Sascha 30.10.2026: "the host confirms every joining")
const HOSTED = 'golfos.hosted.v1.';
const NEAR_OLD = 'golfos.near.v1.'; // 29.10.2026: only the rounds shown nearby
export const HOSTED_HOURS = 12;
export function keepHosted(code: string, until: number): void {
  try {
    if (Number(localStorage.getItem(HOSTED + code) ?? 0) >= until) return;
    localStorage.setItem(HOSTED + code, String(until));
    window.dispatchEvent(new Event('golfos:near-changed'));
  } catch {
    /* storage full – the requests wait */
  }
}
/** The codes this phone hosts right now (the ones past their time forgotten). */
export function hostedCodes(): string[] {
  const out = new Set<string>();
  try {
    for (const k of Object.keys(localStorage)) {
      const pre = k.startsWith(HOSTED) ? HOSTED : k.startsWith(NEAR_OLD) ? NEAR_OLD : null;
      if (!pre) continue;
      if (Number(localStorage.getItem(k)) > Date.now()) out.add(k.slice(pre.length));
      else localStorage.removeItem(k);
    }
  } catch {
    /* no storage */
  }
  return [...out];
}

export type JoinAnswer = { state: 'asked' | 'no' | 'gone' } | { state: 'ok'; code: string };
const answerOf = (a: { state?: string; code?: string } | null): JoinAnswer =>
  a?.state === 'ok' && typeof a.code === 'string' ? { state: 'ok', code: a.code } : a?.state === 'asked' || a?.state === 'no' ? { state: a.state } : { state: 'gone' };
/** A request, with the handicap index for the host's list – a server from before 30.10.2026 takes it without. */
async function askRpc(fn: string, args: Record<string, unknown>, hcp: string): Promise<Response | null> {
  const h = await headers();
  if (!h) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify({ ...args, hcp }) });
  return r.status === 404 && fn === 'golfos_request_join' ? fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(args) }) : r;
}
/** Asks to join a round nearby – asked again, how it stands ('ok' with the code once the host let this phone in).
 *  Null when offline. */
export async function askToJoin(ref: string, who: string, hcp = ''): Promise<JoinAnswer | null> {
  try {
    const r = await askRpc('golfos_request_join', { join_ref: ref, who }, hcp);
    if (!r?.ok) return null;
    return answerOf(await r.json());
  } catch {
    return null;
  }
}
/** Asks to join a round by its code (QR, link, typed) – asked again, how it stands. 'none' for no round with this
 *  code; 'direct' when the server lets everyone in with the code (the SQL of 30.10.2026 not run yet). */
export async function askByCode(code: string, who: string, hcp = ''): Promise<JoinAnswer | { state: 'none' | 'direct' } | null> {
  try {
    const r = await askRpc('golfos_ask_join', { join_code: cleanCode(code), who }, hcp);
    if (!r) return null;
    if (r.status === 404) return { state: 'direct' };
    if (!r.ok) return null;
    const a = (await r.json()) as { state?: string; code?: string } | null;
    return a?.state === 'none' ? { state: 'none' } : answerOf(a);
  } catch {
    return null;
  }
}
export interface JoinRequest {
  /** the asking player's account */
  id: string;
  name: string;
  /** his handicap index as in his profile ('' unknown) */
  hcp: string;
  at: string;
}
/** The requests to join a round (by its code or nearby), not answered yet – oldest first. */
export async function joinRequests(code: string): Promise<JoinRequest[]> {
  const h = await headers();
  if (!h) return [];
  try {
    const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=near_requests`, { headers: h });
    if (!r.ok) return [];
    const rows = (await r.json()) as { near_requests?: Record<string, { name?: string; hcp?: string; at?: string; state?: string }> | null }[];
    return Object.entries(rows[0]?.near_requests ?? {})
      .filter(([, x]) => x?.state === 'asked')
      .map(([id, x]) => ({ id, name: x.name || tr('A player', 'Ein Spieler'), hcp: x.hcp ?? '', at: x.at ?? '' }))
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
export const roundJoinLink = (code: string): string => `${linkBase()}#round=${code}`;

// ---------- a linked friend invited with a tap (Sascha 03.11.2026: "invite a friend to a round with one click – a
// push, or better a request right in the app when it is open, so he joins straight away")

/** The accounts already in a round, tournament, series, game or pool (Sascha 06.11.2026: "Christopher invited and in –
 *  at mine it still says 'Einladen'") – null when it cannot be asked (offline, not signed in). */
export async function rowMembers(code: string): Promise<string[] | null> {
  const h = await headers();
  if (!h) return null;
  try {
    const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=members`, { headers: h });
    if (!r.ok) return null;
    const rows = (await r.json()) as { members?: string[] | null }[];
    return rows.length ? (rows[0].members ?? []) : null;
  } catch {
    return null;
  }
}

/** The host's phone lets an invited friend in itself – when the function on the server does not know friends yet (no
 *  push then; his app, open, still asks him). */
export async function letInvited(code: string, friend: string, name: string, who: string): Promise<boolean> {
  const h = await headers();
  if (!h) return false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&select=members,near_requests,updated_at`, { headers: h });
      if (!r.ok) return false;
      const rows = (await r.json()) as { members: string[]; near_requests: Record<string, unknown> | null; updated_at: string }[];
      if (!rows.length) return false;
      const row = rows[0];
      const members = row.members.includes(friend) ? row.members : [...row.members, friend];
      const near_requests = { ...(row.near_requests ?? {}), [friend]: { name: name.slice(0, 60), at: new Date().toISOString(), state: 'ok', invited: who || 'GolfOS' } };
      const w = await fetch(`${table()}?code=eq.${encodeURIComponent(code)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ members, near_requests, updated_at: new Date().toISOString() }),
      });
      if (!w.ok) return false;
      if (((await w.json()) as unknown[]).length) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface RoundInvite {
  code: string;
  who: string;
  /** the course – or the pool's name */
  course: string;
  /** joined in Rounds (a round, a tournament, a series) or in Games (a game, a pool of bets) */
  kind: 'round' | 'game' | 'pool';
}
const INVITES_SEEN = 'golfos.invites.seen.v1';
const seenInvites = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(INVITES_SEEN) ?? '[]') as string[];
  } catch {
    return [];
  }
};
/** "Not now" / joined: this invitation is not asked again. */
export function inviteSeen(code: string): void {
  try {
    localStorage.setItem(INVITES_SEEN, JSON.stringify([...seenInvites().filter((c) => c !== code), code].slice(-40)));
  } catch {
    /* storage full */
  }
}
/** What this account was invited to in the last 12 hours – a round, a tournament or series, a game, a pool of bets – and
 *  has not joined on this phone (`joined`: the codes it has), nor answered. */
export async function roundInvites(joined: string[]): Promise<RoundInvite[]> {
  const me = userId();
  const h = await headers();
  if (!me || !h) return [];
  try {
    const fresh = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const r = await fetch(`${table()}?select=code,game,near_requests&event_code=is.null&members=cs.%7B${encodeURIComponent(me)}%7D&updated_at=gte.${encodeURIComponent(fresh)}`, { headers: h });
    if (!r.ok) return [];
    const rows = (await r.json()) as { code: string; game: { kind?: string; name?: string; courseName?: string; finishedAt?: string | null; deletedAt?: string | null; course?: { name?: string } } | null; near_requests: Record<string, { invited?: string; at?: string }> | null }[];
    const kindOf = (k?: string): RoundInvite['kind'] => (k === 'wager-pool' ? 'pool' : k === 'round-event' || k === 'tour-series' ? 'round' : 'game');
    const seen = seenInvites();
    const since = Date.now() - 12 * 3600 * 1000;
    return rows
      .filter((x) => {
        const inv = x.near_requests?.[me];
        return !!x.game && x.game.kind !== 'round-flight' && !x.game.deletedAt && !x.game.finishedAt && !!inv?.invited && new Date(inv.at ?? 0).getTime() > since && !joined.includes(x.code) && !seen.includes(x.code);
      })
      .map((x) => {
        const kind = kindOf(x.game?.kind);
        return { code: x.code, who: x.near_requests![me]!.invited!, kind, course: (kind === 'pool' ? x.game?.name : kind === 'game' ? x.game?.courseName : (x.game?.course?.name ?? x.game?.name)) ?? '' };
      });
  } catch {
    return [];
  }
}
