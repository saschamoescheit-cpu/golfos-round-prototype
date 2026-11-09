import { lazy, Suspense, useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { fetchLive, type LiveView } from '../lib/live';
import { CLASS_NAMES, eventCard, eventStandings, type RoundEvent } from '../lib/sharedround';
import { seriesStandings } from '../lib/seriesstandings';
import { specialName } from '../lib/specials';
import { madeCut } from '../lib/tourdraw';
import { dayOf, withDuels } from '../lib/wagers';
import { leaderText } from '../components/Specials';
import { LiveBoard } from './Tournaments';
import { ScoreGrid, StandingCard } from './Games';
import { Standings } from './Wagers';
import type { HoleScore } from '../components/LiveCourse';

// the course's aerial images only when "Platz" is opened (the map library is large)
const LiveCourse = lazy(() => import('../components/LiveCourse').then((m) => ({ default: m.LiveCourse })));

// The page a spectator opens (Sascha 08.11.2026, USA: "the live leaderboard also for people outside the tournament –
// the same for games and bets"; and: "not only the leaderboard – the scorecards of the rounds when tapping a player, and
// the course played with its holes"): the link #live=… in any browser – no app, no account, nothing to change. Read
// again every 20 seconds while the page is in front; switched off by the players, the link says so. In tabs, as the
// app (no one-pager): the leaderboard, the rounds (a series), the course.

const EVERY = 20000;
const clock = (d: Date) => d.toLocaleTimeString(tr('en-GB', 'de-DE'), { hour: '2-digit', minute: '2-digit' });
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

export function LiveScreen(props: { code: string }) {
  const [view, setView] = useState<LiveView | null | undefined>(undefined);
  const [gone, setGone] = useState(false);
  const [offline, setOffline] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const v = await fetchLive(props.code);
      if (!alive) return;
      if (v === undefined) return setOffline(true); // no connection: the board as last seen, tried again
      setOffline(false);
      setGone(v === null);
      setView(v);
      if (v) setAt(new Date());
    };
    void tick();
    const t = window.setInterval(() => void tick(), EVERY);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [props.code]);
  useEffect(() => {
    const name = view?.kind === 'event' ? view.event.name : view?.kind === 'series' ? view.series.name : view?.kind === 'pool' ? view.pool.name : view?.kind === 'game' ? view.game.courseName : null;
    if (name) document.title = `${name} · Live`;
  }, [view]);
  if (gone) {
    return (
      <main className="screen live-screen">
        <span className="eyebrow">{tr('Live leaderboard', 'Live-Leaderboard')}</span>
        <h1>{tr('Not live', 'Nicht live')}</h1>
        <p className="muted">{tr('This live link was switched off by the players, or the round was deleted.', 'Dieser Live-Link wurde von den Spielern ausgeschaltet, oder die Runde wurde gelöscht.')}</p>
      </main>
    );
  }
  if (!view) {
    return (
      <main className="screen live-screen">
        <span className="eyebrow">{tr('Live leaderboard', 'Live-Leaderboard')}</span>
        <p className="muted">{offline ? tr('No connection – trying again.', 'Keine Verbindung – es wird weiter versucht.') : tr('Loading the leaderboard …', 'Lade das Leaderboard …')}</p>
      </main>
    );
  }
  return (
    <main className="screen live-screen">
      {view.kind === 'event' && <EventLive ev={view.event} />}
      {view.kind === 'series' && <SeriesLive v={view} />}
      {view.kind === 'game' && (
        <>
          <span className="eyebrow">{tr('Live · game', 'Live · Spiel')}</span>
          <h1>{view.game.courseName}</h1>
          <StandingCard game={view.game} final={!!view.game.finishedAt} />
          <ScoreGrid game={view.game} />
        </>
      )}
      {view.kind === 'pool' && (
        <>
          <span className="eyebrow">{tr('Live · bets', 'Live · Wetten')}</span>
          <h1>{view.pool.name}</h1>
          <span className="muted small">
            {dm(view.pool.from)}–{dm(view.pool.to)} · {view.pool.players.map((p) => p.name).join(', ')}
          </span>
          {/* the duels (5+5+10) from the players' cards, as in the app (Sascha 09.11.2026, night run) */}
          <Standings pool={withDuels(view.pool)} today={dayOf(new Date())} me="" noMoney={!view.money} />
        </>
      )}
      <span className="muted small live-note" role="status">
        {offline ? tr('No connection – trying again.', 'Keine Verbindung – es wird weiter versucht.') : at ? tr(`Updated ${clock(at)} – every 20 seconds.`, `Aktualisiert ${clock(at)} – alle 20 Sekunden.`) : ''}
      </span>
    </main>
  );
}

