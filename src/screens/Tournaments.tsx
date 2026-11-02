import { useEffect, useMemo, useState } from 'react';
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
import { eventStandings, markerOf, plannedEvent, plannedFlight, refreshEvent, roundJoinLink, setSpecial, type RoundEvent } from '../lib/sharedround';
import { addToSeries, changeTour, createSeries, createTour, dissolveSeries, forgetTour, isPlanned, isSeriesHost, isTourHost, keepTour, loadSeries, loadTours, renameSeries, syncTours, tourState, type PlannedEvent, type SeriesEntry, type TourEntry } from '../lib/tourstore';
import { dayOf } from '../lib/wagers';
import { holesFor, metres, specialBoard, specialName, type Special, type SpecialKind } from '../lib/specials';
import { PlayerRow, RatingLine, teeChoicesFor } from './RoundSetup';
import { FriendChips } from './Home';
import { TopBar } from '../components/ui';
import { Qr } from '../components/ShareGame';
import { Bin } from '../components/Bin';
import { SwipeRow } from '../components/SwipeRow';
import { DeletedIcon, PlayedIcon } from '../components/RoundIcons';

// Tournaments in Games (Sascha 01.11.2026: "tournaments can be planned ahead just like bets – set them up for the USA
// now, put the flights together, choose the markers and send the invitations; in the USA everyone has it ready").
// Planned here, played in Rounds: a tournament is a round's event set up ahead (lib/tourstore.ts); on its day Rounds
// offers "take part" and every phone plays its flight – marks, signing, leaderboard as ever. Only the host changes it.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');

/** The menu's icon of the tournaments: a cup. */
export const TOURS_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4" />
    <path d="M12 14v3M8.5 20h7M9.5 17h5v3h-5z" />
  </svg>
);

export function useSeries(): SeriesEntry[] {
  const [list, setList] = useState(loadSeries);
  useEffect(() => {
    const reload = () => setList(loadSeries());
    window.addEventListener('golfos:tours-changed', reload);
    return () => window.removeEventListener('golfos:tours-changed', reload);
  }, []);
  return list;
}

export function useTours(): TourEntry[] {
  const [list, setList] = useState(loadTours);
  useEffect(() => {
    const reload = () => setList(loadTours());
    window.addEventListener('golfos:tours-changed', reload);
    return () => window.removeEventListener('golfos:tours-changed', reload);
  }, []);
  return list;
}

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const longDate = (d: string) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
};
const playersOf = (ev: RoundEvent) => Object.values(ev.flights).flatMap((f) => f.players);
const flightsOf = (ev: RoundEvent) => Object.values(ev.flights).filter((f) => f.players.length);
const teeTimeOf = (f: unknown): string => ((f as { teeTime?: string }).teeTime ?? '');

// ---------- the start page and the menu ----------

/** On "Play": plan a tournament – following them is in the menu "Tournaments" (its dot shows those to come). */
export function TourStartCard(props: { canShare: boolean; onNew: () => void }) {
  useEffect(() => {
    void syncTours();
  }, []);
  return (
    <section className="card play-card" aria-label={tr('Plan a tournament', 'Turnier planen')}>
      <strong className="play-course">{tr('Plan a new tournament', 'Neues Turnier planen')}</strong>
      {props.canShare ? (
        <button type="button" className="btn-secondary" onClick={props.onNew}>
          {tr('New tournament', 'Neues Turnier')}
        </button>
      ) : (
        <span className="muted small">{tr('Sign in to plan tournaments: Profile → "On all your devices".', 'Für Turniere anmelden: Profil → „Auf allen Geräten“.')}</span>
      )}
    </section>
  );
}

function TourRow(props: { e: TourEntry; onOpen: () => void }) {
  const { ev } = props.e;
  const n = playersOf(ev).length;
  const k = flightsOf(ev).length;
  return (
    <button type="button" className="list-item" onClick={props.onOpen}>
      <span className="round-date">
        <strong>{dm(ev.date)}</strong>
        <span className="muted small">{ev.date.slice(0, 4)}</span>
      </span>
      <span className="grow">
        <span className="title">{ev.name}</span>
        <span className="muted small one-line">
          {ev.course.name} · {n === 1 ? tr('1 player', '1 Spieler') : tr(`${n} players`, `${n} Spieler`)}
        </span>
      </span>
      <span className="game-row-result">
        <strong>{k}</strong>
        <span className="muted small">{k === 1 ? 'Flight' : 'Flights'}</span>
      </span>
    </button>
  );
}

/** The menu "Tournaments": the tiles at the top as Rounds, Games and Bets – planned, played, deleted – then the list. */
function SeriesRow(props: { s: SeriesEntry; onOpen: () => void }) {
  const { series } = props.s;
  const first = series.rounds[0]?.date ?? '';
  const last = series.rounds[series.rounds.length - 1]?.date ?? '';
  return (
    <button type="button" className="list-item tour-series-row" onClick={props.onOpen}>
      <span className="round-date">
        <strong>{first ? dm(first) : '–'}</strong>
        <span className="muted small">{first.slice(0, 4)}</span>
      </span>
      <span className="grow">
        <span className="title">{series.name}</span>
        <span className="muted small one-line">
          {tr('Series', 'Serie')} · {first && last ? `${dm(first)}–${dm(last)}` : ''} · {[...new Set(series.rounds.map((r) => r.course.name))].join(', ')}
        </span>
      </span>
      <span className="game-row-result">
        <strong>{series.rounds.length}</strong>
        <span className="muted small">{tr('rounds', 'Runden')}</span>
      </span>
    </button>
  );
}

