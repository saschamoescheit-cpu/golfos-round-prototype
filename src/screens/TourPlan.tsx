import { useEffect, useRef, useState } from 'react';
import { useTop } from '../components/useTop';
import type { Course, CourseSummary } from '../types';
import { tr } from '../lib/i18n';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { loadCachedCourse, loadGeometry, newId } from '../lib/storage';
import { courseTees, defaultTee, profileTee } from '../data/tees';
import { inUsa } from '../lib/weather';
import { parseIndex, playingHandicapFor, ratingFor, saveOwnRating } from '../lib/handicap';
import { fetchShared } from '../lib/sharedratings';
import { isLady, loadProfile, shownName } from '../lib/profile';
import { type Scoring } from '../lib/games';
import { CLASS_NAMES, plannedEvent, plannedFlight, type RoundEvent } from '../lib/sharedround';
import type { RoundHole } from '../types';
import { addToSeries, changeMulti, changeTour, createSeries, createTour, loadSeries, loadTours, renameSeries, type PlannedEvent, type SeriesEntry, type TourEntry } from '../lib/tourstore';
import { dayOf } from '../lib/wagers';
import { holesFor, specialName, type Special, type SpecialKind } from '../lib/specials';
import { deal, defaultDraw, drawOrder, FLIGHT_SIZES, GAPS, madeCut, teeSlots, type DrawMode, type Results, type TourDraw } from '../lib/tourdraw';
import { PlayerRow, RatingLine, teeChoicesFor } from './RoundSetup';
import { FriendChips } from './Home';
import { TopBar } from '../components/ui';
import { ActionBar } from '../components/ActionBar';
import { ChoiceRow, DateRow, PickSheet, SettingsList, SettingsRow, TimeRow } from '../components/Settings';

// Planning a tournament (Sascha 01.11.2026, rebuilt 04.11.2026: "the whole of 'Flights und Startzeiten' rebuilt – a
// random draw, by handicap up or down, at the final day by result; a tournament over three rounds, each its own day and
// hole combination; the leaderboards with every player's cards"). One round: a planned event (lib/tourstore.ts). Several
// rounds: one planned event each, held together as a series marked `multi` – one name, one field, a cut if wanted.
// The setup in the one order of the app (docs/DESIGN.md): Was (name, rounds, scoring, cut) → Wo/Wann (course and day,
// per round) → Score-Erfassung → Wer → Sonderwertungen → the flights last.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');

/** At most four in a flight (Sascha 01.11.2026). */
export const FLIGHT_MAX = 4;
/** the rounds to pick at once; more typed (Sascha 04.11.2026: "a number of rounds of one's own") – up to ROUNDS_MAX */
const ROUNDS_PICK = 6;
const ROUNDS_MAX = 20;

export interface TourPlayer {
  id: string;
  name: string;
  hcp: string; // the handicap index as typed
  tee: string | null;
  /** the playing handicap kept from before (a tournament changed later, its index unknown) */
  fixed?: number | null;
}
/** One round of the tournament: its day, course and holes, its draw and flights. */
export interface RoundDraft {
  id: string;
  /** set: this round exists already (its code, as the server has it) */
  code?: string;
  base?: PlannedEvent;
  date: string;
  course: Course | null;
  optionId: string;
  draw: TourDraw;
  /** each player's flight in this round – null or missing: not in a flight yet */
  flightOf: Record<string, number | null>;
  flights: number;
  /** a flight's own tee time, "" – the draw's */
  times: string[];
  /** a flight's own first hole (9: tee 10), null – the draw's */
  starts: (number | null)[];
  /** who plays this round – after the cut only those who made it; missing: everyone */
  field?: string[];
  /** "Einer für alle": who keeps the score in each flight – the row "Schreiber" in the flight (Sascha 04.11.2026: "the
   *  scorer belongs to the flights"); missing or moved out: the flight's first */
  scorers?: Record<number, string>;
}
export interface TourDraft {
  /** a single tournament changed */
  code?: string;
  base?: PlannedEvent;
  /** a tournament over several rounds changed – its series' code */
  multi?: string;
  /** a new round of this series (a series of single tournaments) */
  series?: string;
  name: string;
  scoring: Scoring;
  classes: number[];
  players: TourPlayer[];
  rounds: RoundDraft[];
  /** the special prizes (Sascha 01.11.2026: "Long Drive or Nearest to the Pin, optional") – on each round's hole */
  specials: Special[];
  /** "Score-Erfassung": one player per flight keeps the score of all */
  oneScorer?: boolean;
  /** "Jeder seinen eigenen": nobody marks; else every player marks a partner ("Mit Zähler", the default) */
  ownOnly?: boolean;
  /** after round `after` (1-based) the best `top` and ties play on */
  cut?: { after: number; top: number } | null;
  /** the round whose page is open (several rounds) */
  open?: number;
  /** the round whose course is being chosen */
  at?: number;
  /** opened at the flights – "Ändern" at a flight of the tournament's page */
  focus?: 'flights';
}

// the scorings of a tournament (Sascha 02.11.2026: "either gross or with the handicaps") – with the full handicap
export const SCORINGS = (): { v: Scoring; name: string; text: string }[] => [
  { v: 'stroke', name: tr('Gross', 'Brutto'), text: tr('Stroke play without handicap – the fewest strokes win.', 'Zählspiel ohne Vorgabe – die wenigsten Schläge gewinnen.') },
  { v: 'net', name: tr('Net', 'Netto'), text: tr('Stroke play with the handicap – the strokes less the playing handicap.', 'Zählspiel mit Vorgabe – die Schläge abzüglich der Spielvorgabe.') },
  { v: 'stableford', name: 'Stableford', text: tr('Points per hole from the strokes and the handicap – the most points win.', 'Punkte je Loch aus Schlägen und Vorgabe – die meisten Punkte gewinnen.') },
];
/** On the tournament's page: gross, net (the full handicap) or Stableford – no percentage (Sascha 02.11.2026). */
export const tourScoring = (s: Scoring) => (s === 'stableford' ? 'Stableford' : s === 'net' ? tr('Stroke play net', 'Zählspiel netto') : tr('Stroke play gross', 'Zählspiel brutto'));

// the net classes (Sascha 02./03.11.2026): none, 2 or 3 – or own ones, the last up to 54
const CLASS_TOP = 54;
const LETTERS = CLASS_NAMES; // A to J – up to ten classes (Sascha 03.11.2026)
const classLimits = (c: number[]) => [...c.map((x, i) => `${LETTERS[i]} ${tr('up to', 'bis')} ${x}`), `${LETTERS[c.length]} ${tr('up to', 'bis')} ${CLASS_TOP}`].join(' · ');
const classesName = (c: number[]) => (!c.length ? tr('None', 'Keine') : `${tr(`${c.length + 1} classes`, `${c.length + 1} Klassen`)} · ${classLimits(c)}`);
const CLASS_PRESETS: number[][] = [[], [18], [12, 24]];
const isPreset = (c: number[]) => CLASS_PRESETS.some((p) => p.join() === c.join());

const DRAW_NAMES = (): Record<DrawMode, { name: string; text: string }> => ({
  manual: { name: tr('By hand', 'Manuell'), text: tr('You put the players into the flights yourself – drag them, or tap one.', 'Du teilst die Spieler selbst ein – ziehen oder antippen.') },
  random: { name: tr('Random draw', 'Zufällig'), text: tr('The flights drawn by lot – "Draw again" for a new draw.', 'Die Flights werden ausgelost – „Neu auslosen“ lost noch einmal.') },
  hcpAsc: { name: tr('By handicap, up', 'Nach HCP aufsteigend'), text: tr('The lowest handicaps in the first flight.', 'Die niedrigsten Handicaps im ersten Flight.') },
  hcpDesc: { name: tr('By handicap, down', 'Nach HCP absteigend'), text: tr('The highest handicaps first – the best go out last.', 'Die höchsten Handicaps zuerst – die Besten starten zuletzt.') },
  result: { name: tr('By result', 'Nach Ergebnis'), text: tr('After the rounds before: the worst first, the best in the last flight.', 'Nach den Vorrunden: die Schlechtesten zuerst, die Besten im letzten Flight.') },
});
export const drawName = (m: DrawMode) => DRAW_NAMES()[m].name;