/** The tabs of the page – as in the app (Training, Agility). */
function Tabs<T extends string>(props: { label: string; tabs: { id: T; label: string }[]; tab: T; onTab: (t: T) => void }) {
  return (
    <div className="segmented tr-tabs" role="tablist" aria-label={props.label}>
      {props.tabs.map((x) => (
        <button key={x.id} type="button" role="tab" aria-selected={props.tab === x.id} aria-pressed={props.tab === x.id} onClick={() => props.onTab(x.id)}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** each player's strokes on a hole of the event – for the course's page */
const holeScores = (ev: RoundEvent) => (hole: number): HoleScore[] =>
  Object.values(ev.flights)
    .filter((f) => f.players.length)
    .flatMap((f) => f.players.map((p) => ({ name: p.name, s: f.scores[p.id]?.[hole]?.s ?? null })));

/** The leaderboard of one round (a tournament, or a round of a series): a player tapped – his scorecard below him. */
function EventBoard(props: { ev: RoundEvent; label?: string }) {
  const { ev } = props;
  const [gross, setGross] = useState(false);
  const [cls, setCls] = useState<string | null>(null);
  const b = eventStandings(ev, { gross, cls });
  const net = (ev.format?.allowance ?? 100) > 0 && ev.format?.scoring !== 'stroke';
  const classes = ev.classes?.length ? CLASS_NAMES.slice(0, ev.classes.length + 1) : [];
  const played = b.rows.some((r) => r.thru);
  const done = b.rows.length > 0 && b.rows.every((r) => r.finished);
  return (
    <>
      <LiveBoard
        label={props.label ?? tr('Live leaderboard', 'Live-Leaderboard')}
        title={`${done ? tr('Result', 'Ergebnis') : tr('Live leaderboard', 'Live-Leaderboard')} · ${b.title}`}
        live={played && !done}
        chips={
          net || classes.length ? (
            <div className="chip-set lb-filters">
              {net && (
                <>
                  <button type="button" className={`chip${!gross ? ' on' : ''}`} aria-pressed={!gross} onClick={() => setGross(false)}>
                    {ev.format?.scoring === 'stableford' ? 'Stableford' : tr('Net', 'Netto')}
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
        rows={b.rows.map((r) => ({
          key: r.key,
          pos: played ? r.pos : '–',
          name: r.name,
          ...(classes.length && r.cls ? { sub: tr(`Class ${r.cls}`, `Klasse ${r.cls}`) } : {}),
          value: r.thru ? r.value : '–',
          thru: r.finished ? 'F' : r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '',
          // tapped: his scorecard opens below him (Sascha 08.11.2026 – for spectators too)
          ...(r.thru ? { cards: [{ label: '', card: () => eventCard(ev, r.key) }] } : {}),
        }))}
        note={played ? tr('Tap a player for his scorecard.', 'Spieler antippen für seine Scorekarte.') : tr('Live as soon as the first score is in.', 'Live, sobald der erste Score eingetragen ist.')}
      />
      {(ev.specials?.length ?? 0) > 0 && (
        <section className="card flight-status special-leaders" aria-label={tr('Special prizes', 'Sonderwertungen')}>
          <span className="eyebrow">{tr('Special prizes', 'Sonderwertungen')}</span>
          {ev.specials!.map((s) => (
            <span key={s.id} className="small">
              {specialName(s.kind)} · {tr('hole', 'Loch')} {ev.holes[s.hole]?.label}: <strong>{leaderText(ev, s)}</strong>
            </span>
          ))}
        </section>
      )}
    </>
  );
}

function CoursePart(props: { ev: RoundEvent }) {
  return (
    <Suspense fallback={<span className="muted small">{tr('Loading the course …', 'Lade den Platz …')}</span>}>
      <LiveCourse course={props.ev.course} holes={props.ev.holes} tee={props.ev.tee ?? null} scores={holeScores(props.ev)} />
    </Suspense>
  );
}

function EventLive(props: { ev: RoundEvent }) {
  const { ev } = props;
  const [tab, setTab] = useState<'board' | 'course'>('board');
  return (
    <>
      <span className="eyebrow">{tr('Live · tournament', 'Live · Turnier')}</span>
      <h1>{ev.name}</h1>
      <span className="muted small">
        {ev.date ? `${dm(ev.date)} · ` : ''}
        {ev.course.name}
      </span>
      <Tabs label={ev.name} tab={tab} onTab={setTab} tabs={[{ id: 'board', label: 'Leaderboard' }, { id: 'course', label: tr('Course', 'Platz') }]} />
      {tab === 'board' ? <EventBoard ev={ev} /> : <CoursePart ev={ev} />}
    </>
  );
}

/** A round played out: everyone in it through the last hole. */
const roundDone = (e: RoundEvent) => {
  const st = eventStandings(e);
  return st.rows.length > 0 && st.rows.every((r) => r.finished);
};

function SeriesLive(props: { v: Extract<LiveView, { kind: 'series' }> }) {
  const { series } = props.v;
  const today = dayOf(new Date());
  const [tab, setTab] = useState<'total' | 'round' | 'course'>('total');
  // the rounds' events in the series' order (the server sends them so)
  const evs = series.rounds.map((_, k) => props.v.events[k] ?? null);
  const started = evs.map((e) => !!e && (e.date ?? '') <= today);
  const played = evs.filter((e, k): e is RoundEvent => !!e && started[k]);
  const total = seriesStandings(played);
  // the round being played – else the last one played, else the first
  const liveK = evs.findIndex((e, k) => !!e && started[k] && eventStandings(e).rows.some((r) => r.thru && !r.finished));
  const lastK = started.lastIndexOf(true);
  const [pick, setPick] = useState<number | null>(null);
  const k = pick ?? (liveK >= 0 ? liveK : lastK >= 0 ? lastK : 0);
  const cut = series.multi?.cut ?? null;
  const cutPlayed = !!cut && evs.slice(0, cut.after).every((e) => e && roundDone(e));
  const madeIt = cutPlayed ? new Set(madeCut(seriesStandings(evs.slice(0, cut!.after).filter((e): e is RoundEvent => !!e)).rows, cut!.top).map((r) => r.name.trim().toLowerCase())) : null;
  const out = (name: string) => !!madeIt && !madeIt.has(name.trim().toLowerCase());
  const fmtSum = (v: number) => (total.higherBetter ? tr(`${v} pts`, `${v} Pkt.`) : v === 0 ? 'Par' : v > 0 ? `+${v}` : `−${-v}`);
  const cardByName = (e: RoundEvent | null, name: string) => {
    if (!e) return null;
    const row = eventStandings(e).rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    return row ? eventCard(e, row.key) : null;
  };
  const roundChips = (
    <div className="chip-set live-round-chips" role="group" aria-label={tr('Round', 'Runde')}>
      {series.rounds.map((r, i) => (
        <button key={r.code} type="button" className={`chip${i === k ? ' on' : ''}`} aria-pressed={i === k} onClick={() => setPick(i)}>
          {tr(`R${i + 1}`, `R${i + 1}`)} · {dm(r.date)}
        </button>
      ))}
    </div>
  );
  const ev = evs[k];
  return (
    <>
      <span className="eyebrow">{series.multi ? tr('Live · tournament', 'Live · Turnier') : tr('Live · tournament series', 'Live · Turnierserie')}</span>
      <h1>{series.name}</h1>
      <span className="muted small">
        {series.rounds.length} {tr('rounds', 'Runden')}
        {series.rounds.length ? ` · ${dm(series.rounds[0].date)}–${dm(series.rounds[series.rounds.length - 1].date)}` : ''}
        {cut ? ` · ${tr(`cut after round ${cut.after}: the best ${cut.top}`, `Cut nach Runde ${cut.after}: die besten ${cut.top}`)}` : ''}
      </span>
      <Tabs
        label={series.name}
        tab={tab}
        onTab={setTab}
        tabs={[
          { id: 'total', label: tr('Total', 'Gesamt') },
          { id: 'round', label: tr('Rounds', 'Runden') },
          { id: 'course', label: tr('Course', 'Platz') },
        ]}
      />
      {tab === 'total' && (
        <LiveBoard
          label={tr('Total standing', 'Gesamtwertung')}
          title={tr('Live leaderboard · all rounds', 'Live-Leaderboard · alle Runden')}
          live={total.rows.some((r) => r.parts.some((p) => !p.finished))}
          rows={[...total.rows.filter((r) => !out(r.name)), ...total.rows.filter((r) => out(r.name))].map((r) => {
            const now = r.parts.find((p) => !p.finished);
            return {
              key: r.name,
              pos: out(r.name) ? 'CUT' : r.pos,
              name: r.name,
              value: fmtSum(r.sum),
              thru: now ? tr(`thru ${now.thru}`, `nach ${now.thru}`) : tr(`${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}`, `${r.rounds} ${r.rounds === 1 ? 'Runde' : 'Runden'}`),
              // each round's scorecard as a chip (R1 +3 …)
              cards: r.parts.map((p) => ({ label: `R${p.k + 1} ${fmtSum(p.sort)}${p.finished ? '' : tr(` (thru ${p.thru})`, ` (nach ${p.thru})`)}`, card: () => cardByName(played[p.k] ?? null, r.name) })),
              chips: true,
              out: out(r.name),
            };
          })}
          note={total.rows.length ? tr('Tap a round under a player for his scorecard.', 'Runde unter einem Spieler antippen für seine Scorekarte.') : tr('Starts with the first round.', 'Startet mit der ersten Runde.')}
          cutAfter={cutPlayed ? cut!.after : undefined}
        />
      )}
      {tab === 'round' && (
        <>
          {roundChips}
          {ev && started[k] ? (
            <>
              <span className="muted small">
                {ev.name} · {ev.course.name}
              </span>
              <EventBoard ev={ev} label={tr(`Round ${k + 1}`, `Runde ${k + 1}`)} />
            </>
          ) : (
            <span className="muted small">{tr(`Round ${k + 1} is on ${dm(series.rounds[k]?.date ?? '')}.`, `Runde ${k + 1} ist am ${dm(series.rounds[k]?.date ?? '')}.`)}</span>
          )}
        </>
      )}
      {tab === 'course' && (
        <>
          {roundChips}
          {ev ? (
            <>
              <span className="muted small">{ev.course.name}</span>
              <CoursePart key={k} ev={ev} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
