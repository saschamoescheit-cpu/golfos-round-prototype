import { useEffect, useState, type ReactNode } from 'react';
import { seriesStandings } from '../lib/seriesstandings';
import { KeyHint } from '../components/KeyHint';
import { StepPick } from '../components/Settings';
import { useTop } from '../components/useTop';
import { tr } from '../lib/i18n';
import { type Scoring } from '../lib/games';
import { CLASS_NAMES, boardLive, cachedEvent, liveFrom, netClasses, eventCard, eventStandings, liveFlights, markerOf, refreshEvent,reopenFlight, roundJoinLink, setSpecial, writeScores, type Flight, type RoundEvent } from '../lib/sharedround';
import { adoptIntoSeries, changeTour, createSeries, dissolveSeries, forgetTour, isPlanned, isSeriesHost, isTourHost, keepTour, loadSeries, loadTours, renameSeries, syncTours, tourState, type PlannedEvent, type SeriesEntry, type TourEntry } from '../lib/tourstore';
import { dayOf } from '../lib/wagers';
import { metres, specialBoard, specialName, type Special } from '../lib/specials';
import { TopBar } from '../components/ui';
import { ScoreTable } from '../components/ScoreTable';
import type { Round } from '../types';
import { madeCut } from '../lib/tourdraw';
import { dealRound, draftOf, draftOfMulti, tourFormat, type TourDraft } from './TourPlan';
import { copyLink, FriendInvite, InviteCard, shareLink } from '../components/InviteCard';
import { ActionBar } from '../components/ActionBar';
import { LiveShare } from '../components/LiveShare';
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

/** A series: tournaments stacked – the cup with two behind it (Sascha 03.11.2026: "icons would be good"). */
export const SERIES_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5h8v4a4 4 0 0 1-8 0z" />
    <path d="M13 13v3M10 20h6M10.5 16h5v4h-5z" />
    <path d="M5.5 8.5v1.5a3.5 3.5 0 0 0 2.2 3.2M3 11.5v.5a3 3 0 0 0 2 2.8" />
  </svg>
);
/** "Zu einer Turnierserie zusammenfassen": the stack with a plus. */
const SERIES_ADD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="13" height="13" rx="2.5" />
    <path d="M7 3.5h10.5A3 3 0 0 1 20.5 6.5V17" />
    <path d="M9.5 10.5v6M6.5 13.5h6" />
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
/** the flights by their tee time (Sascha 08.11.2026: "Flight 1 at 11:48, Flight 2 at 11:40 makes no sense") – the earliest
 *  is flight 1, tee 1 before tee 10 at the same time; without times as they were planned */
const byTee = (a: Flight, b: Flight): number => {
  const ta = (a as { teeTime?: string }).teeTime || '99:99';
  const tb = (b as { teeTime?: string }).teeTime || '99:99';
  return ta !== tb ? ta.localeCompare(tb) : (a.startHole ?? 0) - (b.startHole ?? 0);
};
const flightsOf = (ev: RoundEvent) => Object.values(ev.flights).filter((f) => f.players.length).sort(byTee);
const teeTimeOf = (f: unknown): string => ((f as { teeTime?: string }).teeTime ?? '');

// ---------- the start page and the menu ----------