const flightsOf = (ev: RoundEvent) => Object.values(ev.flights).filter((f) => f.players.length);
const teeTimeOf = (f: unknown): string => ((f as { teeTime?: string }).teeTime ?? '');
const keyOf = (name: string) => name.trim().toLowerCase();
/** "Mi. 04.11." – a round's day in one short line */
const shortDay = (d: string) => {
  try {
    return `${new Date(`${d}T12:00:00`).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short' })} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  } catch {
    return d;
  }
};
const nextDay = (d: string) => dayOf(new Date(new Date(`${d}T12:00:00`).getTime() + 864e5));

/** Who marks whom in a flight: pairs (1 ↔ 2, 3 ↔ 4), three in a ring – set by the app (Sascha 01.11.2026). */
export function markersOf(ids: string[]): Record<string, string> {
  if (ids.length < 2) return {};
  if (ids.length % 2 === 1) return Object.fromEntries(ids.map((id, k) => [id, ids[(k + ids.length - 1) % ids.length]]));
  return Object.fromEntries(ids.map((id, k) => [id, ids[k % 2 === 0 ? k + 1 : k - 1]]));
}

const newRound = (date: string, draw: TourDraw = defaultDraw()): RoundDraft => ({ id: newId(), date, course: null, optionId: '', draw, flightOf: {}, flights: 0, times: [], starts: [] });

export function newTourDraft(): TourDraft {
  const prof = loadProfile();
  return {
    name: '',
    scoring: 'net',
    classes: [],
    players: [{ id: newId(), name: shownName(prof) || '', hcp: prof.hcpIndex ?? '', tee: null }],
    rounds: [newRound(dayOf(new Date()))],
    specials: [],
  };
}

/** A round as planned back into a draft – its players by name into the tournament's (one field over every round). */
function roundOf(ev: PlannedEvent, code: string | undefined, players: TourPlayer[]): RoundDraft {
  const course = loadCachedCourse(ev.course.id);
  const flights = flightsOf(ev);
  const flightOf: Record<string, number | null> = {};
  const scorers: Record<number, string> = {};
  flights.forEach((f, k) => {
    for (const p of f.players) {
      let tp = players.find((x) => keyOf(x.name) === keyOf(p.name));
      if (!tp) {
        const idx = (p as { hcpIndex?: number | null }).hcpIndex;
        tp = { id: newId(), name: p.name, hcp: idx == null ? '' : String(idx).replace('.', tr('.', ',')), tee: p.tee ?? null, fixed: p.playingHandicap };
        players.push(tp);
      }
      if (f.scorer === p.id) scorers[k] = tp.id;
      flightOf[tp.id] = k;
    }
  });
  const options = course ? loopOptions(course.holes) : [];
  const option = options.find((o) => o.loops.join() === ev.loopOrder.join() && buildRoundHoles(course!.holes, o).length === ev.holes.length);
  // as it was planned before the draw came (03.11.2026): by hand, its tee times kept
  const draw: TourDraw = ev.draw ?? { ...defaultDraw(), mode: 'manual', first: teeTimeOf(flights[0]) || '09:00' };
  return {
    id: newId(),
    ...(code ? { code } : {}),
    base: ev,
    date: ev.date,
    course,
    optionId: option?.id ?? options[0]?.id ?? '',
    draw,
    flightOf,
    flights: flights.length,
    times: flights.map((f) => teeTimeOf(f)),
    starts: flights.map((f) => (f as { startHole?: number }).startHole ?? null),
    ...(Object.keys(scorers).length ? { scorers } : {}),
    // dealt after the cut: those in its flights
    ...(ev.draw?.dealtAt ? { field: Object.keys(flightOf) } : {}),
  };
}

/** A tournament to change: its players, flights and times back into a draft. */
export function draftOf(e: TourEntry): TourDraft {
  const ev = e.ev;
  const players: TourPlayer[] = [];
  const r = roundOf(ev, e.code, players);
  return {
    ...(flightsOf(ev).some((f) => f.scorer) ? { oneScorer: true } : ev.format?.marker === false ? { ownOnly: true } : {}),
    code: e.code,
    base: ev,
    name: ev.name,
    scoring: ev.format?.scoring ?? 'net',
    classes: ev.classes ?? [],
    players,
    rounds: [r],
    specials: ev.specials ?? [],
  };
}

/** A tournament over several rounds to change: every round of it, one field. */
export function draftOfMulti(s: SeriesEntry, tours: TourEntry[]): TourDraft | null {
  const evs = s.series.rounds.map((r) => tours.find((t) => t.code === r.code)).filter((t): t is TourEntry => !!t && !t.ev.deletedAt);
  if (!evs.length) return null;
  const players: TourPlayer[] = [];
  const rounds = evs.map((t) => roundOf(t.ev, t.code, players));
  const first = evs[0].ev;
  return {
    ...(flightsOf(first).some((f) => f.scorer) ? { oneScorer: true } : first.format?.marker === false ? { ownOnly: true } : {}),
    multi: s.code,
    name: s.series.name,
    scoring: first.format?.scoring ?? 'net',
    classes: first.classes ?? [],
    players,
    rounds,
    specials: first.specials ?? [],
    cut: s.series.multi?.cut ?? null,
  };
}

/** The course picked for round `at`: the rounds without one take it too (a tournament mostly on one course). */
export function pickCourse(d: TourDraft, course: Course): TourDraft {
  const at = d.at ?? 0;
  const optionId = loopOptions(course.holes)[0]?.id ?? '';
  return { ...d, at: undefined, rounds: d.rounds.map((r, k) => (k === at || (!r.course && !r.base) ? { ...r, course, optionId } : r)) };
}

/** The holes of a round: its course and combination – or as planned (the course not on this phone). */
function holesOf(r: RoundDraft) {
  const options = r.course ? loopOptions(r.course.holes) : [];
  const option = options.find((o) => o.id === r.optionId) ?? options[0];
  const built = r.course && option ? buildRoundHoles(r.course.holes, option) : [];
  return { options, option, holes: built.length ? built : (r.base?.holes ?? []), loopOrder: option?.loops ?? r.base?.loopOrder ?? [], courseId: r.course?.id ?? r.base?.course.id ?? '' };
}

/** Tees, ratings and playing handicaps on a round's course. */
function teesOf(r: RoundDraft) {
  const { holes, courseId } = holesOf(r);
  const offered = r.course ? courseTees(r.course.id, loadGeometry(r.course.id).teeColours) : null;
  const lady = isLady();
  const startTee = offered ? defaultTee(offered.tees) : null;
  const myTee = offered && r.course ? (profileTee(offered, loadProfile().tee, r.course.id, inUsa([r.course.lon, r.course.lat])) ?? defaultTee(offered.tees, lady)) : null;
  const teeOf = (p: TourPlayer, k: number) => (p.tee && offered?.tees.includes(p.tee) ? p.tee : k === 0 ? myTee : startTee);
  const nine = holes.length === 9;
  const rated = !!courseId && (holes.length === 18 || nine);
  return {
    offered,
    myTee,
    teeOf,
    nine,
    ratingOf: (p: TourPlayer, k: number) => (rated ? ratingFor(courseId, teeOf(p, k) ?? '–', holes, k === 0 && lady) : null),
    playingOf: (p: TourPlayer, k: number): number | null => (parseIndex(p.hcp) == null ? (p.fixed ?? null) : playingHandicapFor(courseId, holes, teeOf(p, k) ?? '–', p.hcp, k === 0 && lady)),
  };
}

/** Each flight's tee time and first hole: its own, else the draw's. */
export const slotsOf = (r: RoundDraft) => teeSlots(r.flights, r.draw.first, r.draw.gap, r.draw.twoTees).map((s, f) => ({ time: r.times[f] || s.time, start: r.starts[f] ?? s.start }));

/** The players into the round's flights by its draw – "by result" with the results of the rounds before, else (still
 *  planned) by handicap down for now. `only`: the field after a cut. */
export function drawRound(r: RoundDraft, players: TourPlayer[], o: { results?: Results; higherBetter?: boolean; only?: string[] } = {}): RoundDraft {
  const only = o.only ?? r.field;
  if (r.draw.mode === 'manual' || (r.draw.dealtAt && !o.results)) {
    // by hand, or dealt by result already: who is new waits under "Noch ohne Flight"
    const flightOf = Object.fromEntries(players.map((p) => [p.id, r.flightOf[p.id] ?? null]));
    return { ...r, flightOf, ...(only ? { field: only.filter((id) => players.some((p) => p.id === id)) } : {}) };
  }
  const field = players.filter((p) => !only || only.includes(p.id));
  const mode = r.draw.mode === 'result' && !o.results ? 'hcpDesc' : r.draw.mode;
  const order = drawOrder(mode, field.map((p) => ({ id: p.id, hcp: parseIndex(p.hcp) ?? p.fixed ?? null })), { results: o.results, higherBetter: o.higherBetter, seed: Date.now() });
  const flightOf = deal(order, r.draw.size);
  const flights = order.length ? Math.max(...Object.values(flightOf)) + 1 : 0;
  return { ...r, flightOf: Object.fromEntries(players.map((p) => [p.id, flightOf[p.id] ?? null])), flights, times: [], starts: [], scorers: {}, ...(only ? { field: field.map((p) => p.id) } : {}) };
}

/** A round of the draft as the event the server keeps. */
function eventOf(d: TourDraft, k: number, name: string): PlannedEvent | null {
  const r = d.rounds[k];
  const { holes, option, loopOrder } = holesOf(r);
  const t = teesOf(r);
  if (!holes.length) return null;
  const summary: CourseSummary | null = r.course ? { id: r.course.id, source: r.course.source, name: r.course.name, lat: r.course.lat, lon: r.course.lon, ...(r.course.bbox ? { bbox: r.course.bbox } : {}) } : (r.base?.course ?? null);
  if (!summary) return null;
  const slots = slotsOf(r);
  const label = (p: TourPlayer) => p.name.trim();
  const plan = Array.from({ length: r.flights }, (_, f) => {
    const ps = d.players.filter((p) => r.flightOf[p.id] === f && (!r.field || r.field.includes(p.id)));
    const pid = (id: string) => `p${ps.findIndex((p) => p.id === id) + 1}`;
    const marks = markersOf(ps.map((p) => p.id));
    return {
      name: ps.map(label).join(' · '),
      teeTime: slots[f].time,
      ...(slots[f].start ? { startHole: slots[f].start } : {}),
      players: ps.map((p) => {
        const at = d.players.indexOf(p);
        const tee = t.teeOf(p, at);
        return { name: label(p), playingHandicap: t.playingOf(p, at), hcpIndex: parseIndex(p.hcp), ...(tee ? { tee } : {}) };
      }),
      markers: d.ownOnly && !d.oneScorer ? {} : Object.fromEntries(ps.map((p) => [pid(p.id), pid(marks[p.id])])),
      ...(d.oneScorer && ps.length ? { scorer: pid((ps.find((p) => p.id === r.scorers?.[f]) ?? ps[0]).id) } : {}),
    };
  });
  const fresh = plannedEvent({
    name,
    date: r.date,
    course: summary,
    holes,
    loopOrder: option?.loops ?? loopOrder,
    // gross without any handicap: allowance 0 – the leaderboard counts the strokes (Sascha 04.11.2026: a gross tournament
    // was ranked net), else the full handicap
    format: { mode: 'single', scoring: d.scoring, allowance: d.scoring === 'stroke' ? 0 : 100, ...(d.ownOnly && !d.oneScorer ? { marker: false } : {}) },
    ...(t.myTee ? { tee: t.myTee } : {}),
    roundKind: 'tournament',
    ...(d.classes.length ? { classes: d.classes } : {}),
    flights: plan,
  }) as PlannedEvent;
  fresh.draw = r.draw;
  // changed: the flights keep their ids in order – a phone that joined flight 2 is still in flight 2
  const base = r.base;
  const ev: PlannedEvent = base
    ? {
        ...fresh,
        id: base.id,
        createdAt: base.createdAt,
        ...(base.by ? { by: base.by } : {}),
        deletedAt: base.deletedAt ?? null,
        ...(base.series ? { series: base.series } : {}),
        flights: Object.fromEntries(
          plan.map((pf, f) => {
            const fl = plannedFlight(base, pf);
            const id = flightsOf(base)[f]?.id ?? fl.id;
            return [id, { ...fl, id }];
          }),
        ),
      }
    : fresh;
  const specials = d.specials.filter((s) => s.hole < holes.length);
  if (specials.length) ev.specials = specials;
  else delete ev.specials;
  return ev;
}

const roundName = (d: TourDraft, k: number) => (d.rounds.length > 1 ? `${d.name.trim()} · ${tr(`Round ${k + 1}`, `Runde ${k + 1}`)}` : d.name.trim());

/** The draft saved: one round a tournament; several a tournament over rounds (a series marked `multi`). Its code – the
 *  tournament's or the series' –, or null. */
async function saveDraft(d: TourDraft): Promise<{ code: string; series: boolean } | null> {
  const codes: string[] = [];
  for (let k = 0; k < d.rounds.length; k++) {
    const ev = eventOf(d, k, roundName(d, k));
    if (!ev) return null;
    const r = d.rounds[k];
    const code = r.code ? ((await changeTour(r.code, ev)) ? r.code : null) : await createTour(ev);
    if (!code) return null;
    codes.push(code);
  }
  if (d.rounds.length === 1 && !d.multi) {
    const code = codes[0];
    if (d.series) await addToSeries(d.series, code);
    else if (d.base?.series?.code) await addToSeries(d.base.series.code, code); // its day or course in the series' list
    return { code, series: false };
  }
  const multi = { cut: d.cut ?? null };
  if (!d.multi) {
    const code = await createSeries(d.name.trim(), codes, multi);
    return code ? { code, series: true } : null;
  }
  // changed: every round in its list (a new one joined, the copy of day, course and name up to date), the rounds taken
  // out marked deleted and out of the list
  for (const c of codes) await addToSeries(d.multi, c);
  const was = loadSeries().find((x) => x.code === d.multi)?.series.rounds.map((r) => r.code) ?? [];
  const drop = was.filter((c) => !codes.includes(c));
  for (const c of drop) {
    const ev = loadTours().find((t) => t.code === c)?.ev;
    if (ev) await changeTour(c, { ...ev, deletedAt: new Date().toISOString(), series: null });
  }
  if (!(await changeMulti(d.multi, multi, drop))) return null;
  await renameSeries(d.multi, d.name.trim());
  return { code: d.multi, series: true };
}

/** A round dealt again on the server by its draw (Sascha 04.11.2026: "the final day by result"): the standing of the
 *  rounds before – each player's sum, the cut applied –, then the flights written. */
export async function dealRound(e: TourEntry, results: Results, o: { higherBetter: boolean; cutTop?: number; /** a round further after the cut: who played the round before */ onlyNames?: string[] }): Promise<boolean> {
  const d = draftOf(e);
  const r = d.rounds[0];
  const byName = Object.fromEntries(d.players.map((p) => [p.id, results[keyOf(p.name)]]).filter(([, v]) => v != null)) as Results;
  let only: string[] | undefined = o.onlyNames ? d.players.filter((p) => o.onlyNames!.includes(keyOf(p.name))).map((p) => p.id) : undefined;
  if (o.cutTop) {
    const rows = d.players
      .filter((p) => byName[p.id] != null)
      .map((p) => ({ id: p.id, sum: byName[p.id] }))
      .sort((a, b) => (o.higherBetter ? b.sum - a.sum : a.sum - b.sum));
    only = madeCut(rows, o.cutTop).map((x) => x.id);
  }
  const mode = r.draw.mode === 'manual' ? 'result' : r.draw.mode;
  const next = drawRound({ ...r, draw: { ...r.draw, mode, dealtAt: new Date().toISOString() } }, d.players, { results: byName, higherBetter: o.higherBetter, only });
  const players = only ? d.players.filter((p) => only!.includes(p.id)) : d.players;
  const ev = eventOf({ ...d, players, rounds: [next] }, 0, e.ev.name);
  return !!ev && changeTour(e.code, ev);
}

// ---------- the setup ----------

export function TourSetup(props: { draft: TourDraft; onChange: (d: TourDraft) => void; onBack: () => void; /** on to the courses – for the round `at` of this draft */ onCourse: (d: TourDraft) => void; onSaved: (code: string, series: boolean) => void }) {
  const d = props.draft;
  useTop(d.open);
  const set = (patch: Partial<TourDraft>) => props.onChange({ ...d, ...patch });
  useEffect(() => {
    if (d.focus !== 'flights') return;
    const t = window.setTimeout(() => {
      document.getElementById('tour-flights')?.scrollIntoView({ block: 'start' });
      props.onChange({ ...d, focus: undefined });
    }, 60);
    return () => window.clearTimeout(t);
  }, [d.focus, d.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRound = (k: number, r: RoundDraft) => set({ rounds: d.rounds.map((x, j) => (j === k ? r : x)) });
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<'scoring' | 'classes' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const multi = d.rounds.length > 1;
  const r0 = d.rounds[0];
  const h0 = holesOf(r0);
  const t0 = teesOf(r0);
  const [, setRatingsSeen] = useState(0);
  const courseIds = d.rounds.map((r) => r.course?.id ?? '').join();
  useEffect(() => {
    let alive = true;
    for (const id of new Set(courseIds.split(',').filter(Boolean))) fetchShared(id).then(() => alive && setRatingsSeen((k) => k + 1));
    return () => {
      alive = false;
    };
  }, [courseIds]);
  const label = (p: TourPlayer, k: number) => p.name.trim() || tr(`Player ${k + 1}`, `Spieler ${k + 1}`);
  const teeChoices = r0.course && t0.offered ? teeChoicesFor(r0.course.id, h0.holes, t0.offered.tees) : [];
  // players changed: every round drawn by a rule deals again, one by hand keeps its flights
  const setPlayers = (players: TourPlayer[]) => set({ players, rounds: d.rounds.map((r) => drawRound(r, players)) });
  const newPlayer = (name: string, hcp: string): TourPlayer => ({ id: newId(), name, hcp, tee: null });
  // the number of rounds: a new one the day after the last, its course and draw – the last one by result (the final)
  const setCount = (n: number) => {
    const rounds = d.rounds.slice(0, n);
    while (rounds.length < n) {
      const last = rounds[rounds.length - 1];
      const r = { ...newRound(nextDay(last.date), { ...last.draw, dealtAt: undefined }), course: last.course, optionId: last.optionId };
      rounds.push(drawRound(r, d.players));
    }
    // the last round the final, by result – also when rounds are taken away and the final was by result
    const finalByResult = n > d.rounds.length || d.rounds[d.rounds.length - 1]?.draw.mode === 'result';
    if (n > 1 && finalByResult && rounds[n - 1].draw.mode !== 'result') rounds[n - 1] = drawRound({ ...rounds[n - 1], draw: { ...rounds[n - 1].draw, mode: 'result' } }, d.players);
    set({ rounds, ...(d.cut && d.cut.after >= n ? { cut: null } : {}) });
  };
  const problems = (r: RoundDraft) => {
    const field = d.players.filter((p) => !r.field || r.field.includes(p.id));
    const sizes = Array.from({ length: r.flights }, (_, f) => field.filter((p) => r.flightOf[p.id] === f).length);
    return { small: sizes.some((n) => n < 2) && field.length >= 2, big: sizes.some((n) => n > FLIGHT_MAX), unplaced: field.some((p) => r.flightOf[p.id] == null || r.flightOf[p.id]! >= r.flights), empty: !r.flights };
  };
  const roundReady = (r: RoundDraft) => {
    const x = problems(r);
    return !!r.date && holesOf(r).holes.length > 0 && !x.small && !x.big && !x.unplaced && !x.empty;
  };
  const ordered = d.rounds.every((r, k) => !k || r.date >= d.rounds[k - 1].date);
  const ready = !!d.name.trim() && d.players.length >= 2 && d.players.every((p) => p.name.trim()) && d.rounds.every(roundReady) && ordered;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setMsg(null);
    const done = await saveDraft(d);
    setBusy(false);
    if (done) props.onSaved(done.code, done.series);
    else setMsg(NO_NET());
  };

  // several rounds: a round's own page – its course, day and flights
  if (multi && d.open != null && d.rounds[d.open]) {
    const k = d.open;
    return (
      <main className="screen">
        <TopBar title={tr(`Round ${k + 1}`, `Runde ${k + 1}`)} onBack={() => set({ open: undefined })} backLabel={d.name.trim() || tr('Tournament', 'Turnier')} />
        <RoundWhereWhen d={d} k={k} onChange={(r) => setRound(k, r)} onCourse={() => props.onCourse({ ...d, at: k })} />
        <RoundFlights d={d} k={k} label={label} onChange={(r) => setRound(k, r)} problems={problems(d.rounds[k])} />
        <span className="spacer" />
        <div className="sticky-cta">
          <button type="button" className="btn-primary" onClick={() => set({ open: undefined })}>
            {tr('Done', 'Fertig')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title={d.code || d.multi ? tr('Change the tournament', 'Turnier bearbeiten') : tr('New tournament', 'Neues Turnier')} onBack={props.onBack} backLabel={tr('Back', 'Zurück')} />

      <section className="setup-part">
        <span className="eyebrow">{tr('Tournament', 'Turnier')}</span>
        <div className="card setup-part">
          <div className="field">
            <label htmlFor="tour-name">{tr('Name', 'Name')}</label>
            <input id="tour-name" className="input" required placeholder={tr('Enter a name', 'Name eingeben')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
        </div>
      </section>

      {/* Was: the rounds, the scoring, the classes, the cut – each a row with its sheet, as the format of a round */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Format', 'Spielform')}</span>
        <SettingsList>
          {/* a new round of a series of single tournaments stays one round */}
          {!d.code && !d.series && (
            <RoundsRow value={d.rounds.length} onChange={setCount} />
          )}
          <SettingsRow label={tr('Scoring', 'Wertung')} value={SCORINGS().find((x) => x.v === d.scoring)?.name ?? ''} onClick={() => setPick('scoring')} />
          {d.scoring !== 'stroke' && <SettingsRow label={tr('Net classes', 'Netto-Klassen')} value={d.classes.length ? tr(`${d.classes.length + 1} classes`, `${d.classes.length + 1} Klassen`) : tr('None', 'Keine')} onClick={() => setPick('classes')} />}
          {multi && (
            <ChoiceRow<number>
              label={tr('Cut', 'Cut')}
              title={tr('The cut', 'Der Cut')}
              value={d.cut?.after ?? 0}
              onChange={(after) => set({ cut: after ? { after, top: d.cut?.top ?? 20 } : null })}
              options={[
                { value: 0, name: tr('None', 'Keiner'), text: tr('Everyone plays every round.', 'Alle spielen alle Runden.') },
                ...Array.from({ length: d.rounds.length - 1 }, (_, i) => i + 1).map((after) => ({ value: after, name: tr(`After round ${after}`, `Nach Runde ${after}`), text: tr('Only the best play on – the others stay in the leaderboard.', 'Nur die Besten spielen weiter – die anderen bleiben im Leaderboard.') })),
              ]}
            />
          )}
          {multi && d.cut && (
            <ChoiceRow<number>
              label={tr('Play on', 'Es spielen weiter')}
              value={d.cut.top}
              onChange={(top) => set({ cut: { ...d.cut!, top } })}
              options={[4, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60].map((n) => ({ value: n, name: tr(`The best ${n}`, `Die besten ${n}`), text: tr('And everyone level with the last of them.', 'Und alle, die mit dem Letzten gleichauf liegen.') }))}
            />
          )}
        </SettingsList>
        {/* the limits under the list – the row stays one line */}
        {d.scoring !== 'stroke' && d.classes.length > 0 && <span className="muted small">{classLimits(d.classes)}</span>}
      </section>
      {pick === 'classes' && (
        <ClassesSheet
          value={d.classes}
          onPick={(c) => {
            set({ classes: c });
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
      {pick === 'scoring' && (
        <PickSheet<Scoring>
          title={tr('Choose the scoring', 'Wertung wählen')}
          current={d.scoring}
          options={SCORINGS().map((x) => ({ value: x.v, name: x.name, text: x.text }))}
          onPick={(v) => {
            set({ scoring: v, ...(v === 'stroke' ? { classes: [] } : d.scoring === 'stroke' && !d.classes.length ? { classes: [12, 24] } : {}) });
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}

      {/* Wo → Wann: one round inline; several – a row each, its page with course, day and flights */}
      {!multi ? (
        <RoundWhereWhen d={d} k={0} onChange={(r) => setRound(0, r)} onCourse={() => props.onCourse({ ...d, at: 0 })} rating={() => setRatingsSeen((n) => n + 1)} />
      ) : (
        <section className="setup-part">
          <span className="eyebrow">{tr('Rounds', 'Runden')}</span>
          <SettingsList label={tr('The rounds', 'Die Runden')}>
            {d.rounds.map((r, k) => (
              <SettingsRow
                key={r.id}
                label={tr(`Round ${k + 1}`, `Runde ${k + 1}`)}
                value={`${shortDay(r.date)} · ${r.course?.name ?? r.base?.course.name ?? tr('Choose a course', 'Platz wählen')}`}
                need={!holesOf(r).holes.length}
                onClick={() => set({ open: k })}
              />
            ))}
          </SettingsList>
          {!ordered && <span className="small bad-text">{tr('The rounds in the order of their days.', 'Die Runden in der Reihenfolge ihrer Tage.')}</span>}
        </section>
      )}

      {/* Score-Erfassung between the day and the players (Sascha 04.11.2026), "Mit Zähler" the default */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Score entry', 'Score-Erfassung')}</span>
        <SettingsList>
          <ChoiceRow<'own' | 'marker' | 'one'>
            label={tr('Who enters', 'Wer erfasst')}
            value={d.oneScorer ? 'one' : d.ownOnly ? 'own' : 'marker'}
            onChange={(v) => set({ oneScorer: v === 'one', ownOnly: v === 'own' })}
            options={[
              { value: 'own', name: tr('Everyone his own', 'Jeder seinen eigenen'), text: tr('Everyone enters only his own score and sees the others – nobody marks.', 'Jeder trägt nur seinen eigenen Score ein und sieht die anderen – ohne Zähler.') },
              { value: 'marker', name: tr('With a marker', 'Mit Zähler'), text: tr("Everyone enters his own score and his partner's – a difference shows.", 'Jeder trägt seinen Score und den seines Partners ein – Abweichungen werden angezeigt.') },
              { value: 'one', name: tr('One for all', 'Einer für alle'), text: tr('One player per flight keeps the score of all and marks everyone.', 'Ein Spieler je Flight erfasst die Scores aller und zählt alle.') },
            ]}
          />
        </SettingsList>
        {/* no hint under it (Sascha 04.11.2026) – what each way means is in its sheet */}
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        {d.players.map((p, k) => (
          <PlayerRow
            key={p.id}
            className="game-player-row"
            nameNeeded
            player={{ id: `t${p.id}`, name: p.name, index: p.hcp, handicap: '', tee: t0.teeOf(p, k) }}
            nameLabel={tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
            rating={t0.ratingOf(p, k)}
            playing={t0.playingOf(p, k)}
            nine={t0.nine}
            tees={teeChoices.length ? teeChoices : undefined}
            onChange={(np) => set({ players: d.players.map((x) => (x.id === p.id ? { ...x, name: np.name, hcp: np.index, tee: np.tee, fixed: np.index !== x.hcp ? null : x.fixed } : x)) })}
            onRemove={d.players.length > 1 ? () => setPlayers(d.players.filter((x) => x.id !== p.id)) : undefined}
          />
        ))}
        <FriendChips taken={d.players.map((p) => p.name)} onAdd={(fr) => setPlayers([...d.players, newPlayer(fr.name, fr.hcp)])} />
        <button type="button" className="btn-secondary" onClick={() => setPlayers([...d.players, newPlayer('', '')])}>
          {tr('+ Add player', '+ Spieler hinzufügen')}
        </button>
      </section>

      <Specials d={d} holes={h0.holes} onChange={(specials) => set({ specials })} />

      {/* the flights the last settings (Sascha 04.11.2026) – several rounds: a row each, to its page */}
      {!multi ? (
        <RoundFlights d={d} k={0} label={label} onChange={(r) => setRound(0, r)} problems={problems(r0)} />
      ) : (
        <section className="setup-part">
          <span className="eyebrow">{tr('Flights and tee times', 'Flights und Startzeiten')}</span>
          <SettingsList label={tr('Flights of the rounds', 'Flights der Runden')}>
            {d.rounds.map((r, k) => (
              <SettingsRow key={r.id} label={tr(`Round ${k + 1}`, `Runde ${k + 1}`)} value={`${drawName(r.draw.mode)} · ${tr('from', 'ab')} ${r.draw.first}`} need={!roundReady(r)} onClick={() => set({ open: k })} />
            ))}
          </SettingsList>
          {d.cut && <span className="muted small">{tr(`After round ${d.cut.after} the best ${d.cut.top} and ties play on – their flights dealt then.`, `Nach Runde ${d.cut.after} spielen die besten ${d.cut.top} und Gleichstand weiter – ihre Flights werden dann eingeteilt.`)}</span>}
        </section>
      )}

      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      <span className="spacer" />
      <div className="sticky-cta">
        <button type="button" className="btn-primary" disabled={!ready || busy} onClick={() => void save()}>
          {d.code || d.multi ? tr('Save', 'Speichern') : tr('Set up the tournament', 'Turnier anlegen')}
        </button>
      </div>
    </main>
  );
}

/** "Runden": 1 to 6 – or "Andere Anzahl …" typed, up to 20 (Sascha 04.11.2026), as "Anderer Betrag …" of a stake. */
function RoundsRow(props: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const OTHER = -1;
  const custom = props.value > ROUNDS_PICK;
  const name = (n: number) => (n === 1 ? tr('1 round', '1 Runde') : tr(`${n} rounds`, `${n} Runden`));
  const close = () => {
    setOpen(false);
    setTyping(false);
    setError(null);
  };
  const take = () => {
    const n = Number(text.trim());
    if (!Number.isInteger(n) || n < 1) return setError(tr('Type a number, e.g. 8', 'Gib eine Anzahl ein, z. B. 8'));
    if (n > ROUNDS_MAX) return setError(tr(`At most ${ROUNDS_MAX} rounds.`, `Höchstens ${ROUNDS_MAX} Runden.`));
    props.onChange(n);
    close();
  };
  return (
    <>
      <SettingsRow label={tr('Rounds', 'Runden')} value={name(props.value)} onClick={() => setOpen(true)} />
      {open && (
        <PickSheet<number>
          title={tr('How many rounds', 'Wie viele Runden')}
          current={typing || custom ? OTHER : props.value}
          options={[
            ...Array.from({ length: ROUNDS_PICK }, (_, i) => i + 1).map((n) => ({ value: n, name: name(n), ...(n === 1 ? { text: tr('One day, one leaderboard.', 'Ein Tag, ein Leaderboard.') } : {}) })),
            { value: OTHER, name: custom ? tr(`Other number: ${props.value}`, `Andere Anzahl: ${props.value}`) : tr('Other number …', 'Andere Anzahl …') },
          ]}
          onPick={(v) => {
            if (v === OTHER) {
              setTyping(true);
              setText(custom ? String(props.value) : '');
              return;
            }
            props.onChange(v);
            close();
          }}
          onClose={close}
        >
          {typing && (
            <div className="cap-input">
              <input
                className="input"
                inputMode="numeric"
                autoFocus
                aria-label={tr('The number of rounds', 'Die Anzahl der Runden')}
                placeholder="8"
                value={text}
                onChange={(e) => {
                  setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2));
                  setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && take()}
              />
              <button type="button" className="btn-secondary" onClick={take}>
                {tr('Use', 'Übernehmen')}
              </button>
            </div>
          )}
          {error && (
            <span className="small bad-text" role="alert">
              {error}
            </span>
          )}
          <span className="muted small">{tr('From 2 rounds: one tournament over several days – each round its course, holes and flights; one total.', 'Ab 2 Runden: ein Turnier über mehrere Tage – jede Runde mit Platz, Löchern und Flights; eine Gesamtwertung.')}</span>
        </PickSheet>
      )}
    </>
  );
}

/** Wo → Wann of a round: its course and hole combination, its day. */
function RoundWhereWhen(props: { d: TourDraft; k: number; onChange: (r: RoundDraft) => void; onCourse: () => void; rating?: () => void }) {
  const r = props.d.rounds[props.k];
  const { options, option, holes, courseId } = holesOf(r);
  const t = teesOf(r);
  const first = props.d.players[0];
  return (
    <>
      <section className="setup-part">
        <span className="eyebrow">{tr('Course', 'Platz')}</span>
        <SettingsList>
          <SettingsRow
            label={tr('Course', 'Platz')}
            value={r.course?.name ?? r.base?.course.name ?? tr('Choose a course', 'Platz wählen')}
            need={!r.course && !r.base}
            onClick={props.onCourse}
          />
        </SettingsList>
        {r.course && options.length > 1 && (
          <div className="choice-grid">
            {options.map((o) => (
              <button key={o.id} type="button" className="choice choice-loop" aria-pressed={o.id === option?.id} onClick={() => props.onChange({ ...r, optionId: o.id })}>
                <strong>{o.label.split(' · ')[0]}</strong>
                {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
              </button>
            ))}
          </div>
        )}
        {courseId && first && (holes.length === 18 || t.nine) && (
          <RatingLine
            rating={t.ratingOf(first, 0)}
            nine={t.nine}
            onSave={(v) => {
              saveOwnRating(courseId, t.teeOf(first, 0) ?? '–', holes, v);
              props.rating?.();
            }}
          />
        )}
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Date', 'Datum')}</span>
        <SettingsList>
          <DateRow id={`tour-date-${props.k}`} label={tr('Day', 'Tag')} value={r.date} onChange={(v) => props.onChange({ ...r, date: v })} />
        </SettingsList>
      </section>
    </>
  );
}

/** "Sonderwertungen (optional)" as rows (Sascha 04.11.2026: "in the same usability as the day"): one per kind, its
 *  holes in a sheet – ticked on and off. */
function Specials(props: { d: TourDraft; holes: RoundHole[]; onChange: (s: Special[]) => void }) {
  const [open, setOpen] = useState<SpecialKind | null>(null);
  const { holes } = props;
  const of = (kind: SpecialKind) => props.d.specials.filter((s) => s.kind === kind).sort((a, b) => a.hole - b.hole);
  const holeName = (i: number) => tr(`Hole ${holes[i]?.label ?? i + 1}`, `Loch ${holes[i]?.label ?? i + 1}`);
  return (
    <section className="setup-part">
      <span className="eyebrow">{tr('Special prizes (optional)', 'Sonderwertungen (optional)')}</span>
      <SettingsList>
        {(['longDrive', 'nearestPin'] as SpecialKind[]).map((kind) => (
          <SettingsRow key={kind} label={specialName(kind)} value={of(kind).length ? of(kind).map((s) => holeName(s.hole)).join(', ') : tr('None', 'Keine')} disabled={!holes.length} onClick={() => setOpen(kind)} />
        ))}
      </SettingsList>
      {!holes.length && <span className="muted small">{tr('Choose the course first.', 'Zuerst den Platz wählen.')}</span>}
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <section className="sheet" role="dialog" aria-label={specialName(open)} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{specialName(open)}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(null)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {holesFor(open, holes).map((i) => {
                const on = props.d.specials.find((s) => s.kind === open && s.hole === i);
                return (
                  <button
                    key={i}
                    type="button"
                    className="pick-option"
                    aria-pressed={!!on}
                    onClick={() => props.onChange(on ? props.d.specials.filter((s) => s !== on) : [...props.d.specials, { id: newId(), kind: open, hole: i }])}
                  >
                    <span className="grow">
                      <strong>{holeName(i)}</strong>
                      <span className="muted small">{tr(`Par ${holes[i].par ?? '–'}`, `Par ${holes[i].par ?? '–'}`)}</span>
                    </span>
                    {on && (
                      <span className="pick-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span className="muted small">
              {tr(
                'On the day the players enter their figure at the hole in Rounds – Nearest to the Pin the distance to the hole, Long Drive the length from the tee (only a ball in the fairway counts).',
                'Am Turniertag tragen die Spieler am Loch in Rounds ein – Nearest to the Pin den Abstand zur Fahne, Long Drive die Weite vom Abschlag (nur ein Ball im Fairway zählt).',
              )}
            </span>
            <button type="button" className="btn-primary" onClick={() => setOpen(null)}>
              {tr('Done', 'Fertig')}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

/** "Flights und Startzeiten" of a round (Sascha 04.11.2026): the draw, players to a flight, the first tee time and the
 *  interval, tee 1 or tees 1 and 10 – then the flights, a player moved by dragging or by a tap. */
function RoundFlights(props: { d: TourDraft; k: number; label: (p: TourPlayer, k: number) => string; onChange: (r: RoundDraft) => void; problems: { small: boolean; big: boolean; unplaced: boolean; empty: boolean } }) {
  const { d, k } = props;
  const r = d.rounds[k];
  const t = teesOf(r);
  const names = DRAW_NAMES();
  // "by result" from the second round on: the rounds before give the order
  const modes: DrawMode[] = ['manual', 'random', 'hcpAsc', 'hcpDesc', ...(k > 0 ? (['result'] as DrawMode[]) : [])];
  const setDraw = (patch: Partial<TourDraw>, again: boolean) => {
    const next = { ...r, draw: { ...r.draw, ...patch } };
    props.onChange(again ? drawRound(next, d.players) : next);
  };
  const afterCut = !!d.cut && k >= d.cut.after;
  const slots = slotsOf(r);
  return (
    <section className="setup-part" id="tour-flights" aria-label={tr('Flights and tee times', 'Flights und Startzeiten')}>
      <span className="eyebrow">{tr('Flights and tee times', 'Flights und Startzeiten')}</span>
      <SettingsList>
        <ChoiceRow<DrawMode> label={tr('Draw', 'Einteilung')} title={tr('How the flights are drawn', 'Wie eingeteilt wird')} value={r.draw.mode} onChange={(mode) => setDraw({ mode }, mode !== 'manual')} options={modes.map((m) => ({ value: m, name: names[m].name, text: names[m].text }))} />
        <ChoiceRow<number>
          label={tr('Players per flight', 'Spieler je Flight')}
          value={r.draw.size}
          onChange={(size) => setDraw({ size }, r.draw.mode !== 'manual')}
          options={FLIGHT_SIZES.map((n) => ({ value: n, name: tr(`${n} players`, `${n} Spieler`), text: n === 4 ? tr('Fourballs.', '4er-Flights.') : n === 3 ? tr('Threeballs – as at a club championship.', '3er-Flights – wie bei der Clubmeisterschaft.') : tr('Twoballs.', '2er-Flights.') }))}
        />
        <TimeRow id={`tour-first-${k}`} label={tr('First tee time', 'Erste Startzeit')} value={r.draw.first} onChange={(v) => v && props.onChange({ ...r, draw: { ...r.draw, first: v } })} />
        <ChoiceRow<number> label={tr('Interval', 'Abstand')} value={r.draw.gap} onChange={(gap) => props.onChange({ ...r, draw: { ...r.draw, gap } })} options={GAPS.map((g) => ({ value: g, name: tr(`${g} min`, `${g} Min.`) }))} />
        <ChoiceRow<boolean>
          label={tr('Start', 'Start')}
          value={r.draw.twoTees}
          onChange={(twoTees) => props.onChange({ ...r, draw: { ...r.draw, twoTees }, starts: [] })}
          options={[
            { value: false, name: tr('Tee 1', 'Tee 1'), text: tr('One flight after the other from tee 1.', 'Ein Flight nach dem anderen von Tee 1.') },
            { value: true, name: tr('Tees 1 and 10', 'Tee 1 und Tee 10'), text: tr('Two flights on each time – one from tee 1, one from tee 10.', 'Zwei Flights je Startzeit – einer von Tee 1, einer von Tee 10.') },
          ]}
        />
      </SettingsList>
      {r.draw.mode === 'result' && (
        <span className="muted small">
          {afterCut
            ? tr(`For now by handicap. After round ${k}: the cut, then "Deal the flights by result" on the tournament's page.`, `Vorläufig nach HCP. Nach Runde ${k}: der Cut, dann „Flights nach Ergebnis einteilen“ auf der Turnierseite.`)
            : tr(`For now by handicap – after round ${k} "Deal the flights by result" on the tournament's page.`, `Vorläufig nach HCP – nach Runde ${k} „Flights nach Ergebnis einteilen“ auf der Turnierseite.`)}
        </span>
      )}
      {r.draw.mode !== 'manual' && r.draw.mode !== 'result' && (
        <button type="button" className="btn-secondary" onClick={() => props.onChange(drawRound(r, d.players))}>
          {r.draw.mode === 'random' ? tr('Draw again', 'Neu auslosen') : tr('Deal again', 'Neu einteilen')}
        </button>
      )}
      <FlightBoard
        players={d.players.filter((p) => !r.field || r.field.includes(p.id))}
        flightOf={r.flightOf}
        flights={r.flights}
        slots={slots}
        markers={d.ownOnly && !d.oneScorer ? null : (ids) => markersOf(ids)}
        oneScorer={!!d.oneScorer}
        scorers={r.scorers ?? {}}
        onScorer={(fi, id) => props.onChange({ ...r, scorers: { ...(r.scorers ?? {}), [fi]: id } })}
        label={(p) => props.label(p, d.players.indexOf(p))}
        playing={(p) => t.playingOf(p, d.players.indexOf(p))}
        nextTime={teeSlots(r.flights + 1, r.draw.first, r.draw.gap, r.draw.twoTees)[r.flights]}
        // moved by hand: the draw "by hand" from then on – a rule would undo it ("by result" stays, for now anyway)
        onMove={(id, f) => props.onChange({ ...r, flightOf: { ...r.flightOf, [id]: f }, draw: r.draw.mode === 'result' ? r.draw : { ...r.draw, mode: 'manual' } })}
        onSaveFlight={(fi, time, start, ids) => {
          const at = fi ?? r.flights;
          const times = Array.from({ length: Math.max(r.flights, at + 1) }, (_, i) => r.times[i] ?? '');
          const starts = Array.from({ length: Math.max(r.flights, at + 1) }, (_, i) => r.starts[i] ?? null);
          const s = teeSlots(at + 1, r.draw.first, r.draw.gap, r.draw.twoTees)[at];
          times[at] = time === s.time ? '' : time;
          starts[at] = start === s.start ? null : start;
          const flightOf = Object.fromEntries(d.players.map((p) => [p.id, ids.includes(p.id) ? at : r.flightOf[p.id] === at ? null : (r.flightOf[p.id] ?? null)]));
          const moved = ids.join() !== (fi == null ? '' : d.players.filter((p) => r.flightOf[p.id] === fi).map((p) => p.id).join());
          props.onChange({ ...r, flights: fi == null ? r.flights + 1 : r.flights, times, starts, flightOf, draw: !moved || r.draw.mode === 'result' ? r.draw : { ...r.draw, mode: 'manual' } });
        }}
        onRemoveFlight={(fi) =>
          props.onChange({
            ...r,
            flights: r.flights - 1,
            times: r.times.filter((_, i) => i !== fi),
            starts: r.starts.filter((_, i) => i !== fi),
            scorers: Object.fromEntries(Object.entries(r.scorers ?? {}).filter(([k]) => Number(k) !== fi).map(([k, id]) => [Number(k) > fi ? Number(k) - 1 : Number(k), id])),
            flightOf: Object.fromEntries(Object.entries(r.flightOf).map(([id, f]) => [id, f === fi ? null : f != null && f > fi ? f - 1 : f])),
          })
        }
      />
      {props.problems.small && <span className="small bad-text">{tr('Every flight needs at least two players – they mark each other.', 'Jeder Flight braucht mindestens zwei Spieler – sie zählen sich gegenseitig.')}</span>}
      {props.problems.big && <span className="small bad-text">{tr('A flight has at most four players.', 'Ein Flight hat höchstens vier Spieler.')}</span>}
    </section>
  );
}

