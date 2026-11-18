import { useEffect, useState } from 'react';
import { Block } from './Block';
import { dec, tr } from '../lib/i18n';
import { cachedEvent, eventStandings, liveFlights, type RoundEvent } from '../lib/sharedround';
import { roundOver, seriesOver, seriesStandings } from '../lib/seriesstandings';
import { loadSeries, loadTours } from '../lib/tourstore';
import { loadRounds } from '../lib/storage';
import { keyName, wonBy, type TourPrizes } from '../lib/tourprizes';
import { prizeAmount } from '../lib/prize';
import { seriesPrizeResult } from './SeriesPrizeBoard';
import { tourPrizeResult } from './TourPrizeBoard';
import { goTour } from '../lib/nav';

// "Mein Golf" – the tournaments (Sascha 18.11.2026, Mockup B: "Kacheln + Liste"): the series and single tournaments over
// that this account played in – wins, how many, the average tournament round – and each with its place, as the list
// under "Turniere" (date left, place right). A tap opens its final standing.

export interface MyTour {
  code: string;
  kind: 'series' | 'tour';
  name: string;
  /** its last day */
  day: string;
  rounds: number;
  /** to par (Stableford: points) as its standing adds it */
  sum: number;
  hb: boolean;
  place: string | null;
  of: number;
  guest: boolean;
  /** what it won this player ("100 $") */
  prize?: string;
}

const sumText = (v: number, hb: boolean) => (hb ? tr(`${v} pts`, `${v} P.`) : v === 0 ? 'Par' : v > 0 ? `+${v}` : `−${-v}`);

/** This account's tournaments over – newest first – with the wins, the count and the average of its tournament rounds
 *  (gross to par, 18 holes, every round played out). */