/** On "Play": plan a tournament – following them is in the menu "Tournaments" (its dot shows those to come). */
export function TourStartCard(props: { canShare: boolean; onNew: () => void; onJoin: () => void }) {
  useEffect(() => {
    void syncTours();
  }, []);
  return (
    <section className="card play-card" aria-label={tr('Plan a tournament', 'Turnier planen')}>
      <strong className="play-course">{tr('Plan a new tournament', 'Neues Turnier planen')}</strong>
      {props.canShare ? (
        // as a new game and a new bet (Sascha 02.11.2026): green, and "join" below
        <>
          <button type="button" className="btn-primary" onClick={props.onNew}>
            {tr('New tournament', 'Neues Turnier')}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onJoin}>
            {tr('Join a tournament', 'Turnier beitreten')}
          </button>
        </>
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
          {series.multi ? tr(`${series.rounds.length} rounds`, `${series.rounds.length} Runden`) : tr('Series', 'Serie')} · {first && last ? `${dm(first)}–${dm(last)}` : ''} · {[...new Set(series.rounds.map((r) => r.course.name))].join(', ')}
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
          <input id="series-name" className="input" required placeholder={tr('Enter a name', 'Name eingeben')} value={name} onChange={(e) => setName(e.target.value)} />
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

export function ToursTab(props: { onOpen: (code: string) => void; onOpenSeries: (code: string) => void; /** "Neues Turnier" right from the empty list */ onNew?: () => void }) {
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
  const shownCodes = new Set(shown.map((e) => e.code));
  const shownAll = filter ? series.filter((s) => s.series.rounds.some((r) => shownCodes.has(r.code))) : series;
  // a tournament over several rounds is a tournament (Sascha 04.11.2026) – with the single ones, not the series
  const shownSeries = shownAll.filter((x) => !x.series.multi);
  const shownMulti = shownAll.filter((x) => x.series.multi);
  const shownSingle = shown.filter(single);
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
      {/* the series and the single tournaments each a category of its own, with its icon (Sascha 03.11.2026: "at a
          glance clearer") – with a tile's filter too: its series (one of their rounds in it) and its single ones
          (Sascha 03.11.2026: "after a tile the overview did not come back") */}
      {filter !== 'bin' && shownSeries.length > 0 && (
        <section className="tour-cat" aria-label={tr('Tournament series', 'Turnierserien')}>
          <span className="eyebrow tour-cat-head">
            {SERIES_ICON}
            {tr('Tournament series', 'Turnierserien')}
          </span>
          <ul className="list">
            {shownSeries.map((s) => (
              <li key={s.code}>
                <SeriesRow s={s} onOpen={() => props.onOpenSeries(s.code)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {filter !== 'bin' &&
        (shownSingle.length || shownMulti.length || (!filter && groupable.length >= 2) ? (
          <section className="tour-cat" aria-label={tr('Single tournaments', 'Einzelne Turniere')}>
          {(shownSeries.length > 0 || groupable.length >= 2) && (
            <span className="eyebrow tour-cat-head">
              {TOURS_ICON}
              {tr('Single tournaments', 'Einzelne Turniere')}
            </span>
          )}
          <ul className="list">
            {shownMulti.map((x) => (
              <li key={x.code}>
                <SeriesRow s={x} onOpen={() => props.onOpenSeries(x.code)} />
              </li>
            ))}
            {shownSingle
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
          {/* "Turnierserie erstellen" below the single ones, a button over the full width (Sascha 03.11.2026: design B) */}
          {!filter && groupable.length >= 2 && (
            <button type="button" className="btn-secondary tour-make-series" onClick={() => setMaking(true)}>
              {SERIES_ADD_ICON}
              {tr('Create a tournament series', 'Turnierserie erstellen')}
            </button>
          )}
          </section>
        ) : (
          <>
            {props.onNew && (
              <button type="button" className="btn-secondary" onClick={props.onNew}>
                {tr('New tournament', 'Neues Turnier')}
              </button>
            )}
          </>
        ))}
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
        <ActionBar label={tr('This entry', 'Dieser Eintrag')} actions={[{ label: tr('Take the entry away', 'Eintrag entfernen'), icon: 'delete', danger: true, disabled: !one, onClick: () => one && props.onSave(one.fid, one.pid, null, fairway) }]} />
        <button type="button" className="btn-primary" disabled={!one || !(value > 0)} onClick={() => one && props.onSave(one.fid, one.pid, value, fairway)}>
          {tr('Save', 'Speichern')}
        </button>
      </section>
    </div>
  );
}

/** A flight's scores entered afterwards by the host (Sascha 08.11.2026: "we also need to enter yesterday's scores
 *  afterwards"): its players one at a time, every hole a box with its par – the strokes typed, the total below. Saved,
 *  they are the card on every phone, in the leaderboard, the series and the bets. */
function ScoresSheet(props: { ev: RoundEvent; flight: Flight; n: number; onSave: (typed: Record<string, (number | null)[]>) => Promise<boolean>; onClose: () => void }) {
  const { ev, flight } = props;
  const [typed, setTyped] = useState<Record<string, (number | null)[]>>(() => Object.fromEntries(flight.players.map((p) => [p.id, ev.holes.map((_, i) => flight.scores[p.id]?.[i]?.s ?? null)])));
  const [who, setWho] = useState(flight.players[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const row = typed[who] ?? [];
  const set = (i: number, v: string) => {
    const n = v.trim() === '' ? null : Math.round(Number(v.replace(',', '.')));
    setTyped((t) => ({ ...t, [who]: (t[who] ?? []).map((x, k) => (k === i ? (n != null && n >= 1 && n <= 20 ? n : null) : x)) }));
  };
  const total = row.reduce<number>((s, v) => s + (v ?? 0), 0);
  const filled = row.filter((v) => v != null).length;
  const par = ev.holes.reduce<number>((s, h, i) => s + (row[i] != null ? (h.par ?? 0) : 0), 0);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet tour-scores-sheet" role="dialog" aria-label={tr(`Scores of flight ${props.n}`, `Scores von Flight ${props.n}`)} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr(`Scores · flight ${props.n}`, `Scores · Flight ${props.n}`)}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="chip-set" role="group" aria-label={tr('Player', 'Spieler')}>
          {flight.players.map((p) => {
            const n = (typed[p.id] ?? []).filter((v) => v != null).length;
            return (
              <button key={p.id} type="button" className={`chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id} onClick={() => setWho(p.id)}>
                {p.name} · {n}/{ev.holes.length}
              </button>
            );
          })}
        </div>
        <div className="tour-scores-grid">
          {ev.holes.map((h, i) => (
            <label key={i} className="tour-score-box">
              <span className="small">
                <strong>{h.label}</strong> <span className="muted">Par {h.par ?? '–'}</span>
              </span>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={tr(`Hole ${h.label}`, `Loch ${h.label}`)}
                value={row[i] ?? ''}
                onChange={(e) => set(i, e.target.value)}
              />
            </label>
          ))}
        </div>
        <span className="muted small">
          {filled
            ? tr(`${filled} of ${ev.holes.length} holes · ${total} strokes · ${total - par === 0 ? 'level' : total - par > 0 ? `+${total - par}` : total - par} to par`, `${filled} von ${ev.holes.length} Löchern · ${total} Schläge · ${total - par === 0 ? 'Par' : total - par > 0 ? `+${total - par}` : `−${par - total}`}`)
            : tr('No hole yet.', 'Noch kein Loch.')}
        </span>
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await props.onSave(typed);
            setBusy(false);
            if (ok) props.onClose();
            else setMsg(NO_NET());
          }}
        >
          {busy ? tr('Saving …', 'Speichere …') : tr('Save the scores', 'Scores speichern')}
        </button>
      </section>
    </div>
  );
}

/** The live leaderboard of a tournament and of a series (Sascha 03.11.2026: "a live leaderboard for single tournaments
 *  and for series"): always there – before the start every player with "–", while played "● LIVE", "nach 9", "F". */
type BoardRow = { key: string; pos: string; name: string; sub?: string; value: string; thru: string; /** his scorecards – one: the row opens it; several (the rounds): a chip each */ cards?: { label: string; card: () => Round | null }[]; /** the cards as chips even when one (a series: "R1 +3") */ chips?: boolean; out?: boolean };
export function LiveBoard(props: { label: string; title: string; live: boolean; rows: BoardRow[]; note?: string; chips?: ReactNode; cutAfter?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen(open === id ? null : id);
  return (
    <section className="card tour-live" aria-label={props.label}>
      <div className="tour-live-head">
        <span className="eyebrow">{props.title}</span>
        {props.live && (
          <span className="tour-live-badge">
            <i aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>
      {props.chips}
      <ol className="lb-rows tour-lb">
        {props.rows.map((r, i) => {
          const one = r.cards?.length === 1 && !r.chips;
          const shown = r.cards?.findIndex((_, k) => open === `${r.key}:${k}`) ?? -1;
          const card = shown >= 0 ? r.cards![shown].card() : null;
          return (
            <li key={r.key} className={`${one ? 'lb-tap' : ''}${r.out ? ' lb-out' : ''}${r.out && !props.rows[i - 1]?.out ? ' lb-cut' : ''}`} onClick={one ? () => toggle(`${r.key}:0`) : undefined} aria-expanded={one ? shown === 0 : undefined}>
              <span className="lb-rank">{r.pos}</span>
              <span className="lb-name">
                {r.name}
                {r.sub && <span className="muted small tour-lb-sub">{r.sub}</span>}
                {r.cards && !one && r.cards.length > 0 && (
                  <span className="chip-set lb-parts">
                    {r.cards.map((c, k) => (
                      <button key={k} type="button" className={`chip${shown === k ? ' on' : ''}`} aria-pressed={shown === k} aria-label={tr(`${r.name} – scorecard ${c.label}`, `${r.name} – Scorekarte ${c.label}`)} onClick={() => toggle(`${r.key}:${k}`)}>
                        {c.label}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <span className="lb-value">{r.value}</span>
              <span className="lb-thru muted small">{r.thru}</span>
              {card && (
                <div className="lb-card" onClick={(e) => e.stopPropagation()}>
                  <ScoreTable round={card} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {props.cutAfter != null && props.rows.some((r) => r.out) && <span className="muted small">{tr(`Below the line: missed the cut after round ${props.cutAfter}.`, `Unter der Linie: Cut nach Runde ${props.cutAfter} verpasst.`)}</span>}
      {props.note && <span className="muted small">{props.note}</span>}
    </section>
  );
}
/** A series' total built like the tour's leaderboard (Sascha 12.11.2026: "with several rounds and the chips it gets
 *  confusing" – the PGA app's build, in GolfOS' look): one line a player – place, name, total, the hole he is on in
 *  the round played now ("F" once in), that round's score. Tapped: a sheet with his total and each round's scorecard,
 *  the rounds as one switch (as the bets' standing). */
export type SeriesBoardRow = { key: string; pos: string; name: string; total: string; out?: boolean; parts: { k: number; text: string; thru: number; finished: boolean; card: () => Round | null }[] };
export function SeriesBoard(props: { label: string; title: string; live: boolean; rounds: { date: string; name?: string }[]; rows: SeriesBoardRow[]; note?: string; cutAfter?: number }) {
  const [who, setWho] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  // the round played now – else the last one played
  const cur = props.rows.reduce((m, r) => r.parts.reduce((n, p) => Math.max(n, p.k), m), -1);
  const row = props.rows.find((r) => r.key === who) ?? null;
  const partNow = (r: SeriesBoardRow) => r.parts.find((p) => p.k === cur);
  const thru = (r: SeriesBoardRow) => {
    const p = partNow(r);
    return !p ? '–' : p.finished ? 'F' : String(p.thru);
  };
  const shown = row ? (row.parts.find((p) => p.k === pick) ?? row.parts[row.parts.length - 1]) : undefined;
  const card = shown ? shown.card() : null;
  return (
    <section className="card tour-live" aria-label={props.label}>
      <div className="tour-live-head">
        <span className="eyebrow">{props.title}</span>
        {props.live && (
          <span className="tour-live-badge">
            <i aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>
      <div className="series-lb-head" aria-hidden="true">
        <span>{tr('Pos', 'Pl.')}</span>
        <span>{tr('Player', 'Spieler')}</span>
        <span>{tr('Total', 'Ges.')}</span>
        <span>{tr('Thru', 'Loch')}</span>
        <span>{cur >= 0 ? `R${cur + 1}` : ''}</span>
      </div>
      <ol className="lb-rows series-lb">
        {props.rows.map((r, i) => (
          <li key={r.key} className={`${r.out ? 'lb-out' : ''}${r.out && !props.rows[i - 1]?.out ? ' lb-cut' : ''}`}>
            <button
              type="button"
              className="series-lb-row"
              disabled={!r.parts.length}
              aria-label={tr(`${r.name} – total ${r.total}, his rounds`, `${r.name} – gesamt ${r.total}, seine Runden`)}
              onClick={() => {
                setPick(null);
                setWho(r.key);
              }}
            >
              <span className="lb-rank">{r.pos}</span>
              <span className="lb-name">{r.name}</span>
              <span className="lb-value">{r.total}</span>
              <span className="series-lb-thru">{thru(r)}</span>
              <span className="series-lb-now">{partNow(r)?.text ?? '–'}</span>
            </button>
          </li>
        ))}
      </ol>
      {props.cutAfter != null && props.rows.some((r) => r.out) && <span className="muted small">{tr(`Below the line: missed the cut after round ${props.cutAfter}.`, `Unter der Linie: Cut nach Runde ${props.cutAfter} verpasst.`)}</span>}
      {props.note && <span className="muted small">{props.note}</span>}
      {row && shown && (
        <div className="sheet-backdrop" onClick={() => setWho(null)}>
          <section className="sheet series-player-sheet" role="dialog" aria-label={row.name} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{row.name}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setWho(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="series-player-facts">
              <span>
                <span className="muted small">{tr('Place', 'Platz')}</span>
                <strong>{row.pos}</strong>
              </span>
              <span>
                <span className="muted small">{tr('Total', 'Gesamt')}</span>
                <strong>{row.total}</strong>
              </span>
              {partNow(row) && (
                <span>
                  <span className="muted small">{`R${cur + 1}`}</span>
                  <strong>{partNow(row)!.text}</strong>
                </span>
              )}
            </div>
            <StepPick<number>
              label={tr('Round', 'Runde')}
              value={shown.k}
              onChange={setPick}
              options={row.parts.map((p) => ({
                value: p.k,
                name: `${tr(`Round ${p.k + 1}`, `Runde ${p.k + 1}`)} · ${p.text}${p.finished ? '' : tr(` · thru ${p.thru}`, ` · nach ${p.thru}`)}`,
                text: [dm(props.rounds[p.k]?.date ?? ''), props.rounds[p.k]?.name].filter(Boolean).join(' '),
              }))}
            />
            {card ? <ScoreTable round={card} /> : <span className="muted small">{tr('No scorecard for this round.', 'Keine Scorekarte zu dieser Runde.')}</span>}
          </section>
        </div>
      )}
    </section>
  );
}
/** A round played out: everyone in it through the last hole. */
const roundDone = (e: RoundEvent) => {
  const st = eventStandings(e);
  return st.rows.length > 0 && st.rows.every((r) => r.finished);
};
/** A player's card in a round's event, by his name. */
const cardByName = (e: RoundEvent | null | undefined, name: string): Round | null => {
  if (!e) return null;
  const row = eventStandings(e).rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
  return row ? eventCard(e, row.key) : null;
};
const clock = (d: Date) => d.toLocaleTimeString(tr('en-GB', 'de-DE'), { hour: '2-digit', minute: '2-digit' });

// ---------- a tournament series ----------

// the total of a series lives in lib/seriesstandings (the result's push needs it too – 07.11.2026)
export { seriesStandings, type SeriesPart } from '../lib/seriesstandings';

/** The line under a leaderboard: live now – when it was read; else when the next round goes live (30 minutes before its
 *  first tee time); nothing once all is played. */
export function liveNote(evs: RoundEvent[], at: Date | null, now: Date = new Date()): string | undefined {
  if (evs.some((e) => boardLive(e, now))) return at ? tr(`Updated ${clock(at)} – every 30 seconds.`, `Aktualisiert ${clock(at)} – alle 30 Sekunden.`) : tr('Live – every 30 seconds.', 'Live – alle 30 Sekunden.');
  const next = evs
    .map((e) => liveFrom(e))
    .filter((d): d is Date => !!d && d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!next) return undefined;
  const day = dayOf(next) === dayOf(now) ? tr('today', 'heute') : longDate(dayOf(next));
  if (next.getHours() === 0 && next.getMinutes() === 0) return tr(`Live from ${day} – then every 30 seconds.`, `Live ab ${day} – dann alle 30 Sekunden.`);
  return tr(`Live from ${day}, ${clock(next)} – 30 minutes before the first tee time, then every 30 seconds.`, `Live ab ${day}, ${clock(next)} – 30 Min. vor der ersten Startzeit, dann alle 30 Sekunden.`);
}

/** A series' rounds as this phone has kept them,without the server: a round from its day on its last read copy (with
 *  the scores), a round to come – or one never read – its plan. */
export function keptRounds(code: string, today: string = dayOf(new Date())): RoundEvent[] {
  const entry = loadSeries().find((e) => e.code === code);
  if (!entry) return [];
  const tours = loadTours();
  return entry.series.rounds
    .map((r) => {
      const plan = tours.find((t) => t.code === r.code)?.ev ?? null;
      const read = r.date <= today ? cachedEvent(r.code) : null;
      return read ?? plan;
    })
    .filter((e): e is RoundEvent => !!e);
}

export function SeriesScreen(props: { code: string; onBack: () => void; /** where "Zurück" goes, when not the list */ backLabel?: string; onOpen: (code: string) => void; onAddRound: (d: TourDraft) => void; /** a tournament over several rounds changed as a whole */ onEdit: (d: TourDraft) => void }) {
  useTop(props.code);
  const allSeries = useSeries();
  const entry = allSeries.find((e) => e.code === props.code);
  const tours = useTours();
  // what this phone has kept, at once (Sascha 09.11.2026: "back from a round of the series the leaderboard takes a
  // moment – it should show at once"): a round already on its day its last read copy, a round to come its plan
  const [evs, setEvs] = useState<RoundEvent[]>(() => keptRounds(props.code));
  const [sheet, setSheet] = useState<null | 'invite' | 'rename' | 'dissolve' | 'adopt'>(null);
  const [dealing, setDealing] = useState<number | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const today = dayOf(new Date());
  const codes = entry?.series.rounds.map((r) => r.code).join() ?? '';
  useEffect(() => {
    void syncTours();
  }, []);
  // the rounds as the server has them – read once on opening (behind what is shown already), then every 30 s only while
  // a round is live: from 30 minutes before its first tee time until its flights are in (Sascha 09.11.2026)
  useEffect(() => {
    if (!codes) return;
    let alive = true;
    let last: RoundEvent[] = [];
    const read = () =>
      void Promise.all(codes.split(',').map((c) => refreshEvent(c))).then((xs) => {
        if (!alive) return;
        const got = xs.filter((x): x is RoundEvent => !!x);
        if (!got.length) return; // offline: what is kept stays
        last = got;
        setEvs((was) => [...got, ...was.filter((w) => !got.some((g) => g.id === w.id))]);
        setAt(new Date());
      });
    read();
    const tick = () => {
      if (last.some((e) => boardLive(e))) read();
    };
    const t = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [codes]);
  if (!entry) {
    return (
      <main className="screen">
        <TopBar title={tr('Series', 'Serie')} onBack={props.onBack} backLabel={props.backLabel ?? tr('Tournaments', 'Turniere')} />
        <p className="muted">{tr('Loading the series …', 'Lade die Serie …')}</p>
      </main>
    );
  }
  const s = entry.series;
  const host = isSeriesHost(entry);
  const multi = !!s.multi;
  const cut = s.multi?.cut ?? null;
  // the rounds' events in the series' order (the server's, else as kept here)
  const roundEvs = s.rounds.map((r) => evs.find((e) => tours.find((t) => t.code === r.code)?.ev.id === e.id) ?? tours.find((t) => t.code === r.code)?.ev ?? null);
  const total = seriesStandings(evs.filter((e) => (e as PlannedEvent).date <= today));
  // the cut (Sascha 04.11.2026): once its rounds are played, the best `top` and ties – the others below the line
  const cutPlayed = !!cut && roundEvs.slice(0, cut.after).every((e) => e && roundDone(e));
  const madeIt = cutPlayed ? new Set(madeCut(seriesStandings(roundEvs.slice(0, cut!.after).filter((e): e is RoundEvent => !!e)).rows, cut!.top).map((r) => r.name.trim().toLowerCase())) : null;
  const out = (name: string) => !!madeIt && !madeIt.has(name.trim().toLowerCase());
  // a round dealt by result – the host's tap once the rounds before are played (Sascha 04.11.2026: "the final day by result")
  const toDeal = s.rounds
    .map((r, k) => ({ r, k, e: tours.find((t) => t.code === r.code) }))
    .filter(({ k, e }) => k > 0 && e && ((e.ev.draw?.mode ?? 'manual') === 'result' || (cut && k >= cut.after)));
  const deal = async (k: number) => {
    const e = tours.find((t) => t.code === s.rounds[k].code);
    if (!e) return;
    setDealing(k);
    const before = seriesStandings(roundEvs.slice(0, k).filter((x): x is RoundEvent => !!x));
    const results = Object.fromEntries(before.rows.map((x) => [x.name.trim().toLowerCase(), x.sum]));
    // the round right after the cut: the cut made; one further on: who played the round before
    const prev = roundEvs[k - 1];
    const onlyNames = cut && k > cut.after && prev ? flightsOf(prev).flatMap((fl) => fl.players.map((p) => p.name.trim().toLowerCase())) : undefined;
    const ok = await dealRound(e, results, { higherBetter: before.higherBetter, ...(cut && k === cut.after ? { cutTop: cut.top } : {}), ...(onlyNames ? { onlyNames } : {}) });
    setDealing(null);
    setMsg(ok ? null : NO_NET());
    if (ok) {
      void syncTours();
      const fresh = await refreshEvent(e.code);
      if (fresh) setEvs((xs) => xs.map((x) => (x.id === fresh.id ? fresh : x)));
    }
  };
  // the tournaments that can be taken in: set up on their own (in no live series), not deleted, not in this one
  const inSeries = new Set(allSeries.filter((x) => !x.series.deletedAt).flatMap((x) => x.series.rounds.map((r) => r.code)));
  const adoptable = tours.filter((t) => !t.ev.deletedAt && !inSeries.has(t.code) && !s.rounds.some((r) => r.code === t.code)).sort((a, b) => b.ev.date.localeCompare(a.ev.date));
  const fmtSum = (v: number) => (total.higherBetter ? tr(`${v} pts`, `${v} Pkt.`) : v === 0 ? 'Par' : v > 0 ? `+${v}` : `−${-v}`);
  const lastRound = [...s.rounds].reverse().map((r) => tours.find((t) => t.code === r.code)).find(Boolean);
  return (
    <main className="screen tour-screen">
      <TopBar
        title={s.name}
        onBack={props.onBack}
        backLabel={props.backLabel ?? tr('Tournaments', 'Turniere')}
        right={
          host ? (
            <button
              type="button"
              className="icon-btn edit-btn"
              aria-label={multi ? tr('Change the tournament', 'Turnier bearbeiten') : tr('Rename the series', 'Serie umbenennen')}
              onClick={() => {
                if (multi) {
                  // the rounds with their flights as the server has them now (the copy kept here may be older)
                  const d = draftOfMulti(entry, tours.map((t) => ({ ...t, ev: (evs.find((x) => x.id === t.ev.id && isPlanned(x)) as PlannedEvent | undefined) ?? t.ev })));
                  if (d) props.onEdit(d);
                  return;
                }
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
        {multi ? tr('Tournament', 'Turnier') : tr('Tournament series', 'Turnierserie')} · {s.rounds.length} {tr('rounds', 'Runden')}
        {cut ? ` · ${tr(`cut after round ${cut.after}: the best ${cut.top}`, `Cut nach Runde ${cut.after}: die besten ${cut.top}`)}` : ''}
        {s.rounds.length ? ` · ${dm(s.rounds[0].date)}–${dm(s.rounds[s.rounds.length - 1].date)}` : ''}
      </span>
      {/* the total live (Sascha 03.11.2026): each player, what every round added – a running one "nach 9" */}
      <SeriesBoard
        label={tr('Total standing', 'Gesamtwertung')}
        title={tr('Live leaderboard · all rounds', 'Live-Leaderboard · alle Runden')}
        live={total.rows.some((r) => r.parts.some((p) => !p.finished))}
        rounds={s.rounds.map((r) => ({ date: r.date, name: r.name }))}
        rows={
          total.rows.length
            ? [...total.rows.filter((r) => !out(r.name)), ...total.rows.filter((r) => out(r.name))].map((r) => ({
                key: r.name,
                pos: out(r.name) ? 'CUT' : r.pos,
                name: r.name,
                total: fmtSum(r.sum),
                parts: r.parts.map((p) => ({ k: p.k, text: fmtSum(p.sort), thru: p.thru, finished: p.finished, card: () => cardByName(evs[p.k], r.name) })),
                out: out(r.name),
              }))
            : [...new Set(evs.flatMap((e) => flightsOf(e).flatMap((f) => f.players.map((p) => p.name))))].map((n) => ({ key: n, pos: '–', name: n, total: '–', parts: [] }))
        }
        note={liveNote(evs, at)}
        cutAfter={cutPlayed ? cut!.after : undefined}
      />
      {/* the host deals a round by result once the rounds before are played (Sascha 04.11.2026) */}
      {host &&
        toDeal.map(({ r, k, e }) => {
          const ready = roundEvs.slice(0, k).every((x) => x && roundDone(x));
          const dealt = e!.ev.draw?.dealtAt;
          return (
            <section key={r.code} className="card tour-deal" aria-label={tr(`Flights of round ${k + 1}`, `Flights der Runde ${k + 1}`)}>
              <span className="eyebrow">{tr(`Round ${k + 1} · flights`, `Runde ${k + 1} · Flights`)}</span>
              <span className="small">
                {dealt
                  ? tr(`Dealt by result on ${dm(dealt.slice(0, 10))} – the players see their tee times.`, `Am ${dm(dealt.slice(0, 10))} nach Ergebnis eingeteilt – die Spieler sehen ihre Startzeiten.`)
                  : ready
                    ? tr(`Round ${k} is played: deal the flights now – the worst first, the best in the last flight${cut && k === cut.after ? `, after the cut the best ${cut.top}` : ''}.`, `Runde ${k} ist gespielt: Flights jetzt einteilen – die Schlechtesten zuerst, die Besten im letzten Flight${cut && k === cut.after ? `, nach dem Cut die besten ${cut.top}` : ''}.`)
                    : tr(`Possible once round ${k} is played – until then the flights are provisional.`, `Möglich, sobald Runde ${k} gespielt ist – bis dahin sind die Flights vorläufig.`)}
              </span>
              <button type="button" className={dealt ? 'btn-secondary' : 'btn-primary'} disabled={!ready || dealing != null} onClick={() => void deal(k)}>
                {dealing === k ? tr('Dealing …', 'Teile ein …') : dealt ? tr('Deal again', 'Neu einteilen') : tr('Deal the flights by result', 'Flights nach Ergebnis einteilen')}
              </button>
            </section>
          );
        })}
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
      {host && lastRound && !multi && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            // a new round: the flights, markers and tee times of the last one (Sascha: "taken from round 1, changeable")
            const d = draftOf(lastRound);
            const next = dayOf(new Date(new Date(`${lastRound.ev.date}T12:00:00`).getTime() + 864e5));
            props.onAddRound({ ...d, code: undefined, base: undefined, series: props.code, rounds: d.rounds.map((r) => ({ ...r, code: undefined, base: r.course ? undefined : r.base, date: next })), name: `${s.name} · ${tr(`Round ${s.rounds.length + 1}`, `Runde ${s.rounds.length + 1}`)}` });
          }}
        >
          {tr('+ Round', '+ Runde')}
        </button>
      )}
      {/* a tournament set up on its own – played already too – taken in afterwards (Sascha 08.11.2026: "yesterday's
          Celebration into The Orlando Invitational, with its scores and the leaderboard") */}
      {host && adoptable.length > 0 && (
        <button type="button" className="btn-secondary" onClick={() => setSheet('adopt')}>
          {multi ? tr('Take in a tournament as a round', 'Turnier als Runde aufnehmen') : tr('Take in a tournament', 'Vorhandenes Turnier aufnehmen')}
        </button>
      )}
      {host && <TourInvite code={props.code} name={s.name} date={s.rounds[0]?.date ?? today} />}
      {/* the live leaderboard for people outside (Sascha 08.11.2026) */}
      {host && <LiveShare code={props.code} name={s.name} />}
      {!host && <span className="muted small">{tr('Only whoever set up the series changes it.', 'Nur wer die Serie angelegt hat, ändert sie.')}</span>}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {/* the actions one bar of icons, as everywhere (Sascha 03.11.2026: docs/DESIGN.md) – the red one last */}
      {host && <ActionBar label={multi ? tr('This tournament', 'Dieses Turnier') : tr('This series', 'Diese Serie')} actions={[multi ? { label: tr('Delete the tournament', 'Turnier löschen'), icon: 'delete', danger: true, onClick: () => setSheet('dissolve') } : { label: tr('Undo the series', 'Serie auflösen'), icon: 'dissolve', danger: true, onClick: () => setSheet('dissolve') }]} />}
      {sheet === 'adopt' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet wager-sheet" role="dialog" aria-label={tr('Take in a tournament', 'Turnier aufnehmen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Take in a tournament', 'Turnier aufnehmen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSheet(null)}>
                ✕
              </button>
            </div>
            <ul className="list">
              {adoptable.map((e) => (
                <li key={e.code}>
                  <button
                    type="button"
                    className="list-item"
                    disabled={adopting != null}
                    onClick={async () => {
                      setAdopting(e.code);
                      const ok = await adoptIntoSeries(props.code, e.code);
                      setAdopting(null);
                      if (!ok) return setMsg(NO_NET());
                      setSheet(null);
                      setMsg(null);
                      void syncTours();
                    }}
                  >
                    <span className="round-date">
                      <strong>{dm(e.ev.date)}</strong>
                      <span className="muted small">{e.ev.date < today ? tr('played', 'gespielt') : e.ev.date === today ? tr('today', 'heute') : tr('planned', 'geplant')}</span>
                    </span>
                    <span className="grow">
                      <span className="title">{e.ev.name}</span>
                      <span className="muted small one-line">{e.ev.course.name}</span>
                    </span>
                    <span aria-hidden="true">{adopting === e.code ? '…' : '›'}</span>
                  </button>
                </li>
              ))}
            </ul>
            <span className="muted small">
              {tr(
                'The tournament stays as it is – code, flights, scores. The series counts it in its total by the players’ names; a cut stays after the same round.',
                'Das Turnier bleibt, wie es ist – Code, Flights, Scores. Die Serie zählt es über die Namen der Spieler in die Gesamtwertung; ein Cut bleibt nach derselben Runde.',
              )}
            </span>
            {msg && (
              <span className="small bad-text" role="alert">
                {msg}
              </span>
            )}
          </section>
        </div>
      )}
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
      {/* a tournament over rounds deleted for everyone: its rounds marked deleted (the bin brings them back) */}
      {sheet === 'dissolve' && multi && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Delete the tournament', 'Turnier löschen')} onClick={(e) => e.stopPropagation()}>
            <strong>{tr(`Delete "${s.name}" – for everyone?`, `„${s.name}“ löschen – für alle?`)}</strong>
            <span className="muted">{tr('Its rounds are only marked deleted: the bin of "Tournaments" brings them back.', 'Seine Runden werden nur als gelöscht markiert: Der Papierkorb unter „Turniere“ holt sie zurück.')}</span>
            <button
              type="button"
              className="btn-primary btn-danger-fill"
              onClick={async () => {
                let ok = await dissolveSeries(props.code);
                for (const r of s.rounds) {
                  const e = loadTours().find((t) => t.code === r.code);
                  if (ok && e) ok = await changeTour(r.code, { ...e.ev, deletedAt: new Date().toISOString() });
                }
                setSheet(null);
                if (ok) props.onBack();
                else setMsg(NO_NET());
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
      {sheet === 'dissolve' && !multi && (
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

export function TourScreen(props: { code: string; onBack: () => void; /** where "Zurück" goes, when not the list */ backLabel?: string; onEdit: (d: TourDraft) => void; onOpenSeries?: (code: string) => void }) {
  useTop(props.code);
  const entry = useTours().find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | 'invite' | 'delete'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState<RoundEvent | null>(null);
  const [fix, setFix] = useState<Special | null>(null);
  const [scoring, setScoring] = useState<string | null>(null); // the flight whose scores the host enters
  const [at, setAt] = useState<Date | null>(null);
  // the leaderboard's view: net or gross, all or one class
  const [gross, setGross] = useState(false);
  const [cls, setCls] = useState<string | null>(null);
  const today = dayOf(new Date());
  // the tournament with its flights as they are on the server (each flight has its own row) – and on its day and
  // after, every 30 s for the leaderboard
  const started = !!entry && entry.ev.date <= today;
  useEffect(() => {
    let alive = true;
    let last: RoundEvent | null = cachedEvent(props.code);
    const tick = () =>
      void refreshEvent(props.code).then((ev) => {
        if (!alive || !ev) return;
        last = ev;
        setLive(ev);
        setAt(new Date());
        if (isPlanned(ev)) keepTour(props.code, ev);
        // every flight in – its result to everyone (the phone that ended the last flight may not have told it)
        if (liveFlights(ev).length && liveFlights(ev).every((f) => f.finishedAt)) window.dispatchEvent(new CustomEvent('golfos:event-in', { detail: { code: props.code, ev } }));
      });
    if (!entry) void syncTours();
    // read once on opening, then every 30 s only while live: from 30 minutes before the first tee time until the flights
    // are in (Sascha 09.11.2026)
    tick();
    const t = window.setInterval(() => {
      if (last && boardLive(last)) tick();
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [props.code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!entry) {
    return (
      <main className="screen">
        <TopBar title={tr('Tournament', 'Turnier')} onBack={props.onBack} backLabel={props.backLabel ?? tr('Tournaments', 'Turniere')} />
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
        <TopBar title={ev.name} onBack={props.onBack} backLabel={props.backLabel ?? tr('Tournaments', 'Turniere')} />
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
  // the leaderboard always (Sascha 03.11.2026: "a live leaderboard") – before the first score every player with "–"
  // gross the strokes alone – a gross one planned before 04.11.2026 kept the full handicap
  const standings = eventStandings(live ?? ev, { gross: gross || (ev.format?.scoring ?? 'net') === 'stroke', cls });
  const played = started && standings.rows.some((r) => r.thru > 0);
  const done = played && standings.rows.every((r) => r.finished);
  const net = (ev.format?.scoring ?? 'net') !== 'stroke' && (ev.format?.allowance ?? 100) > 0;
  // changed: the tournament as a whole (a round of a tournament over rounds: all its rounds) – `flights`: opened at the
  // flights, a round over rounds on its own page (Sascha 04.11.2026: "the flights, the scorer, the tee time not to change
  // from here")
  const edit = (flights: boolean) => {
    const m = ev.series?.code ? loadSeries().find((x) => x.code === ev.series!.code && x.series.multi) : undefined;
    const now = live && isPlanned(live) ? { ...entry, ev: live } : entry;
    const multi = m ? draftOfMulti(m, loadTours().map((t) => (t.code === entry.code ? now : t))) : null;
    const d = multi ?? draftOf(now);
    const k = d.rounds.findIndex((r) => r.code === entry.code);
    props.onEdit(flights ? { ...d, focus: 'flights', ...(multi && k >= 0 ? { open: k } : {}) } : d);
  };
  const classes = netClasses(ev).length ? CLASS_NAMES.slice(0, netClasses(ev).length + 1) : [];
  return (
    <main className="screen tour-screen">
      <TopBar
        title={ev.name}
        onBack={props.onBack}
        backLabel={props.backLabel ?? tr('Tournaments', 'Turniere')}
        right={
          host ? (
            <button type="button" className="icon-btn edit-btn" aria-label={tr('Change the tournament', 'Turnier bearbeiten')} onClick={() => edit(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <span className="muted small">
        {longDate(ev.date)} · {ev.course.name} · {tourFormat(fmt)}
        {netClasses(ev).length ? ` · ${tr(`${netClasses(ev).length + 1} classes`, `${netClasses(ev).length + 1} Klassen`)}` : ''}
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
      {/* one of the most important hints: green as "Tipp für die nächste Runde" (Sascha 07.11.2026) */}
      <KeyHint title={tr('On the day', 'Am Turniertag')} className="tour-howto">
        {tr(
          'Open Rounds – "Tournament · take part" is on its start page. One tap sets up your flight with its players, markers and course.',
          'Rounds öffnen – auf der Startseite steht „Turnier · teilnehmen“. Ein Tipp richtet deinen Flight mit Mitspielern, Zählern und Platz ein.',
        )}
      </KeyHint>
      {standings.rows.length > 0 && (
        <LiveBoard
          label={tr('Live leaderboard', 'Live-Leaderboard')}
          title={`${done ? tr('Result', 'Ergebnis') : tr('Live leaderboard', 'Live-Leaderboard')} · ${gross ? tr('Gross', 'Brutto') : tourFormat(fmt)}`}
          live={played && !done}
          chips={
            played && (net || classes.length > 0) ? (
              <div className="chip-set lb-filters">
                {net && (
                  <>
                    <button type="button" className={`chip${!gross ? ' on' : ''}`} aria-pressed={!gross} onClick={() => setGross(false)}>
                      {fmt.scoring === 'stableford' ? 'Stableford' : tr('Net', 'Netto')}
                    </button>
                    <button type="button" className={`chip${gross ? ' on' : ''}`} aria-pressed={gross} onClick={() => setGross(true)}>
                      {tr('Gross', 'Brutto')}
                    </button>
                  </>
                )}
                {classes.length > 0 && (
                  <>
                    <button type="button" className={`chip${cls == null ? ' on' : ''}`} aria-pressed={cls == null} onClick={() => setCls(null)}>
                      {tr('All', 'Alle')}
                    </button>
                    {classes.map((c) => (
                      <button key={c} type="button" className={`chip${cls === c ? ' on' : ''}`} aria-pressed={cls === c} onClick={() => setCls(c)}>
                        {tr(`Class ${c}`, `Klasse ${c}`)}
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : undefined
          }
          rows={standings.rows.map((r) => ({
            key: r.key,
            pos: played ? r.pos : '–',
            name: r.name,
            ...(classes.length && r.cls ? { sub: tr(`Class ${r.cls}`, `Klasse ${r.cls}`) } : {}),
            value: played && r.thru ? r.value : '–',
            thru: r.finished ? 'F' : r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '',
            // tapped: his scorecard opens below (Sascha 04.11.2026)
            ...(played && r.thru ? { cards: [{ label: '', card: () => eventCard(live ?? ev, r.key) }] } : {}),
          }))}
          note={
            !boardLive(live ?? ev) && !played
              ? liveNote([live ?? ev], at)
              : !played
                ? tr('Live as soon as the first score is in.', 'Live, sobald der erste Score eingetragen ist.')
                : !done && at
                  ? tr(`Updated ${clock(at)} – every 30 seconds.`, `Aktualisiert ${clock(at)} – alle 30 Sekunden.`)
                  : undefined
          }
        />
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
      {ev.draw?.mode === 'result' && !ev.draw.dealtAt && (
        <span className="muted small">{tr('The flights are provisional – dealt by result once the rounds before are played (on the page of the tournament).', 'Die Flights sind vorläufig – nach den Vorrunden werden sie nach Ergebnis eingeteilt (auf der Seite des Turniers).')}</span>
      )}
      {flightsOf(ev).map((f, k) => (
        <section key={f.id} className="card tour-flight" aria-label={`Flight ${k + 1}`}>
          <div className="tour-flight-head tour-flight-head3">
            <h2>
              Flight {k + 1}
              {f.startHole ? <span className="muted small">{tr('Tee 10', 'Tee 10')}</span> : null}
            </h2>
            <strong className="tour-tee">{teeTimeOf(f)}</strong>
            <span className="tour-flight-tools">
              {host && (
                <button type="button" className="icon-btn edit-btn flight-edit" aria-label={tr(`Change flight ${k + 1}`, `Flight ${k + 1} ändern`)} onClick={() => edit(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                    <path d="M13.5 6.5l4 4" />
                  </svg>
                </button>
              )}
            </span>
          </div>
          {f.scorer && (
            <span className="small tour-scorer">
              {tr(`${f.players.find((x) => x.id === f.scorer)?.name ?? '?'} keeps the score of all`, `${f.players.find((x) => x.id === f.scorer)?.name ?? '?'} erfasst die Scores für alle`)}
            </span>
          )}
          {f.players.map((p) => {
            const marker = f.scorer ? undefined : f.players.find((x) => x.id === markerOf(f, p.id));
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
          {/* the scores entered afterwards by the host (Sascha 08.11.2026: "yesterday's scores afterwards") – from the day on */}
          {host && started && (
            <button type="button" className="btn-secondary tour-scores-btn" onClick={() => setScoring(f.id)}>
              {tr('Enter scores', 'Scores eintragen')}
            </button>
          )}
          {/* ended by mistake (Sascha 03.11.2026: Cedric could not get in again): the host opens it again, the scores kept */}
          {live?.flights[f.id]?.finishedAt && (
            <div className="tour-flight-done">
              <span className="muted small">{tr('Finished', 'Beendet')}</span>
              {host && (
                <button
                  type="button"
                  className="link-btn small"
                  onClick={async () => {
                    const r = await reopenFlight(props.code, f.id);
                    if (r) setLive(r);
                    setMsg(r ? null : NO_NET());
                  }}
                >
                  {tr('Open the flight again', 'Flight wieder öffnen')}
                </button>
              )}
            </div>
          )}
        </section>
      ))}
      {scoring && (live ?? ev).flights[scoring] && (
        <ScoresSheet
          ev={live ?? ev}
          flight={(live ?? ev).flights[scoring]}
          n={flightsOf(live ?? ev).findIndex((x) => x.id === scoring) + 1}
          onClose={() => setScoring(null)}
          onSave={async (typed) => {
            const r = await writeScores(props.code, scoring, typed);
            if (r) setLive(r);
            return !!r;
          }}
        />
      )}
      {/* a round of a series: the series' invitation and live link – one code, one QR, one switch for all its rounds (Sascha
          09.11.2026: "invited to the series, a round still offers Stefan; live on in the series, off in its rounds") */}
      {host && <TourInvite code={ev.series?.code ?? props.code} name={ev.series?.name ?? ev.name} date={ev.date} />}
      {/* the live leaderboard for people outside (Sascha 08.11.2026) */}
      {host && <LiveShare code={ev.series?.code ?? props.code} name={ev.series?.name ?? ev.name} />}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {host && <ActionBar label={tr('This tournament', 'Dieses Turnier')} actions={[{ label: tr('Delete the tournament', 'Turnier löschen'), icon: 'delete', danger: true, onClick: () => setSheet('delete') }]} />}
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

/** "Mitspieler einladen" of a tournament or a series: a section of its own with the QR code at once – the one look of
 *  every invitation in the app (Sascha 03.11.2026: "the QR code identical everywhere, as under Friends"). */
function TourInvite(props: { code: string; name: string; date: string }) {
  const url = roundJoinLink(props.code);
  // the text and the link apart, no title – as the invitations of a round and of a pool (Sascha 02.11.2026: WhatsApp
  // did not take the tournament's: the link inside the text, with a title)
  const text = tr(`Tournament "${props.name}" on ${longDate(props.date)} in GolfOS – join with code ${props.code}`, `Turnier „${props.name}“ am ${longDate(props.date)} in GolfOS – mit Code ${props.code} beitreten`);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="setup-part" aria-label={tr('Invite players', 'Mitspieler einladen')}>
      <span className="eyebrow">{tr('Invite players', 'Mitspieler einladen')}</span>
      <div className="card invite-card tour-invite">
        <InviteCard
          link={url}
          code={props.code}
          codeClass="join-code"
          codeLabel={tr(`Code ${props.code}`, `Code ${props.code}`)}
          hint={tr('With the link or the code everyone sees the tournament in Rounds and takes part on its day.', 'Mit dem Link oder dem Code sieht jeder das Turnier in Rounds und nimmt am Turniertag teil.')}
          actions={[
            { label: tr('Invite', 'Einladen'), aria: tr('Send the invitation', 'Einladung senden'), icon: 'share', primary: true, onClick: () => void shareLink(text, url).then(setMsg) },
            { label: tr('Copy link', 'Link kopieren'), icon: 'copy', onClick: () => void copyLink(url).then(setMsg) },
          ]}
        />
        {msg && <span className="muted small">{msg}</span>}
        {/* linked friends invited with a tap (Sascha 03.11.2026) – the tournament's or the series' code */}
        <FriendInvite code={props.code} />
      </div>
    </section>
  );
}