/** Single tournaments made a series (Sascha 01.11.2026): pick them, name it. */
function SeriesSheet(props: { tours: TourEntry[]; onDone: (code: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (c: string) => {
    const n = new Set(picked);
    if (n.has(c)) n.delete(c);
    else n.add(c);
    setPicked(n);
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Make a tournament series', 'Turnierserie zusammenstellen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Make a tournament series', 'Turnierserie zusammenstellen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="field">
          <label htmlFor="series-name">{tr('Name of the series', 'Name der Serie')}</label>
          <input id="series-name" className="input" placeholder={tr('Golf trip 2026', 'Golfreise 2026')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <span className="eyebrow">{tr('Its rounds', 'Ihre Runden')}</span>
        {props.tours.map((e) => (
          <label key={e.code} className="list-item series-pick">
            <input type="checkbox" checked={picked.has(e.code)} onChange={() => toggle(e.code)} />
            <span className="grow">
              <span className="title">{e.ev.name}</span>
              <span className="muted small">
                {longDate(e.ev.date)} · {e.ev.course.name}
              </span>
            </span>
          </label>
        ))}
        <span className="muted small">{tr('The tournaments stay as they are – codes, players, scores; the series adds them up and has one code for all.', 'Die Turniere bleiben, wie sie sind – Codes, Spieler, Scores; die Serie zählt sie zusammen und hat einen Code für alle.')}</span>
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !name.trim() || picked.size < 2}
          onClick={async () => {
            setBusy(true);
            const code = await createSeries(name.trim(), props.tours.filter((e) => picked.has(e.code)).map((e) => e.code));
            setBusy(false);
            if (code) props.onDone(code);
            else setMsg(NO_NET());
          }}
        >
          {picked.size < 2 ? tr('Pick at least two', 'Mindestens zwei wählen') : tr(`Make the series of ${picked.size}`, `Serie aus ${picked.size} Runden anlegen`)}
        </button>
      </section>
    </div>
  );
}

export function ToursTab(props: { onOpen: (code: string) => void; onOpenSeries: (code: string) => void }) {
  const all = useTours();
  const series = useSeries().filter((s) => !s.series.deletedAt);
  const [making, setMaking] = useState(false);
  const inSeries = new Set(series.flatMap((s) => s.series.rounds.map((r) => r.code)));
  const single = (e: TourEntry) => !e.ev.series?.code && !inSeries.has(e.code);
  const groupable = all.filter((e) => !e.ev.deletedAt && single(e) && isTourHost(e));
  const [filter, setFilter] = useState<'planned' | 'played' | 'bin' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void syncTours();
  }, []);
  const today = dayOf(new Date());
  const live = all.filter((e) => !e.ev.deletedAt);
  const deleted = all.filter((e) => e.ev.deletedAt);
  const planned = live.filter((e) => tourState(e, today) !== 'played');
  const played = live.filter((e) => tourState(e, today) === 'played');
  const pick = (f: 'planned' | 'played' | 'bin') => setFilter(filter === f ? null : f);
  // a tournament swiped away: marked deleted for everyone, as from its page – "Undo" for a moment, then the bin
  const removeTour = async (e: TourEntry): Promise<boolean> => {
    const ok = await changeTour(e.code, { ...e.ev, deletedAt: new Date().toISOString() });
    setMsg(ok ? null : NO_NET());
    if (ok) window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'tour', id: e.code, label: e.ev.name, undo: () => void changeTour(e.code, { ...e.ev, deletedAt: null }) } }));
    return ok;
  };
  const shown = filter === 'planned' ? planned : filter === 'played' ? [...played].reverse() : [...planned, ...[...played].reverse()];
  return (
    <>
      <h1 className="tab-title">{tr('Tournaments', 'Turniere')}</h1>
      <div className="tile-row tile-row-3">
        <button type="button" className="tile" aria-pressed={filter === 'planned'} disabled={!planned.length} onClick={() => pick('planned')}>
          <span className="tile-head">
            <span className={`tile-num${planned.length ? ' good-text' : ''}`}>{planned.length}</span>
            <span className="tile-mark">{TOURS_ICON}</span>
          </span>
          <span className="muted small">{tr('planned', 'geplant')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'played'} disabled={!played.length} onClick={() => pick('played')}>
          <span className="tile-head">
            <span className="tile-num">{played.length}</span>
            <span className="tile-mark">
              <PlayedIcon />
            </span>
          </span>
          <span className="muted small">{tr('played', 'gespielt')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'bin'} disabled={!deleted.length} onClick={() => pick('bin')}>
          <span className="tile-head">
            <span className="tile-num">{deleted.length}</span>
            <span className="tile-mark">
              <DeletedIcon />
            </span>
          </span>
          <span className="muted small">{tr('deleted', 'gelöscht')}</span>
        </button>
      </div>
      <Bin
        open={filter === 'bin' && deleted.length > 0}
        title={tr('Deleted tournaments', 'Gelöschte Turniere')}
        items={deleted.map((e) => ({ id: e.code, date: e.ev.createdAt, title: e.ev.name, meta: `${longDate(e.ev.date)} · ${e.ev.course.name}`, deletedAt: e.ev.deletedAt! }))}
        onRestore={async (code) => {
          const e = deleted.find((x) => x.code === code);
          if (!e) return;
          if (!isTourHost(e)) return setMsg(tr('Whoever set it up can restore it.', 'Wer es angelegt hat, kann es wiederherstellen.'));
          setMsg((await changeTour(code, { ...e.ev, deletedAt: null })) ? null : NO_NET());
        }}
        onPurge={forgetTour}
      />
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {filter !== 'bin' &&
        (shown.length ? (
          <ul className="list">
            {/* a series once (its rounds inside), then the single tournaments */}
            {!filter &&
              series.map((s) => (
                <li key={s.code}>
                  <SeriesRow s={s} onOpen={() => props.onOpenSeries(s.code)} />
                </li>
              ))}
            {shown
              .filter((e) => filter || single(e))
              .map((e) => (
                <li key={e.code}>
                  {/* swiped away as a mail (Sascha 02.11.2026) – only the host deletes, marked for everyone, "Undo" or the bin brings it back */}
                  {isTourHost(e) ? (
                    <SwipeRow label={e.ev.name} onDelete={() => removeTour(e)}>
                      <TourRow e={e} onOpen={() => props.onOpen(e.code)} />
                    </SwipeRow>
                  ) : (
                    <TourRow e={e} onOpen={() => props.onOpen(e.code)} />
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">{tr('No tournaments yet – "New tournament" is on "Play".', 'Noch keine Turniere – „Neues Turnier“ unter „Spielen“.')}</p>
        ))}
      {filter !== 'bin' && groupable.length >= 2 && (
        <button type="button" className="btn-secondary" onClick={() => setMaking(true)}>
          {tr('Make a tournament series', 'Zu einer Turnierserie zusammenfassen')}
        </button>
      )}
      {making && (
        <SeriesSheet
          tours={[...groupable].sort((a, b) => a.ev.date.localeCompare(b.ev.date))}
          onClose={() => setMaking(false)}
          onDone={(code) => {
            setMaking(false);
            props.onOpenSeries(code);
          }}
        />
      )}
    </>
  );
}

// ---------- planning ----------

export interface TourPlayer {
  id: string;
  name: string;
  hcp: string; // the handicap index as typed
  tee: string | null;
  /** the flight: 0, 1, 2 … – null: not in a flight yet */
  flight: number | null;
  /** the playing handicap kept from before (a tournament changed later, its index unknown) */
  fixed?: number | null;
  /** he keeps the score of his whole flight (Sascha 02.11.2026: "one person enters the score for all") */
  scorer?: boolean;
}
export interface TourDraft {
  /** set: the tournament changed, not a new one */
  code?: string;
  base?: PlannedEvent;
  /** a new round of this series (its code) */
  series?: string;
  name: string;
  date: string;
  course: Course | null;
  optionId: string;
  scoring: Scoring;
  classes: number[];
  players: TourPlayer[];
  flights: number;
  /** who marks whom – markers[player] = the player who marks him (draft ids) */
  markers: Record<string, string>;
  /** the tee time of each flight, "HH:MM" – to the minute (12:08, 12:16) */
  times: string[];
  /** the special prizes (Sascha 01.11.2026: "Long Drive or Nearest to the Pin, optional") */
  specials: Special[];
}

/** A new flight starts this many minutes after the one before – then set to the minute (Sascha 02.11.2026: "we play
 *  12:08 and 12:16 – an interval is not needed when the time can be set exactly"). */
export const TEE_NEXT = 10;
export const FIRST_TEE = '09:00';
export const addMinutes = (t: string, min: number): string => {
  const [h, m] = t.split(':').map(Number);
  const x = Math.min(23 * 60 + 59, h * 60 + m + min);
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** n players into k flights, as even as can be (7 in 2: 4 and 3), in their order. */
/** At most four in a flight (Sascha 01.11.2026). */
export const FLIGHT_MAX = 4;

// the scorings of a tournament (Sascha 02.11.2026: "either gross or with the handicaps") – with the full handicap
const SCORINGS = (): { v: Scoring; name: string; text: string }[] => [
  { v: 'stroke', name: tr('Gross', 'Brutto'), text: tr('Stroke play without handicap – the fewest strokes win.', 'Zählspiel ohne Vorgabe – die wenigsten Schläge gewinnen.') },
  { v: 'net', name: tr('Net', 'Netto'), text: tr('Stroke play with the handicap – the strokes less the playing handicap.', 'Zählspiel mit Vorgabe – die Schläge abzüglich der Spielvorgabe.') },
  { v: 'stableford', name: 'Stableford', text: tr('Points per hole from the strokes and the handicap – the most points win.', 'Punkte je Loch aus Schlägen und Vorgabe – die meisten Punkte gewinnen.') },
];
/** On the tournament's page: gross, net (the full handicap) or Stableford – no percentage (Sascha 02.11.2026). */
const tourScoring = (s: Scoring) => (s === 'stableford' ? 'Stableford' : s === 'net' ? tr('Stroke play net', 'Zählspiel netto') : tr('Stroke play gross', 'Zählspiel brutto'));
const classesName = (c: number[]) => (!c.length ? tr('None', 'Keine') : c.length === 1 ? tr(`A up to ${c[0]} · B`, `A bis ${c[0]} · B`) : tr(`A up to ${c[0]} · B up to ${c[1]} · C`, `A bis ${c[0]} · B bis ${c[1]} · C`));

export function dealFlights<T extends { flight: number | null }>(players: T[], k: number): T[] {
  const sizes = Array.from({ length: k }, (_, i) => Math.floor(players.length / k) + (i < players.length % k ? 1 : 0));
  let f = 0;
  let left = sizes[0] ?? 0;
  return players.map((p) => {
    while (left === 0 && f < k - 1) left = sizes[++f];
    left--;
    return { ...p, flight: f };
  });
}

/** Who marks whom in a flight: as chosen where it still fits, else pairs (1 ↔ 2, 3 ↔ 4), three in a ring. */
export function markersOf(ids: string[], chosen: Record<string, string>): Record<string, string> {
  const pairs: Record<string, string> =
    ids.length < 2 ? {} : ids.length % 2 === 1 ? Object.fromEntries(ids.map((id, k) => [id, ids[(k + ids.length - 1) % ids.length]])) : Object.fromEntries(ids.map((id, k) => [id, ids[k % 2 === 0 ? k + 1 : k - 1]]));
  return Object.fromEntries(ids.map((id) => [id, chosen[id] && chosen[id] !== id && ids.includes(chosen[id]) ? chosen[id] : pairs[id]]).filter(([, m]) => m));
}

export function newTourDraft(): TourDraft {
  const prof = loadProfile();
  const today = dayOf(new Date());
  return {
    name: '',
    date: today,
    course: null,
    optionId: '',
    scoring: 'net',
    classes: [],
    players: [{ id: newId(), name: shownName(prof) || '', hcp: prof.hcpIndex ?? '', tee: null, flight: null }],
    flights: 0,
    markers: {},
    times: [],
    specials: [],
  };
}

/** A tournament to change: its players, flights, markers and times back into a draft. */
export function draftOf(e: TourEntry): TourDraft {
  const ev = e.ev;
  const course = loadCachedCourse(ev.course.id);
  const flights = flightsOf(ev);
  const players: TourPlayer[] = [];
  const markers: Record<string, string> = {};
  flights.forEach((f, k) => {
    const ids = new Map<string, string>();
    for (const p of f.players) {
      const id = newId();
      ids.set(p.id, id);
      const idx = (p as { hcpIndex?: number | null }).hcpIndex;
      players.push({ id, name: p.name, hcp: idx == null ? '' : String(idx).replace('.', tr('.', ',')), tee: p.tee ?? null, flight: k, fixed: p.playingHandicap, ...(f.scorer === p.id ? { scorer: true } : {}) });
    }
    for (const [pl, mk] of Object.entries(f.markers ?? {})) if (ids.has(pl) && ids.has(mk)) markers[ids.get(pl)!] = ids.get(mk)!;
  });
  const options = course ? loopOptions(course.holes) : [];
  const option = options.find((o) => o.loops.join() === ev.loopOrder.join() && buildRoundHoles(course!.holes, o).length === ev.holes.length);
  const times = flights.map((f) => teeTimeOf(f) || FIRST_TEE);
  return {
    code: e.code,
    base: ev,
    name: ev.name,
    date: ev.date,
    course,
    optionId: option?.id ?? options[0]?.id ?? '',
    scoring: ev.format?.scoring ?? 'net',
    classes: ev.classes ?? [],
    players,
    flights: Math.max(1, flights.length),
    markers,
    times,
    specials: ev.specials ?? [],
  };
}

export function TourSetup(props: { draft: TourDraft; onChange: (d: TourDraft) => void; onBack: () => void; onCourse: () => void; onSaved: (code: string) => void }) {
  const d = props.draft;
  const set = (patch: Partial<TourDraft>) => props.onChange({ ...d, ...patch });
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<'scoring' | 'classes' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const options = useMemo(() => (d.course ? loopOptions(d.course.holes) : []), [d.course]);
  const option = options.find((o) => o.id === d.optionId) ?? options[0];
  const rholes = d.course && option ? buildRoundHoles(d.course.holes, option) : [];
  const holes = rholes.length ? rholes : (d.base?.holes ?? []);
  const nine = holes.length === 9;
  const offered = useMemo(() => (d.course ? courseTees(d.course.id, loadGeometry(d.course.id).teeColours) : null), [d.course]);
  const lady = isLady();
  const startTee = offered ? defaultTee(offered.tees) : null;
  const myTee = offered && d.course ? (profileTee(offered, loadProfile().tee, d.course.id, inUsa([d.course.lon, d.course.lat])) ?? defaultTee(offered.tees, lady)) : null;
  const teeOf = (p: TourPlayer, k: number) => (p.tee && offered?.tees.includes(p.tee) ? p.tee : k === 0 ? myTee : startTee);
  const [, setRatingsSeen] = useState(0);
  useEffect(() => {
    if (!d.course) return;
    let alive = true;
    fetchShared(d.course.id).then(() => alive && setRatingsSeen((k) => k + 1));
    return () => {
      alive = false;
    };
  }, [d.course?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const courseId = d.course?.id ?? d.base?.course.id ?? '';
  const ratingOf = (p: TourPlayer, k: number) => (courseId && (holes.length === 18 || nine) ? ratingFor(courseId, teeOf(p, k) ?? '–', holes, k === 0 && lady) : null);
  const playingOf = (p: TourPlayer, k: number): number | null => (parseIndex(p.hcp) == null ? (p.fixed ?? null) : playingHandicapFor(courseId, holes, teeOf(p, k) ?? '–', p.hcp, k === 0 && lady));
  const teeChoices = d.course && offered ? teeChoicesFor(d.course.id, rholes, offered.tees) : [];
  const label = (p: TourPlayer, k: number) => p.name.trim() || tr(`Player ${k + 1}`, `Spieler ${k + 1}`);
  const flight = (f: number) => d.players.filter((p) => p.flight === f);
  // who marks whom: set by the app – pairs in the flight, three in a ring (Sascha 01.11.2026: "need not be configured")
  const markers = Object.assign({}, ...Array.from({ length: d.flights }, (_, f) => markersOf(flight(f).map((p) => p.id), {}))) as Record<string, string>;
  const setPlayers = (players: TourPlayer[]) => set({ players });
  // each flight's time as set; one not set yet: TEE_NEXT minutes after the one before
  const timesFor = (k: number) => {
    const out: string[] = [];
    for (let i = 0; i < k; i++) out.push(d.times[i] || (i ? addMinutes(out[i - 1], TEE_NEXT) : FIRST_TEE));
    return out;
  };
  const newPlayer = (name: string, hcp: string): TourPlayer => ({ id: newId(), name, hcp, tee: null, flight: null });
  const auto = () => {
    const k = Math.max(1, Math.ceil(d.players.length / FLIGHT_MAX));
    set({ flights: k, players: dealFlights(d.players, k).map(({ scorer: _s, ...p }) => p), times: timesFor(k), markers: {} });
  };
  // a flight saved from its sheet: its time and its players (a new one at the end)
  const saveFlight = (fi: number | null, time: string, ids: string[], scorer: string | null) => {
    const at = fi ?? d.flights;
    const times = timesFor(d.flights);
    times[at] = time;
    set({
      flights: fi == null ? d.flights + 1 : d.flights,
      times,
      players: d.players.map(({ scorer: _s, ...p }) => (ids.includes(p.id) ? { ...p, flight: at, ...(p.id === scorer ? { scorer: true } : {}) } : p.flight === at ? { ...p, flight: null } : _s ? { ...p, scorer: _s } : p)),
    });
  };
  const removeFlight = (fi: number) =>
    set({
      flights: d.flights - 1,
      times: timesFor(d.flights).filter((_, i) => i !== fi),
      players: d.players.map(({ scorer: _s, ...p }) => (p.flight === fi ? { ...p, flight: null } : p.flight != null && p.flight > fi ? { ...p, flight: p.flight - 1, ...(_s ? { scorer: _s } : {}) } : _s ? { ...p, scorer: _s } : p)),
    });
  const unplaced = d.players.filter((p) => p.flight == null || p.flight >= d.flights);
  const sizes = Array.from({ length: d.flights }, (_, f) => flight(f).length);
  const small = sizes.some((n) => n < 2);
  const big = sizes.some((n) => n > FLIGHT_MAX);
  const ready = !!d.name.trim() && !!d.date && holes.length > 0 && d.players.length >= 2 && d.players.every((p) => p.name.trim()) && d.flights > 0 && !small && !big && !unplaced.length;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setMsg(null);
    const summary: CourseSummary = d.course ? { id: d.course.id, source: d.course.source, name: d.course.name, lat: d.course.lat, lon: d.course.lon, ...(d.course.bbox ? { bbox: d.course.bbox } : {}) } : d.base!.course;
    const plan = Array.from({ length: d.flights }, (_, f) => {
      const ps = flight(f);
      const pid = (id: string) => `p${ps.findIndex((p) => p.id === id) + 1}`;
      return {
        name: ps.map((p) => label(p, d.players.indexOf(p))).join(' · '),
        teeTime: d.times[f],
        players: ps.map((p) => {
          const k = d.players.indexOf(p);
          const tee = teeOf(p, k);
          return { name: label(p, k), playingHandicap: playingOf(p, k), hcpIndex: parseIndex(p.hcp), ...(tee ? { tee } : {}) };
        }),
        markers: Object.fromEntries(ps.map((p) => [pid(p.id), pid(markers[p.id])])),
        // one for all: his place in the flight ("p2")
        ...(ps.some((p) => p.scorer) ? { scorer: pid(ps.find((p) => p.scorer)!.id) } : {}),
      };
    });
    const fresh = plannedEvent({
      name: d.name.trim(),
      date: d.date,
      course: summary,
      holes,
      loopOrder: option?.loops ?? d.base!.loopOrder,
      format: { mode: 'single', scoring: d.scoring, allowance: 100 }, // the full handicap – gross ignores it (02.11.2026)
      ...(myTee ? { tee: myTee } : {}),
      roundKind: 'tournament',
      ...(d.classes.length ? { classes: d.classes } : {}),
      flights: plan,
    }) as PlannedEvent;
    // changed: the flights keep their ids in order – a phone that joined flight 2 is still in flight 2
    const base = d.base;
    const ev: PlannedEvent = base
      ? {
          ...fresh,
          id: base.id,
          createdAt: base.createdAt,
          ...(base.by ? { by: base.by } : {}),
          deletedAt: base.deletedAt ?? null,
          flights: Object.fromEntries(
            plan.map((pf, f) => {
              const fl = plannedFlight(base, pf);
              const id = flightsOf(base)[f]?.id ?? fl.id;
              return [id, { ...fl, id }];
            }),
          ),
        }
      : fresh;
    // the special prizes on holes the course still has
    const specials = d.specials.filter((s) => s.hole < holes.length);
    if (specials.length) ev.specials = specials;
    else delete ev.specials;
    const code = d.code ? ((await changeTour(d.code, ev)) ? d.code : null) : await createTour(ev);
    setBusy(false);
    if (code && d.series) await addToSeries(d.series, code);
    else if (code && d.base?.series?.code) await addToSeries(d.base.series.code, code); // its day or course in the series' list
    if (code) props.onSaved(code);
    else setMsg(NO_NET());
  };

  return (
    <main className="screen">
      <TopBar title={d.code ? tr('Change the tournament', 'Turnier bearbeiten') : tr('New tournament', 'Neues Turnier')} onBack={props.onBack} backLabel={tr('Back', 'Zurück')} />

      <section className="setup-part">
        <span className="eyebrow">{tr('Tournament', 'Turnier')}</span>
        <div className="card setup-part">
          <div className="field">
            <label htmlFor="tour-name">{tr('Name', 'Name')}</label>
            <input id="tour-name" className="input" placeholder={tr('USA day 1', 'USA Tag 1')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="tour-date">{tr('Day', 'Tag')}</label>
            <input id="tour-date" type="date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="setup-part">
        <span className="eyebrow">{tr('Course', 'Platz')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={props.onCourse}>
            <span>{tr('Course', 'Platz')}</span>
            <span className={`settings-value${d.course || d.base ? '' : ' good-text'}`}>{d.course?.name ?? d.base?.course.name ?? tr('Choose a course', 'Platz wählen')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        {d.course && options.length > 1 && (
          <div className="choice-grid">
            {options.map((o) => (
              <button key={o.id} type="button" className="choice choice-loop" aria-pressed={o.id === option?.id} onClick={() => set({ optionId: o.id })}>
                <strong>{o.label.split(' · ')[0]}</strong>
                {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* the format as a round's in Rounds (Sascha 02.11.2026: "gross, or with the handicaps – no 95 %; shown as the
          format of a round") – a row each, a sheet to pick from */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Format', 'Spielform')}</span>
        <div className="settings-list">
          <button type="button" className="settings-row" onClick={() => setPick('scoring')}>
            <span>{tr('Scoring', 'Wertung')}</span>
            <span className="settings-value">{SCORINGS().find((x) => x.v === d.scoring)?.name ?? ''}</span>
            <span aria-hidden="true">›</span>
          </button>
          {d.scoring !== 'stroke' && (
            <button type="button" className="settings-row" onClick={() => setPick('classes')}>
              <span>{tr('Net classes', 'Netto-Klassen')}</span>
              <span className="settings-value">{classesName(d.classes)}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      </section>
      {pick && (
        <div className="sheet-backdrop" onClick={() => setPick(null)}>
          <section className="sheet" role="dialog" aria-label={pick === 'scoring' ? tr('Choose the scoring', 'Wertung wählen') : tr('Net classes', 'Netto-Klassen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{pick === 'scoring' ? tr('Choose the scoring', 'Wertung wählen') : tr('Net classes', 'Netto-Klassen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPick(null)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {pick === 'scoring' &&
                SCORINGS().map((x) => (
                  <button key={x.v} type="button" className="pick-option" aria-pressed={d.scoring === x.v} onClick={() => { set({ scoring: x.v, ...(x.v === 'stroke' ? { classes: [] } : {}) }); setPick(null); }}>
                    <span className="grow">
                      <strong>{x.name}</strong>
                      <span className="muted small">{x.text}</span>
                    </span>
                    {d.scoring === x.v && <span className="pick-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              {pick === 'classes' &&
                ([[], [18], [12, 24]] as number[][]).map((c) => (
                  <button key={c.join()} type="button" className="pick-option" aria-pressed={d.classes.join() === c.join()} onClick={() => { set({ classes: c }); setPick(null); }}>
                    <span className="grow">
                      <strong>{classesName(c)}</strong>
                      <span className="muted small">{!c.length ? tr('One ranking for all.', 'Eine Wertung für alle.') : tr('A ranking per class, by playing handicap.', 'Eine Wertung je Klasse, nach Spielvorgabe.')}</span>
                    </span>
                    {d.classes.join() === c.join() && <span className="pick-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}

      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        {d.players.map((p, k) => (
          <PlayerRow
            key={p.id}
            className="game-player-row"
            player={{ id: `t${p.id}`, name: p.name, index: p.hcp, handicap: '', tee: teeOf(p, k) }}
            nameLabel={tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
            rating={ratingOf(p, k)}
            playing={playingOf(p, k)}
            nine={nine}
            tees={teeChoices.length ? teeChoices : undefined}
            onChange={(np) => setPlayers(d.players.map((x) => (x.id === p.id ? { ...x, name: np.name, hcp: np.index, tee: np.tee, fixed: np.index !== x.hcp ? null : x.fixed } : x)))}
            onRemove={d.players.length > 1 ? () => setPlayers(d.players.filter((x) => x.id !== p.id)) : undefined}
          />
        ))}
        {courseId && (holes.length === 18 || nine) && (
          <RatingLine
            rating={d.players[0] ? ratingOf(d.players[0], 0) : null}
            nine={nine}
            onSave={(v) => {
              saveOwnRating(courseId, teeOf(d.players[0], 0) ?? '–', holes, v);
              setRatingsSeen((k) => k + 1);
            }}
          />
        )}
        <FriendChips taken={d.players.map((p) => p.name)} onAdd={(fr) => setPlayers([...d.players, newPlayer(fr.name, fr.hcp)])} />
        <button type="button" className="btn-secondary" onClick={() => setPlayers([...d.players, newPlayer('', '')])}>
          {tr('+ Add player', '+ Spieler hinzufügen')}
        </button>
      </section>

      <section className="setup-part">
        <span className="eyebrow">{tr('Flights and tee times', 'Flights und Startzeiten')}</span>
        <FlightBoard
          players={d.players}
          flights={d.flights}
          times={timesFor(d.flights + 1)}
          markers={markers}
          label={(p) => label(p, d.players.indexOf(p))}
          playing={(p) => playingOf(p, d.players.indexOf(p))}
          onSave={saveFlight}
          onRemoveFlight={removeFlight}
          onAuto={auto}
          onMove={(id, f) => set({ players: d.players.map(({ scorer: _s, ...p }) => (p.id === id ? { ...p, flight: f } : _s ? { ...p, scorer: _s } : p)) })}
        />
        {small && <span className="small bad-text">{tr('Every flight needs at least two players – they mark each other.', 'Jeder Flight braucht mindestens zwei Spieler – sie zählen sich gegenseitig.')}</span>}
        {big && <span className="small bad-text">{tr('A flight has at most four players.', 'Ein Flight hat höchstens vier Spieler.')}</span>}
      </section>

      <section className="setup-part">
        <span className="eyebrow">{tr('Special prizes (optional)', 'Sonderwertungen (optional)')}</span>
        {d.specials.map((s, k) => (
          <div key={s.id} className="card tour-special">
            <strong className="grow">{specialName(s.kind)}</strong>
            <div className="select-wrap">
              <select
                className="input"
                aria-label={tr(`Hole of ${specialName(s.kind)}`, `Loch für ${specialName(s.kind)}`)}
                value={s.hole}
                onChange={(e) => set({ specials: d.specials.map((x, j) => (j === k ? { ...x, hole: Number(e.target.value) } : x)) })}
              >
                {holesFor(s.kind, holes).map((i) => (
                  <option key={i} value={i}>
                    {tr(`Hole ${holes[i].label} · par ${holes[i].par ?? '–'}`, `Loch ${holes[i].label} · Par ${holes[i].par ?? '–'}`)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="icon-btn" aria-label={tr(`Remove ${specialName(s.kind)}`, `${specialName(s.kind)} entfernen`)} onClick={() => set({ specials: d.specials.filter((_, j) => j !== k) })}>
              ✕
            </button>
          </div>
        ))}
        {holes.length > 0 ? (
          <div className="tour-special-add">
            {(['longDrive', 'nearestPin'] as SpecialKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const free = holesFor(kind, holes).filter((i) => !d.specials.some((x) => x.hole === i));
                  set({ specials: [...d.specials, { id: newId(), kind, hole: free[0] ?? holesFor(kind, holes)[0] }] });
                }}
              >
                + {specialName(kind)}
              </button>
            ))}
          </div>
        ) : (
          <span className="muted small">{tr('Choose the course first.', 'Zuerst den Platz wählen.')}</span>
        )}
        {d.specials.length > 0 && (
          <span className="muted small">
            {tr(
              'On the day the players enter their figure at the hole in Rounds – Nearest to the Pin the distance to the hole, Long Drive the length from the tee (GPS suggests it; only a ball in the fairway counts).',
              'Am Turniertag tragen die Spieler am Loch in Rounds ein – Nearest to the Pin den Abstand zur Fahne, Long Drive die Weite vom Abschlag (GPS schlägt sie vor; nur ein Ball im Fairway zählt).',
            )}
          </span>
        )}
      </section>

      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      <span className="spacer" />
      <div className="sticky-cta">
        <button type="button" className="btn-primary" disabled={!ready || busy} onClick={() => void save()}>
          {d.code ? tr('Save', 'Speichern') : tr('Set up the tournament', 'Turnier anlegen')}
        </button>
      </div>
    </main>
  );
}

/** Who may mark whom in a flight, each way once: pairs (with four: 1–2/3–4, 1–3/2–4, 1–4/2–3), with an odd number a
 *  ring one way or the other. markers[player] = who marks him. */
export function pairings(ids: string[]): Record<string, string>[] {
  const n = ids.length;
  if (n < 2) return [{}];
  if (n % 2 === 1)
    return [Object.fromEntries(ids.map((id, k) => [id, ids[(k + n - 1) % n]])), Object.fromEntries(ids.map((id, k) => [id, ids[(k + 1) % n]]))];
  return ids.slice(1).map((partner) => {
    const rest = ids.filter((x) => x !== ids[0] && x !== partner);
    const m: Record<string, string> = { [ids[0]]: partner, [partner]: ids[0] };
    for (let k = 0; k + 1 < rest.length; k += 2) {
      m[rest[k]] = rest[k + 1];
      m[rest[k + 1]] = rest[k];
    }
    return m;
  });
}

/** The flights as on the tournament's page (Sascha 02.11.2026: "create a flight with its tee time, then assign people
 *  to it – flight 2 or 3 offers only those not in a flight yet; easy to change afterwards; show who marks whom"): each
 *  flight its time, its players and their markers (set by the app), "Ändern" opens it again; "+ Flight" a new one. */
function FlightBoard(props: {
  players: TourPlayer[];
  flights: number;
  /** each flight's time – one more: the next new flight's */
  times: string[];
  markers: Record<string, string>;
  label: (p: TourPlayer) => string;
  playing: (p: TourPlayer) => number | null;
  onSave: (flight: number | null, time: string, ids: string[], scorer: string | null) => void;
  onRemoveFlight: (flight: number) => void;
  onAuto: () => void;
  /** a player dragged onto another flight (null: back to "not in a flight yet") */
  onMove: (id: string, flight: number | null) => void;
}) {
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const inFlight = (f: number) => props.players.filter((p) => p.flight === f);
  const unplaced = props.players.filter((p) => p.flight == null || p.flight >= props.flights);
  const byId = (id: string) => props.players.find((p) => p.id === id);
  // drag and drop (Sascha 02.11.2026: "move the players between the flights by drag and drop"): a player taken by his
  // grip (the page still scrolls everywhere else) or, not in a flight yet, by his chip; dropped on a flight with room or
  // on "not in a flight yet". "Ändern" stays for the tee time, the scorer – and for VoiceOver.
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; x: number; y: number; moved: boolean; over: number | null } | null>(null);
  const flightAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-flight]') as HTMLElement | null;
    return el ? Number(el.dataset.flight) : null;
  };
  const room = (f: number) => inFlight(f).length < FLIGHT_MAX;
  const from = (id: string) => {
    const p = byId(id);
    return p && p.flight != null && p.flight < props.flights ? p.flight : -1;
  };
  const fits = (f: number | null | undefined, id: string) => f != null && f !== from(id) && (f === -1 || room(f));
  // dragged near the top or the bottom of the screen: the page scrolls along – the flights lie one below the other
  const dragY = drag?.moved ? drag.y : null;
  useEffect(() => {
    if (dragY == null) return;
    const edge = 90;
    const step = dragY < edge ? -14 : dragY > window.innerHeight - edge ? 14 : 0;
    if (!step) return;
    const t = window.setInterval(() => window.scrollBy(0, step), 16);
    return () => window.clearInterval(t);
  }, [dragY]);
  const grab = (p: TourPlayer) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer gone */
      }
      setDrag({ id: p.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, over: null });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!drag || drag.id !== p.id) return;
      const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moved, over: moved ? flightAt(e.clientX, e.clientY) : null });
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (!drag || drag.id !== p.id) return;
      const over = drag.moved ? flightAt(e.clientX, e.clientY) : null;
      if (fits(over, p.id)) props.onMove(p.id, over === -1 ? null : over);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });
  const dragged = drag?.moved ? byId(drag.id) : null;
  const target = (f: number) => !!dragged && drag?.over === f && fits(f, dragged.id);
  return (
    <>
      {Array.from({ length: props.flights }, (_, f) => {
        const ps = inFlight(f);
        const scorer = ps.find((p) => p.scorer);
        return (
          <section key={f} className={`card tour-flight${target(f) ? ' drop-target' : ''}${dragged && from(dragged.id) !== f && !room(f) ? ' drop-full' : ''}`} aria-label={`Flight ${f + 1}`} data-flight={f}>
            <div className="tour-flight-head">
              <h2>
                Flight {f + 1} <strong className="tour-tee">{props.times[f]}</strong>
              </h2>
              <button type="button" className="link-btn small" aria-label={tr(`Change flight ${f + 1}`, `Flight ${f + 1} ändern`)} onClick={() => setOpen(f)}>
                {tr('Change', 'Ändern')}
              </button>
            </div>
            {scorer && <span className="small tour-scorer">{tr(`${props.label(scorer)} keeps the score of all`, `${props.label(scorer)} erfasst die Scores für alle`)}</span>}
            {ps.map((p) => {
              // with a scorer he signs every other card as marker; his own: his marker as usual (lib/sharedround markerOf)
              const m = byId(scorer && p.id !== scorer.id ? scorer.id : (props.markers[p.id] ?? ''));
              const ph = props.playing(p);
              return (
                <div key={p.id} className={`tour-flight-player${dragged?.id === p.id ? ' lifted' : ''}`}>
                  <span className="grow">
                    <strong>{props.label(p)}</strong>
                    {m && <span className="muted small"> · {tr(`marked by ${props.label(m)}`, `Zähler: ${props.label(m)}`)}</span>}
                  </span>
                  <span className="muted small">{ph == null ? '' : tr(`PH ${ph}`, `SV ${ph}`)}</span>
                  <span className="tour-grip" aria-hidden="true" title={tr('Drag to another flight', 'Auf einen anderen Flight ziehen')} {...grab(p)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="9" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                      <circle cx="9" cy="18" r="1.6" />
                      <circle cx="15" cy="18" r="1.6" />
                    </svg>
                  </span>
                </div>
              );
            })}
            {!ps.length && <span className="muted small">{tr('No player yet – "Change" assigns them.', 'Noch kein Spieler – „Ändern“ ordnet sie zu.')}</span>}
          </section>
        );
      })}
      {(unplaced.length > 0 || (dragged && from(dragged.id) !== -1)) && (
        <section className={`card tour-flight tour-unplaced${target(-1) ? ' drop-target' : ''}`} aria-label={tr('Not in a flight yet', 'Noch ohne Flight')} data-flight={-1}>
          <div className="tour-flight-head">
            <h2>{tr('Not in a flight yet', 'Noch ohne Flight')}</h2>
            {props.players.length >= 2 && (
              <button type="button" className="link-btn small" onClick={props.onAuto}>
                {tr('Share out', 'Automatisch einteilen')}
              </button>
            )}
          </div>
          {unplaced.length > 0 ? (
            <div className="tour-chips">
              {unplaced.map((p) => (
                <span key={p.id} className={`tour-chip${dragged?.id === p.id ? ' lifted' : ''}`} {...grab(p)}>
                  {props.label(p)}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted small">{tr('Drop here: out of the flight', 'Hierher ziehen: aus dem Flight nehmen')}</span>
          )}
          {unplaced.length > 0 && props.flights > 0 && <span className="muted small">{tr('Drag a player onto a flight – or "Change" on the flight.', 'Spieler auf einen Flight ziehen – oder beim Flight „Ändern“.')}</span>}
        </section>
      )}
      {dragged && drag && (
        <span className="tour-chip tour-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {props.label(dragged)}
        </span>
      )}
      <button type="button" className="btn-secondary" disabled={!unplaced.length} onClick={() => setOpen('new')}>
        {tr('+ Flight', '+ Flight')}
      </button>
      {open != null && (
        <FlightSheet
          n={open === 'new' ? props.flights + 1 : open + 1}
          time={props.times[open === 'new' ? props.flights : open]}
          chosen={open === 'new' ? [] : inFlight(open).map((p) => p.id)}
          scorer={open === 'new' ? null : (inFlight(open).find((p) => p.scorer)?.id ?? null)}
          offered={[...(open === 'new' ? [] : inFlight(open)), ...unplaced]}
          label={props.label}
          onSave={(time, ids, scorer) => {
            props.onSave(open === 'new' ? null : open, time, ids, scorer);
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
    </>
  );
}

/** One flight: its tee time to the minute, then its players – those in it and those not in a flight yet, four at most. */
function FlightSheet(props: { n: number; time: string; chosen: string[]; scorer: string | null; offered: TourPlayer[]; label: (p: TourPlayer) => string; onSave: (time: string, ids: string[], scorer: string | null) => void; onRemove?: () => void; onClose: () => void }) {
  const [time, setTime] = useState(props.time);
  const [ids, setIds] = useState<string[]>(props.chosen);
  // who enters the scores (Sascha 02.11.2026): everyone with a marker (null), or one player for all
  const [scorer, setScorer] = useState<string | null>(props.scorer);
  const toggle = (id: string) => {
    if (ids.includes(id) && scorer === id) setScorer(null);
    setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length < FLIGHT_MAX ? [...x, id] : x));
  };
  const chosen = props.offered.filter((p) => ids.includes(p.id));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet tour-flight-sheet" role="dialog" aria-label={`Flight ${props.n}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Flight {props.n}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="field">
          <label htmlFor="flight-time">{tr('Tee time', 'Startzeit')}</label>
          <input id="flight-time" type="time" step={60} className="input" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
        </div>
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
          <span className="muted small">
            {ids.length >= FLIGHT_MAX ? tr('Full – four players.', 'Voll – vier Spieler.') : tr('Only players not in a flight yet are offered. Who marks whom, the app sets.', 'Angeboten werden nur Spieler ohne Flight. Wer wen zählt, legt die App fest.')}
          </span>
        </div>
        {ids.length >= 2 && (
          <div className="field">
            <label>{tr('Who enters the scores?', 'Wer erfasst die Scores?')}</label>
            <div className="chip-set" role="group" aria-label={tr('Who enters the scores', 'Wer erfasst die Scores')}>
              <button type="button" className={`chip${scorer == null ? ' on' : ''}`} aria-pressed={scorer == null} onClick={() => setScorer(null)}>
                {tr('Everyone, with a marker', 'Jeder mit Zähler')}
              </button>
              {chosen.map((p) => (
                <button key={p.id} type="button" className={`chip${scorer === p.id ? ' on' : ''}`} aria-pressed={scorer === p.id} onClick={() => setScorer(p.id)}>
                  {tr(`${props.label(p)} for all`, `${props.label(p)} für alle`)}
                </button>
              ))}
            </div>
            <span className="muted small">
              {scorer
                ? tr('He enters everything for everyone – strokes, putts, sand, penalties, tee shot – and is everyone\'s marker.', 'Er erfasst alles für alle – Schläge, Putts, Sand, Strafschläge, Abschlag – und ist für alle der Zähler.')
                : tr('Everyone enters his own score; his marker counts him too.', 'Jeder erfasst seinen eigenen Score, sein Zähler zählt ihn mit.')}
            </span>
          </div>
        )}
        <button type="button" className="btn-primary" disabled={!ids.length} onClick={() => props.onSave(time, ids, scorer && ids.includes(scorer) ? scorer : null)}>
          {props.onRemove ? tr('Save', 'Speichern') : tr('Create flight', 'Flight anlegen')}
        </button>
        {props.onRemove && (
          <button type="button" className="btn-secondary btn-danger" onClick={props.onRemove}>
            {tr(`Remove flight ${props.n}`, `Flight ${props.n} entfernen`)}
          </button>
        )}
      </section>
    </div>
  );
}

/** The host's correction of a special prize: whose entry, how far – or the entry taken away. */
function SpecialFixSheet(props: { special: Special; ev: RoundEvent; onSave: (fid: string, pid: string, m: number | null, fairway: boolean) => void; onClose: () => void }) {
  const players = flightsOf(props.ev).flatMap((f) => f.players.map((p) => ({ fid: f.id, pid: p.id, name: p.name, key: `${f.id}/${p.id}` })));
  const [who, setWho] = useState(players[0]?.key ?? '');
  const [m, setM] = useState('');
  const [fairway, setFairway] = useState(true);
  const one = players.find((p) => p.key === who);
  const value = Number(m.replace(',', '.'));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={tr('Correct an entry', 'Eintrag korrigieren')} onClick={(e) => e.stopPropagation()}>
        <strong>{specialName(props.special.kind)}</strong>
        <div className="select-wrap">
          <select className="input" aria-label={tr('Player', 'Spieler')} value={who} onChange={(e) => setWho(e.target.value)}>
            {players.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="special-m">{props.special.kind === 'nearestPin' ? tr('Distance to the hole (m)', 'Abstand zur Fahne (m)') : tr('Length from the tee (m)', 'Weite vom Abschlag (m)')}</label>
          <input id="special-m" className="input" inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} />
        </div>
        {props.special.kind === 'longDrive' && (
          <label className="list-item series-pick">
            <input type="checkbox" checked={fairway} onChange={(e) => setFairway(e.target.checked)} />
            <span className="grow">{tr('In the fairway', 'Im Fairway')}</span>
          </label>
        )}
        <button type="button" className="btn-primary" disabled={!one || !(value > 0)} onClick={() => one && props.onSave(one.fid, one.pid, value, fairway)}>
          {tr('Save', 'Speichern')}
        </button>
        <button type="button" className="btn-secondary btn-danger" disabled={!one} onClick={() => one && props.onSave(one.fid, one.pid, null, fairway)}>
          {tr('Take the entry away', 'Eintrag entfernen')}
        </button>
      </section>
    </div>
  );
}

// ---------- a tournament series ----------

/** The total of a series (Sascha 01.11.2026: "the sum of all rounds"): each player's results of the rounds played added
 *  up – to par, or Stableford points – with the rounds counted. Players are the same by name. */
export function seriesStandings(evs: RoundEvent[]): { higherBetter: boolean; rows: { name: string; sum: number; rounds: number; pos: string }[] } {
  const by = new Map<string, { name: string; sum: number; rounds: number }>();
  let hb = false;
  for (const ev of evs) {
    const st = eventStandings(ev);
    hb = st.higherBetter;
    for (const r of st.rows) {
      if (r.sort == null || !r.thru) continue;
      const k = r.name.trim().toLowerCase();
      const x = by.get(k) ?? { name: r.name, sum: 0, rounds: 0 };
      x.sum += r.sort;
      x.rounds++;
      by.set(k, x);
    }
  }
  const rows = [...by.values()].sort((a, b) => (hb ? b.sum - a.sum : a.sum - b.sum));
  return { higherBetter: hb, rows: rows.map((x) => ({ ...x, pos: `${rows.filter((y) => y.sum === x.sum).length > 1 ? 'T' : ''}${rows.findIndex((y) => y.sum === x.sum) + 1}` })) };
}

export function SeriesScreen(props: { code: string; onBack: () => void; onOpen: (code: string) => void; onAddRound: (d: TourDraft) => void }) {
  const entry = useSeries().find((e) => e.code === props.code);
  const tours = useTours();
  const [evs, setEvs] = useState<RoundEvent[]>([]);
  const [sheet, setSheet] = useState<null | 'invite' | 'rename' | 'dissolve'>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const today = dayOf(new Date());
  const codes = entry?.series.rounds.map((r) => r.code).join() ?? '';
  useEffect(() => {
    void syncTours();
  }, []);
  // the rounds as the server has them – from the first day on every 30 s, for the total
  useEffect(() => {
    if (!codes) return;
    let alive = true;
    const tick = () => void Promise.all(codes.split(',').map((c) => refreshEvent(c))).then((xs) => alive && setEvs(xs.filter((x): x is RoundEvent => !!x)));
    tick();
    const t = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [codes]);
  if (!entry) {
    return (
      <main className="screen">
        <TopBar title={tr('Series', 'Serie')} onBack={props.onBack} backLabel={tr('Tournaments', 'Turniere')} />
        <p className="muted">{tr('Loading the series …', 'Lade die Serie …')}</p>
      </main>
    );
  }
  const s = entry.series;
  const host = isSeriesHost(entry);
  const total = seriesStandings(evs.filter((e) => (e as PlannedEvent).date <= today));
  const fmtSum = (v: number) => (total.higherBetter ? tr(`${v} pts`, `${v} Pkt.`) : v === 0 ? 'Par' : v > 0 ? `+${v}` : `−${-v}`);
  const lastRound = [...s.rounds].reverse().map((r) => tours.find((t) => t.code === r.code)).find(Boolean);
  return (
    <main className="screen tour-screen">
      <TopBar
        title={s.name}
        onBack={props.onBack}
        backLabel={tr('Tournaments', 'Turniere')}
        right={
          host ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={tr('Rename the series', 'Serie umbenennen')}
              onClick={() => {
                setName(s.name);
                setSheet('rename');
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <span className="muted small">
        {tr('Tournament series', 'Turnierserie')} · {s.rounds.length} {tr('rounds', 'Runden')}
        {s.rounds.length ? ` · ${dm(s.rounds[0].date)}–${dm(s.rounds[s.rounds.length - 1].date)}` : ''}
      </span>
      <section className="card" aria-label={tr('Total standing', 'Gesamtwertung')}>
        <span className="eyebrow">{tr('Total standing – all rounds added up', 'Gesamtwertung – alle Runden zusammen')}</span>
        {total.rows.length ? (
          <ul className="game-pays">
            {total.rows.map((r) => (
              <li key={r.name}>
                <span>
                  {r.pos} · {r.name} <span className="muted small">· {tr(`${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}`, `${r.rounds} ${r.rounds === 1 ? 'Runde' : 'Runden'}`)}</span>
                </span>
                <strong>{fmtSum(r.sum)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted small">{tr('Shows once the first round is played.', 'Erscheint, sobald die erste Runde gespielt ist.')}</span>
        )}
      </section>
      <span className="eyebrow">{tr('Rounds', 'Runden')}</span>
      <ul className="list">
        {s.rounds.map((r, k) => (
          <li key={r.code}>
            <button type="button" className="list-item" onClick={() => props.onOpen(r.code)}>
              <span className="round-date">
                <strong>{dm(r.date)}</strong>
                <span className="muted small">{tr(`Round ${k + 1}`, `Runde ${k + 1}`)}</span>
              </span>
              <span className="grow">
                <span className="title">{r.name}</span>
                <span className="muted small one-line">{r.course.name}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {host && lastRound && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            // a new round: the flights, markers and tee times of the last one (Sascha: "taken from round 1, changeable")
            const d = draftOf(lastRound);
            const next = dayOf(new Date(new Date(`${lastRound.ev.date}T12:00:00`).getTime() + 864e5));
            props.onAddRound({ ...d, code: undefined, base: undefined, series: props.code, date: next, name: `${s.name} · ${tr(`Round ${s.rounds.length + 1}`, `Runde ${s.rounds.length + 1}`)}` });
          }}
        >
          {tr('+ Round', '+ Runde')}
        </button>
      )}
      {host && (
        <button type="button" className="btn-secondary" onClick={() => setSheet('invite')}>
          {tr(`Invite players · code ${props.code}`, `Mitspieler einladen · Code ${props.code}`)}
        </button>
      )}
      {!host && <span className="muted small">{tr('Only whoever set up the series changes it.', 'Nur wer die Serie angelegt hat, ändert sie.')}</span>}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {host && (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setSheet('dissolve')}>
          {tr('Undo the series', 'Serie auflösen')}
        </button>
      )}
      {sheet === 'invite' && <TourInviteSheet code={props.code} name={s.name} date={s.rounds[0]?.date ?? today} onClose={() => setSheet(null)} />}
      {sheet === 'rename' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Rename the series', 'Serie umbenennen')} onClick={(e) => e.stopPropagation()}>
            <div className="field">
              <label htmlFor="series-rename">{tr('Name of the series', 'Name der Serie')}</label>
              <input id="series-rename" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!name.trim()}
              onClick={async () => {
                setMsg((await renameSeries(props.code, name.trim())) ? null : NO_NET());
                setSheet(null);
              }}
            >
              {tr('Save', 'Speichern')}
            </button>
          </section>
        </div>
      )}
      {sheet === 'dissolve' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Undo the series', 'Serie auflösen')} onClick={(e) => e.stopPropagation()}>
            <strong>{tr(`Undo "${s.name}"?`, `„${s.name}“ auflösen?`)}</strong>
            <span className="muted">{tr('Its rounds stay as single tournaments – with their players and scores.', 'Ihre Runden bleiben als einzelne Turniere – mit Spielern und Scores.')}</span>
            <button
              type="button"
              className="btn-primary btn-danger-fill"
              onClick={async () => {
                if (await dissolveSeries(props.code)) props.onBack();
                else setMsg(NO_NET());
                setSheet(null);
              }}
            >
              {tr('Undo the series', 'Serie auflösen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSheet(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

// ---------- one tournament ----------

export function TourScreen(props: { code: string; onBack: () => void; onEdit: (d: TourDraft) => void; onOpenSeries?: (code: string) => void }) {
  const entry = useTours().find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | 'invite' | 'delete'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState<RoundEvent | null>(null);
  const [fix, setFix] = useState<Special | null>(null);
  const today = dayOf(new Date());
  // the tournament with its flights as they are on the server (each flight has its own row) – and on its day and
  // after, every 30 s for the leaderboard
  const started = !!entry && entry.ev.date <= today;
  useEffect(() => {
    let alive = true;
    const tick = () =>
      void refreshEvent(props.code).then((ev) => {
        if (!alive || !ev) return;
        setLive(ev);
        if (isPlanned(ev)) keepTour(props.code, ev);
      });
    if (!entry) void syncTours();
    tick();
    const t = started ? window.setInterval(tick, 30000) : 0;
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [props.code, started]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!entry) {
    return (
      <main className="screen">
        <TopBar title={tr('Tournament', 'Turnier')} onBack={props.onBack} backLabel={tr('Tournaments', 'Turniere')} />
        <p className="muted">{tr('Loading the tournament …', 'Lade das Turnier …')}</p>
      </main>
    );
  }
  const ev = entry.ev;
  const host = isTourHost(entry);
  const fmt = ev.format ?? { mode: 'single', scoring: 'net' as Scoring, allowance: 95 };
  if (ev.deletedAt) {
    return (
      <main className="screen">
        <TopBar title={ev.name} onBack={props.onBack} backLabel={tr('Tournaments', 'Turniere')} />
        <p className="muted">{tr('This tournament was deleted.', 'Dieses Turnier wurde gelöscht.')}</p>
        {host ? (
          <button type="button" className="btn-secondary" onClick={async () => setMsg((await changeTour(props.code, { ...ev, deletedAt: null })) ? null : NO_NET())}>
            {tr('Restore', 'Wiederherstellen')}
          </button>
        ) : (
          <p className="muted small">{tr('Whoever set it up can restore it.', 'Wer es angelegt hat, kann es wiederherstellen.')}</p>
        )}
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
      </main>
    );
  }
  // the leaderboard once a score is in – before, its rows would be dashes only
  const standings = live && started ? eventStandings(live) : null;
  const board = standings?.rows.some((r) => r.thru > 0) ? standings : null;
  return (
    <main className="screen tour-screen">
      <TopBar
        title={ev.name}
        onBack={props.onBack}
        backLabel={tr('Tournaments', 'Turniere')}
        right={
          host ? (
            <button type="button" className="icon-btn" aria-label={tr('Change the tournament', 'Turnier bearbeiten')} onClick={() => props.onEdit(draftOf(entry))}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <span className="muted small">
        {longDate(ev.date)} · {ev.course.name} · {tourScoring(fmt.scoring)}
        {ev.classes?.length ? ` · ${tr(`${ev.classes.length + 1} classes`, `${ev.classes.length + 1} Klassen`)}` : ''}
      </span>
      {!host && <span className="muted small">{tr('Only whoever set up the tournament changes it.', 'Nur wer das Turnier angelegt hat, ändert es.')}</span>}
      {ev.series?.code && props.onOpenSeries && (
        <button type="button" className="list-item" onClick={() => props.onOpenSeries!(ev.series!.code)}>
          <span className="grow">
            <span className="title">{ev.series.name}</span>
            <span className="muted small">{tr('Round of the series – the total standing', 'Runde der Serie – zur Gesamtwertung')}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <section className="card tour-howto">
        <span className="eyebrow">{tr('On the day', 'Am Turniertag')}</span>
        <span className="small">
          {tr(
            'Open Rounds – "Tournament · take part" is on its start page. One tap sets up your flight with its players, markers and course.',
            'Rounds öffnen – auf der Startseite steht „Turnier · teilnehmen“. Ein Tipp richtet deinen Flight mit Mitspielern, Zählern und Platz ein.',
          )}
        </span>
      </section>
      {board && board.rows.length > 0 && (
        <section className="card">
          <span className="eyebrow">
            {board.rows.every((r) => r.finished) ? tr('Result', 'Ergebnis') : tr('Live leaderboard', 'Live-Rangliste')} · {tourScoring(fmt.scoring)}
          </span>
          <ul className="game-pays">
            {board.rows.map((r) => (
              <li key={r.key}>
                <span>
                  {r.pos} · {r.name} <span className="muted small">{r.finished ? '' : r.thru ? tr(`· after ${r.thru}`, `· nach ${r.thru}`) : ''}</span>
                </span>
                <strong>{r.value}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(ev.specials ?? []).length > 0 &&
        specialBoard(live ?? ev).map(({ special, rows }) => (
          <section key={special.id} className="card tour-special-board" aria-label={specialName(special.kind)}>
            <span className="eyebrow">
              {specialName(special.kind)} · {tr(`hole ${ev.holes[special.hole]?.label ?? special.hole + 1}`, `Loch ${ev.holes[special.hole]?.label ?? special.hole + 1}`)}
            </span>
            {rows.length ? (
              <ul className="game-pays">
                {rows.map((r, k) => (
                  <li key={`${r.flight}/${r.player}`}>
                    <span>
                      {`${k + 1} · `}
                      {r.name}
                    </span>
                    <strong>{metres(r.m, special.kind)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted small">{started ? tr('No entry yet.', 'Noch kein Eintrag.') : tr('Entered at the hole on the day.', 'Wird am Turniertag am Loch eingetragen.')}</span>
            )}
            {host && started && live && (
              <button type="button" className="link-btn small" onClick={() => setFix(special)}>
                {tr('Correct an entry', 'Eintrag korrigieren')}
              </button>
            )}
          </section>
        ))}
      {fix && live && (
        <SpecialFixSheet
          special={fix}
          ev={live}
          onClose={() => setFix(null)}
          onSave={async (fid, pid, m, fairway) => {
            const r = await setSpecial(props.code, fid, fix.id, pid, m == null ? null : { m, ...(fix.kind === 'longDrive' ? { fairway } : {}), at: new Date().toISOString(), by: 'host' });
            if (r) setLive(r);
            else setMsg(NO_NET());
            setFix(null);
          }}
        />
      )}
      {flightsOf(ev).map((f, k) => (
        <section key={f.id} className="card tour-flight" aria-label={`Flight ${k + 1}`}>
          <div className="tour-flight-head">
            <h2>Flight {k + 1}</h2>
            {teeTimeOf(f) && <strong className="tour-tee">{teeTimeOf(f)}</strong>}
          </div>
          {f.scorer && (
            <span className="small tour-scorer">
              {tr(`${f.players.find((x) => x.id === f.scorer)?.name ?? '?'} keeps the score of all`, `${f.players.find((x) => x.id === f.scorer)?.name ?? '?'} erfasst die Scores für alle`)}
            </span>
          )}
          {f.players.map((p) => {
            const marker = f.players.find((x) => x.id === markerOf(f, p.id));
            return (
              <div key={p.id} className="tour-flight-player">
                <span className="grow">
                  <strong>{p.name}</strong>
                  {marker && <span className="muted small"> · {tr(`marked by ${marker.name}`, `Zähler: ${marker.name}`)}</span>}
                </span>
                <span className="muted small">{p.playingHandicap == null ? '' : tr(`PH ${p.playingHandicap}`, `SV ${p.playingHandicap}`)}</span>
              </div>
            );
          })}
        </section>
      ))}
      {host && (
        <button type="button" className="btn-secondary" onClick={() => setSheet('invite')}>
          {tr(`Invite players · code ${props.code}`, `Mitspieler einladen · Code ${props.code}`)}
        </button>
      )}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {host && (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setSheet('delete')}>
          {tr('Delete the tournament', 'Turnier löschen')}
        </button>
      )}
      {sheet === 'invite' && <TourInviteSheet code={props.code} name={ev.name} date={ev.date} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Delete the tournament', 'Turnier löschen')} onClick={(e) => e.stopPropagation()}>
            <strong>{tr(`Delete "${ev.name}" – for everyone?`, `„${ev.name}“ löschen – für alle?`)}</strong>
            <span className="muted">{tr('It is only marked deleted: the bin of "Tournaments" brings it back.', 'Es wird nur als gelöscht markiert: Der Papierkorb unter „Turniere“ holt es zurück.')}</span>
            <button
              type="button"
              className="btn-primary btn-danger-fill"
              onClick={async () => {
                if (await changeTour(props.code, { ...ev, deletedAt: new Date().toISOString() })) props.onBack();
                else setMsg(NO_NET());
                setSheet(null);
              }}
            >
              {tr('Delete for everyone', 'Für alle löschen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSheet(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function TourInviteSheet(props: { code: string; name: string; date: string; onClose: () => void }) {
  const url = roundJoinLink(props.code);
  // the text and the link apart, no title – as the invitations of a round and of a pool (Sascha 02.11.2026: WhatsApp
  // did not take the tournament's: the link inside the text, with a title)
  const text = tr(`Tournament "${props.name}" on ${longDate(props.date)} in GolfOS – join with code ${props.code}`, `Turnier „${props.name}“ am ${longDate(props.date)} in GolfOS – mit Code ${props.code} beitreten`);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={tr('Invite players', 'Mitspieler einladen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Invite players', 'Mitspieler einladen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">{tr('With the link or the code everyone sees the tournament in Rounds and takes part on its day.', 'Mit dem Link oder dem Code sieht jeder das Turnier in Rounds und nimmt am Turniertag teil.')}</span>
        <div className="qr-box">
          <Qr text={url} />
        </div>
        <strong className="join-code">{props.code}</strong>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ text, url });
              else {
                await navigator.clipboard.writeText(`${text}: ${url}`);
                setDone(tr('Copied', 'Kopiert'));
              }
            } catch {
              /* the sheet closed without sharing */
            }
          }}
        >
          {tr('Send the invitation', 'Einladung senden')}
        </button>
        {done && <span className="small good-text">{done}</span>}
      </section>
    </div>
  );
}