type Slot = { time: string; start: number };
const teeName = (start: number) => (start ? tr('Tee 10', 'Tee 10') : tr('Tee 1', 'Tee 1'));

/** The flights of a round: each a card with its tee time, its tee and its players. A player is moved by dragging –
 *  the grip ⋮⋮ at once, the row after a moment held – or by a tap ("move to …"). The board is a real box (not
 *  `display: contents`): the iPhone gives a cancelable touch only where an element with its listener has a box – the
 *  reason a player did not lift on Sascha's iPhone (04.11.2026: "nothing lifts"). The row itself follows the finger, as
 *  the shots in the round's review do. */
function FlightBoard(props: {
  players: TourPlayer[];
  flightOf: Record<string, number | null>;
  flights: number;
  slots: Slot[];
  nextTime: Slot;
  /** who marks whom in a flight – null: nobody marks */
  markers: ((ids: string[]) => Record<string, string>) | null;
  oneScorer: boolean;
  /** each flight's scorer chosen ("Einer für alle") – missing: its first */
  scorers: Record<number, string>;
  onScorer: (flight: number, id: string) => void;
  label: (p: TourPlayer) => string;
  playing: (p: TourPlayer) => number | null;
  onMove: (id: string, flight: number | null) => void;
  onSaveFlight: (flight: number | null, time: string, start: number, ids: string[]) => void;
  onRemoveFlight: (flight: number) => void;
}) {
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const flightOfId = (id: string) => {
    const f = props.flightOf[id];
    return f != null && f < props.flights ? f : -1;
  };
  const inFlight = (f: number) => props.players.filter((p) => flightOfId(p.id) === f);
  const unplaced = props.players.filter((p) => flightOfId(p.id) === -1);
  const byId = (id: string) => props.players.find((p) => p.id === id);
  const room = (f: number) => inFlight(f).length < FLIGHT_MAX;
  const fits = (f: number | null, id: string) => f != null && f !== flightOfId(id) && (f === -1 || room(f));

  type Drag = { id: string; x0: number; y0: number; sy0: number; x: number; y: number; over: number | null };
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const live = useRef<Drag | null>(null);
  const dropped = useRef(0); // the click after a drop opens nothing
  const put = (x: Drag | null) => {
    live.current = x;
    setDrag(x);
  };
  const flightAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-flight]') as HTMLElement | null;
    return el ? Number(el.dataset.flight) : null;
  };
  const begin = (id: string, x: number, y: number) => {
    setPressing(null);
    put({ id, x0: x, y0: y, sy0: window.scrollY, x, y, over: null });
    navigator.vibrate?.(15);
  };
  const follow = (x: number, y: number) => {
    const cur = live.current;
    if (cur) put({ ...cur, x, y, over: flightAt(x, y) });
  };
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;
  const fitsRef = useRef(fits);
  fitsRef.current = fits;
  const end = (x: number, y: number) => {
    const cur = live.current;
    if (!cur) return;
    const over = flightAt(x, y);
    const moved = Math.hypot(x - cur.x0, y - cur.y0) > 6;
    if (moved) dropped.current = Date.now();
    if (moved && fitsRef.current(over, cur.id)) onMove.current(cur.id, over === -1 ? null : over);
    put(null);
  };
  const lifted = !!drag;
  // while one is lifted: the page still; near the top or the bottom it scrolls along (the flights lie one below the other)
  useEffect(() => {
    if (!lifted) return;
    const still = (e: TouchEvent) => e.cancelable && e.preventDefault();
    const scrolled = () => live.current && put({ ...live.current });
    document.addEventListener('touchmove', still, { passive: false });
    window.addEventListener('scroll', scrolled);
    const tick = window.setInterval(() => {
      const cur = live.current;
      if (!cur) return;
      const edge = 90;
      const step = cur.y < edge ? -14 : cur.y > window.innerHeight - edge ? 14 : 0;
      if (step) window.scrollBy(0, step);
    }, 16);
    return () => {
      document.removeEventListener('touchmove', still);
      window.removeEventListener('scroll', scrolled);
      window.clearInterval(tick);
    };
  }, [lifted]);
  // the finger by its own touch events (Safari gives a pointer up the moment it thinks of scrolling) – attached anew
  // with every drawing, as in the round's review
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const start = (ev: TouchEvent) => {
      const t = ev.target as HTMLElement;
      const at = t.closest('[data-drag-id]') as HTMLElement | null;
      const t0 = ev.touches[0];
      if (!at || !t0 || ev.touches.length > 1 || t.closest('button, input, a')) return;
      const id = at.dataset.dragId!;
      const track = () => {
        let last = { x: t0.clientX, y: t0.clientY };
        const move = (e: TouchEvent) => {
          const f = e.touches[0];
          if (!f) return;
          if (e.cancelable) e.preventDefault();
          last = { x: f.clientX, y: f.clientY };
          follow(f.clientX, f.clientY);
        };
        const up = () => {
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
          window.removeEventListener('touchcancel', up);
          end(last.x, last.y);
        };
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
        window.addEventListener('touchcancel', up);
      };
      if (t.closest('[data-grip]')) {
        // the grip, a chip: lifted at once, the page kept still
        ev.preventDefault();
        begin(id, t0.clientX, t0.clientY);
        track();
        return;
      }
      // the row: held a moment (it shows it is pressed), then lifted; moved first – a scroll as ever
      setPressing(id);
      let x = t0.clientX;
      let y = t0.clientY;
      const wait = (e: TouchEvent) => {
        const f = e.touches[0];
        if (!f) return;
        x = f.clientX;
        y = f.clientY;
        if (Math.hypot(f.clientX - t0.clientX, f.clientY - t0.clientY) > 8) cancel();
      };
      const cancel = () => {
        window.clearTimeout(timer);
        setPressing(null);
        window.removeEventListener('touchmove', wait);
        window.removeEventListener('touchend', cancel);
        window.removeEventListener('touchcancel', cancel);
      };
      const timer = window.setTimeout(() => {
        cancel();
        begin(id, x, y);
        track();
      }, 300);
      window.addEventListener('touchmove', wait, { passive: true });
      window.addEventListener('touchend', cancel);
      window.addEventListener('touchcancel', cancel);
    };
    el.addEventListener('touchstart', start, { passive: false });
    return () => el.removeEventListener('touchstart', start);
  });
  // the mouse and the pen: the grip or a chip at once, a row once it is moved
  const grab = (p: TourPlayer, grip: boolean) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch' || e.button !== 0 || (e.target as HTMLElement).closest('button, input, a')) return;
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let started = false;
      if (grip) {
        begin(p.id, x0, y0);
        started = true;
      }
      const move = (ev: PointerEvent) => {
        if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
          begin(p.id, x0, y0);
          started = true;
        }
        if (started) follow(ev.clientX, ev.clientY);
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (started) end(ev.clientX, ev.clientY);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  });
  const tap = (id: string) => () => Date.now() - dropped.current > 500 && setMoving(id);
  const dragged = drag ? byId(drag.id) : null;
  const target = (f: number) => !!dragged && drag?.over === f && fits(f, dragged.id);
  // the lifted one where the finger is: moved by as much as the finger and the page
  const shift = (id: string) => (drag?.id === id ? { transform: `translate(${drag.x - drag.x0}px, ${drag.y - drag.y0 + window.scrollY - drag.sy0}px)` } : undefined);
  const grip = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
  const rowClass = (id: string, base: string) => `${base}${drag?.id === id ? ' lifted' : ''}${pressing === id ? ' pressing' : ''}`;
  return (
    <div ref={board} className={`tour-board${lifted ? ' dragging' : ''}`}>
      {Array.from({ length: props.flights }, (_, f) => {
        const ps = inFlight(f);
        const marks = props.markers ? props.markers(ps.map((p) => p.id)) : {};
        const scorer = props.oneScorer ? (ps.find((p) => p.id === props.scorers[f]) ?? ps[0]) : undefined;
        const slot = props.slots[f];
        return (
          <section key={f} className={`card tour-flight${target(f) ? ' drop-target' : ''}${dragged && flightOfId(dragged.id) !== f && !room(f) ? ' drop-full' : ''}`} aria-label={`Flight ${f + 1}`} data-flight={f}>
            <div className="tour-flight-head">
              <h2>
                Flight {f + 1} <strong className="tour-tee">{slot?.time}</strong>
                {slot?.start ? <span className="muted small">{teeName(slot.start)}</span> : null}
              </h2>
              {/* the pencil as everywhere (Sascha 04.11.2026: "no link 'Ändern' – our pencil") */}
              <button type="button" className="icon-btn edit-btn flight-edit" aria-label={tr(`Change flight ${f + 1}`, `Flight ${f + 1} ändern`)} onClick={() => setOpen(f)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                    <path d="M13.5 6.5l4 4" />
                  </svg>
              </button>
            </div>
            {/* who keeps the score of the flight – chosen here, in the flight (Sascha 04.11.2026) */}
            {scorer && ps.length > 1 && (
              <SettingsList>
                <ChoiceRow<string>
                  label={tr('Scorer', 'Schreiber')}
                  title={tr(`Scorer of flight ${f + 1}`, `Schreiber in Flight ${f + 1}`)}
                  value={scorer.id}
                  onChange={(id) => props.onScorer(f, id)}
                  options={ps.map((p) => ({ value: p.id, name: props.label(p), text: tr('Enters the scores of the flight, marks everyone.', 'Erfasst die Scores des Flights, zählt alle.') }))}
                />
              </SettingsList>
            )}
            {ps.map((p) => {
              const m = byId(scorer && p.id !== scorer.id ? scorer.id : (marks[p.id] ?? ''));
              const ph = props.playing(p);
              return (
                <div key={p.id} className={rowClass(p.id, 'tour-flight-player')} style={shift(p.id)} data-drag-id={p.id} role="button" tabIndex={0} aria-label={tr(`Move ${props.label(p)}`, `${props.label(p)} verschieben`)} onClick={tap(p.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setMoving(p.id)} {...grab(p, false)}>
                  <span className="grow">
                    <strong>{props.label(p)}</strong>
                    {m && <span className="muted small"> · {tr(`marked by ${props.label(m)}`, `Zähler: ${props.label(m)}`)}</span>}
                  </span>
                  <span className="muted small">{ph == null ? '' : tr(`PH ${ph}`, `SV ${ph}`)}</span>
                  <span className="tour-grip" data-grip="" aria-hidden="true" title={tr('Drag to another flight', 'Auf einen anderen Flight ziehen')} {...grab(p, true)}>
                    {grip}
                  </span>
                </div>
              );
            })}
            {!ps.length && <span className="muted small">{tr('No player yet – drag one here.', 'Noch kein Spieler – hierher ziehen.')}</span>}
          </section>
        );
      })}
      {(unplaced.length > 0 || (dragged && flightOfId(dragged.id) !== -1)) && (
        <section className={`card tour-flight tour-unplaced${target(-1) ? ' drop-target' : ''}`} aria-label={tr('Not in a flight yet', 'Noch ohne Flight')} data-flight={-1}>
          <div className="tour-flight-head">
            <h2>{tr('Not in a flight yet', 'Noch ohne Flight')}</h2>
          </div>
          {unplaced.length > 0 ? (
            <div className="tour-chips">
              {unplaced.map((p) => (
                <span key={p.id} className={rowClass(p.id, 'tour-chip')} style={shift(p.id)} data-drag-id={p.id} data-grip="" role="button" tabIndex={0} aria-label={tr(`Move ${props.label(p)}`, `${props.label(p)} verschieben`)} onClick={tap(p.id)} {...grab(p, true)}>
                  {grip}
                  {props.label(p)}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted small">{tr('Drop here: out of the flight', 'Hierher ziehen: aus dem Flight nehmen')}</span>
          )}
        </section>
      )}
      <span className="muted small">{tr('Hold a player and drag him onto another flight – or tap him.', 'Spieler gedrückt halten und auf einen anderen Flight ziehen – oder antippen.')}</span>
      <button type="button" className="btn-secondary" disabled={!unplaced.length} onClick={() => setOpen('new')}>
        {tr('+ Flight', '+ Flight')}
      </button>
      {moving && byId(moving) && (
        <PickSheet<number>
          title={tr(`Move ${props.label(byId(moving)!)}`, `${props.label(byId(moving)!)} verschieben`)}
          current={flightOfId(moving)}
          options={[
            ...Array.from({ length: props.flights }, (_, f) => f)
              .filter((f) => f === flightOfId(moving) || room(f))
              .map((f) => ({ value: f, name: `Flight ${f + 1} · ${props.slots[f]?.time ?? ''}`, text: inFlight(f).map(props.label).join(', ') || tr('No player yet', 'Noch kein Spieler') })),
            { value: -1, name: tr('Not in a flight yet', 'Noch ohne Flight') },
          ]}
          onPick={(f) => {
            if (f !== flightOfId(moving)) props.onMove(moving, f === -1 ? null : f);
            setMoving(null);
          }}
          onClose={() => setMoving(null)}
        />
      )}
      {open != null && (
        <FlightSheet
          n={open === 'new' ? props.flights + 1 : open + 1}
          slot={open === 'new' ? props.nextTime : props.slots[open]}
          chosen={open === 'new' ? [] : inFlight(open).map((p) => p.id)}
          offered={[...(open === 'new' ? [] : inFlight(open)), ...unplaced]}
          label={props.label}
          onSave={(time, start, ids) => {
            props.onSaveFlight(open === 'new' ? null : open, time, start, ids);
            setOpen(null);
          }}
          onRemove={
            open === 'new'
              ? undefined
              : () => {
                  props.onRemoveFlight(open);
                  setOpen(null);
                }
          }
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** One flight: its tee time to the minute and its tee, then its players – those in it and those not in a flight yet. */
function FlightSheet(props: { n: number; slot: Slot; chosen: string[]; offered: TourPlayer[]; label: (p: TourPlayer) => string; onSave: (time: string, start: number, ids: string[]) => void; onRemove?: () => void; onClose: () => void }) {
  const [time, setTime] = useState(props.slot.time);
  const [start, setStart] = useState(props.slot.start);
  const [ids, setIds] = useState<string[]>(props.chosen);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length < FLIGHT_MAX ? [...x, id] : x));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet tour-flight-sheet" role="dialog" aria-label={`Flight ${props.n}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Flight {props.n}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <SettingsList>
          <TimeRow id="flight-time" label={tr('Tee time', 'Startzeit')} value={time} onChange={(v) => v && setTime(v)} />
          <ChoiceRow<number>
            label={tr('Start', 'Start')}
            value={start}
            onChange={setStart}
            options={[
              { value: 0, name: tr('Tee 1', 'Tee 1') },
              { value: 9, name: tr('Tee 10', 'Tee 10') },
            ]}
          />
        </SettingsList>
        <div className="field">
          <label>
            {tr('Players', 'Spieler')} <span className="muted small">{ids.length}/{FLIGHT_MAX}</span>
          </label>
          {props.offered.length ? (
            <div className="chip-set" role="group" aria-label={tr('Players of the flight', 'Spieler des Flights')}>
              {props.offered.map((p) => {
                const on = ids.includes(p.id);
                return (
                  <button key={p.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && ids.length >= FLIGHT_MAX} onClick={() => toggle(p.id)}>
                    {props.label(p)}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="muted small">{tr('Everyone is in a flight.', 'Alle sind schon in einem Flight.')}</span>
          )}
        </div>
        {props.onRemove && <ActionBar label={`Flight ${props.n}`} actions={[{ label: tr(`Remove flight ${props.n}`, `Flight ${props.n} entfernen`), icon: 'delete', danger: true, onClick: props.onRemove }]} />}
        <button type="button" className="btn-primary" disabled={!ids.length} onClick={() => props.onSave(time, start, ids)}>
          {props.onRemove ? tr('Save', 'Speichern') : tr('Create flight', 'Flight anlegen')}
        </button>
      </section>
    </div>
  );
}

/** "Netto-Klassen": none, 2 or 3 – or own ones (Sascha 04.11.2026: "no hints; instead of '+ Klasse' a field under the
 *  last class to tap into for another one"): a row per class, its limit from a list; the field adds one in its order. */
function ClassesSheet(props: { value: number[]; onPick: (c: number[]) => void; onClose: () => void }) {
  const [own, setOwn] = useState<number[] | null>(props.value.length && !isPreset(props.value) ? props.value : null);
  const [editing, setEditing] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const lo = (i: number) => (own && i ? own[i - 1] + 1 : 1);
  const hi = (i: number) => (own && i < own.length - 1 ? own[i + 1] - 1 : CLASS_TOP - 1);
  useEffect(() => {
    if (editing == null) return;
    requestAnimationFrame(() => document.querySelector('.sheet .pick-option[aria-pressed="true"]')?.scrollIntoView({ block: 'center' }));
  }, [editing]);
  const add = () => {
    const v = Math.round(Number(typed.replace(',', '.')));
    setTyped('');
    if (!own || !(v >= 1 && v < CLASS_TOP) || own.includes(v) || own.length >= LETTERS.length - 1) return;
    setOwn([...own, v].sort((a, b) => a - b));
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={tr('Net classes', 'Netto-Klassen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{own ? tr('Own classes', 'Eigene Klassen') : tr('Net classes', 'Netto-Klassen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!own ? (
          <div className="pick-list">
            {CLASS_PRESETS.map((c) => (
              <button key={c.join()} type="button" className="pick-option" aria-pressed={props.value.join() === c.join()} onClick={() => props.onPick(c)}>
                <span className="grow">
                  <strong>{classesName(c)}</strong>
                  <span className="muted small">{!c.length ? tr('One ranking for all.', 'Eine Wertung für alle.') : tr('A ranking per class.', 'Eine Wertung je Klasse.')}</span>
                </span>
                {props.value.join() === c.join() && <span className="pick-check" aria-hidden="true">✓</span>}
              </button>
            ))}
            <button type="button" className="pick-option" aria-pressed={false} onClick={() => setOwn(props.value.length && !isPreset(props.value) ? props.value : [9, 18, 26])}>
              <span className="grow">
                <strong>{tr('Own …', 'Eigene …')}</strong>
                <span className="muted small">{tr('Two to ten classes, each with its limit.', 'Zwei bis zehn Klassen, jede mit ihrer Grenze.')}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : (
          <>
            <SettingsList label={tr('The classes', 'Die Klassen')}>
              {own.map((x, i) => (
                <SettingsRow key={i} label={tr(`Class ${LETTERS[i]}`, `Klasse ${LETTERS[i]}`)} value={tr(`up to ${x}`, `bis ${x}`)} onClick={() => setEditing(i)} />
              ))}
              <SettingsRow label={tr(`Class ${LETTERS[own.length]}`, `Klasse ${LETTERS[own.length]}`)} value={tr(`up to ${CLASS_TOP}`, `bis ${CLASS_TOP}`)} onClick={() => undefined} disabled />
              {own.length < LETTERS.length - 1 && (
                <label className="settings-row class-add">
                  <span>{tr('Another class', 'Weitere Klasse')}</span>
                  <input
                    className="class-add-input"
                    inputMode="numeric"
                    aria-label={tr('Limit of another class', 'Grenze einer weiteren Klasse')}
                    placeholder={tr('up to …', 'bis …')}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                    onBlur={add}
                  />
                </label>
              )}
            </SettingsList>
            <button type="button" className="btn-primary" onClick={() => props.onPick(own)}>
              {tr(`Use ${own.length + 1} classes`, `${own.length + 1} Klassen übernehmen`)}
            </button>
            <button type="button" className="link-btn small" onClick={() => setOwn(null)}>
              {tr('Back to the presets', 'Zurück zu den Vorlagen')}
            </button>
          </>
        )}
        {own && editing != null && (
          <PickSheet<number>
            title={tr(`Class ${LETTERS[editing]} up to`, `Klasse ${LETTERS[editing]} bis`)}
            current={own[editing]}
            options={Array.from({ length: hi(editing) - lo(editing) + 1 }, (_, k) => lo(editing) + k).map((v) => ({ value: v, name: tr(`up to ${v}`, `bis ${v}`) }))}
            onPick={(v) => {
              setOwn(own.map((x, j) => (j === editing ? v : x)));
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          >
            {own.length > 1 && (
              <ActionBar
                label={tr('This class', 'Diese Klasse')}
                actions={[{ label: tr(`Remove class ${LETTERS[editing]}`, `Klasse ${LETTERS[editing]} entfernen`), icon: 'delete', danger: true, onClick: () => { setOwn(own.filter((_, j) => j !== editing)); setEditing(null); } }]}
              />
            )}
          </PickSheet>
        )}
      </section>
    </div>
  );
}