export function myTours(): { list: MyTour[]; wins: number; avg: number | null } {
  const tours = loadTours();
  const rounds = loadRounds();
  const meIn = (codes: Set<string>) => rounds.find((r) => !!r.shared && codes.has(r.shared.code))?.players.find((p) => p.isMe)?.name ?? null;
  const prized = (code: string) => {
    const live = cachedEvent(code);
    return live ? ({ ...live, prizes: tours.find((x) => x.code === code)?.ev.prizes ?? undefined } as RoundEvent & { prizes?: TourPrizes }) : null;
  };
  const list: MyTour[] = [];
  const mine: { ev: RoundEvent; me: string }[] = [];
  const inSeries = new Set<string>();
  for (const sr of loadSeries()) {
    if (sr.series.deletedAt || !sr.series.rounds.length) continue;
    for (const r of sr.series.rounds) inSeries.add(r.code);
    const evs = sr.series.rounds.map((r) => prized(r.code));
    const me = meIn(new Set(sr.series.rounds.map((r) => r.code)));
    if (!me || !seriesOver(evs)) continue;
    const played = evs.filter((e): e is NonNullable<typeof e> => !!e);
    // the standing as the series' board has it – each round by its own scoring (Sascha 18.11.2026: "+44" here, "+39" on
    // the board – this counted every round gross)
    const st = seriesStandings(played, { field: evs });
    const row = st.rows.find((x) => keyName(x.name) === keyName(me));
    if (!row) continue;
    const res = seriesPrizeResult(sr.series, evs);
    const won = res.ref ? wonBy(res.own).get(keyName(me)) : undefined;
    list.push({
      code: sr.code,
      kind: 'series',
      name: sr.series.name,
      day: sr.series.rounds[sr.series.rounds.length - 1].date,
      rounds: row.rounds,
      sum: row.sum,
      hb: st.higherBetter,
      place: row.guest ? null : row.pos.replace(/^T/, ''),
      of: st.rows.filter((x) => !x.guest).length,
      guest: row.guest,
      ...(won && won.amount > 0 && res.ref ? { prize: prizeAmount(won.amount, res.ref) } : {}),
    });
    for (const e of played) mine.push({ ev: e, me });
  }
  for (const t of tours) {
    if (t.ev.deletedAt || t.ev.series?.code || inSeries.has(t.code)) continue;
    const ev = prized(t.code);
    const me = meIn(new Set([t.code]));
    if (!ev || !me || !liveFlights(ev).length || !roundOver(ev)) continue;
    const st = eventStandings(ev);
    const row = st.rows.find((x) => keyName(x.name) === keyName(me));
    if (!row || !row.thru || row.sort == null) continue;
    const res = tourPrizeResult(ev);
    const won = res ? wonBy(res.awards).get(keyName(me)) : undefined;
    list.push({
      code: t.code,
      kind: 'tour',
      name: t.ev.name,
      day: t.ev.date,
      rounds: 1,
      sum: row.sort,
      hb: st.higherBetter,
      place: row.pos.replace(/^T/, ''),
      of: st.rows.filter((x) => x.thru).length,
      guest: false,
      ...(won && won.amount > 0 && res ? { prize: prizeAmount(won.amount, res.tp.prize) } : {}),
    });
    mine.push({ ev, me });
  }
  // the average tournament round: gross to par over the 18-hole rounds played out
  const vals = mine.flatMap(({ ev, me }) => {
    if (ev.holes.length < 18) return [];
    const st = eventStandings(ev, { gross: true });
    const row = st.rows.find((x) => keyName(x.name) === keyName(me));
    return row && row.finished && row.sort != null && !st.higherBetter ? [row.sort] : [];
  });
  list.sort((a, b) => b.day.localeCompare(a.day));
  return { list, wins: list.filter((x) => x.place === '1').length, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null };
}

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** The block "Turniere" on "Mein Golf" – nothing while none is over. */
export function MyTours() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener('golfos:tours-changed', again);
    return () => window.removeEventListener('golfos:tours-changed', again);
  }, []);
  const { list, wins, avg } = myTours();
  if (!list.length) return null;
  return (
    <Block title={tr('Tournaments', 'Turniere')} className="my-tours">
      <div className="tile-row tile-row-3">
        <div className="tile">
          <span className="tile-head">
            <strong className={`tile-num${wins ? ' good-text' : ''}`}>{wins}</strong>
          </span>
          <span className="muted small">{wins === 1 ? tr('win', 'Sieg') : tr('wins', 'Siege')}</span>
        </div>
        <div className="tile">
          <span className="tile-head">
            <strong className="tile-num">{list.length}</strong>
          </span>
          <span className="muted small">{list.length === 1 ? tr('tournament', 'Turnier') : tr('tournaments', 'Turniere')}</span>
        </div>
        <div className="tile">
          <span className="tile-head">
            <strong className="tile-num">{avg == null ? '–' : dec(`${avg > 0 ? '+' : ''}${avg.toFixed(1)}`)}</strong>
          </span>
          <span className="muted small">{tr('Ø tournament round', 'Ø Turnierrunde')}</span>
        </div>
      </div>
      <ul className="list">
        {list.map((x) => (
          <li key={x.code}>
            <button type="button" className="list-item" onClick={() => goTour(x.code)}>
              <span className="round-date">
                <strong>{dm(x.day)}</strong>
                <span className="muted small">{x.day.slice(0, 4)}</span>
              </span>
              <span className="grow">
                <span className="title">{x.name}</span>
                <span className="muted small one-line">
                  {[x.kind === 'series' ? tr(`Series · ${x.rounds} rounds`, `Serie · ${x.rounds} Runden`) : tr('Tournament', 'Turnier'), sumText(x.sum, x.hb)].join(' · ')}
                </span>
              </span>
              {/* the place as the lists' right column has its number: big, what it counts small below (Sascha 18.11.2026:
                  "1. von 6 sieht komisch aus") */}
              <span className="game-row-result">
                <strong className={x.place === '1' ? 'good-text' : undefined}>{x.guest ? tr('Guest', 'Gast') : `${x.place}.`}</strong>
                <span className="muted small">{[x.guest ? null : tr(`of ${x.of}`, `von ${x.of}`), x.prize].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Block>
  );
}
