import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { loadRounds } from '../lib/storage';
import { currencySymbol, formDef, money, standingOf, transfers } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';
import { NEXT_ROUND, loadSideGames, sideGameView, type SideGame } from '../lib/sidegames';
import { duelDetails, flipDetails, fromCards, progressOf, sameName, type DuelPart, type Wager } from '../lib/wagers';
import type { PoolEntry } from '../lib/wagerstore';
import type { Round } from '../types';
import { dayText } from './Settings';
import { StandingCard } from '../screens/Games';

// The side bets under "Wetten" (Sascha 16.11.2026: "Ist es denn ein Game oder eine Wette?" → "Alle in ‚Wetten'"; "bei den
// Sidebets brauchen wir im Nachgang auch die Details je Bet – wer Front, wer Back und wer total gemacht hat, auch mit
// Verrechnung"): every 5+5+10 of this phone's owner – in the trip's pool or in a day's own settlement – and every side game
// of a round (Skins, Nassau, match play, Stableford), newest first; a tap opens its details: front, back and 18 with both
// scores, who won, what it is worth, who pays whom – and on the whole, what is left with each one.

type Duel = { kind: 'duel'; key: string; e: PoolEntry; w: Wager; mine: boolean; other: string; day: string; course: string; sym: string; amount: number | null };
type Side = { kind: 'game'; key: string; s: SideGame; round: Round; me: string | null; day: string; course: string; sym: string; amount: number | null };
export type SideBet = Duel | Side;

/** The side bets of this phone's owner: his 5+5+10 duels (not declined) and the side games of his rounds. */
export function sideBetsOf(pools: PoolEntry[], games: SideGame[] = loadSideGames(), rounds: Round[] = loadRounds()): SideBet[] {
  const duels: Duel[] = pools
    .filter((e) => e.me && !e.pool.deletedAt)
    .flatMap((e) =>
      e.pool.wagers
        .filter((w) => fromCards(w) && w.challenge?.state !== 'declined' && (w.player === e.me || w.opponent === e.me))
        .map((w) => {
          const mine = w.player === e.me;
          const other = e.pool.players.find((p) => p.id === (mine ? w.opponent : w.player))?.name ?? '?';
          const p = w.challenge?.state === 'accepted' ? progressOf(e.pool, w) : undefined;
          const decided = p?.duels?.some((d) => d.front != null || d.back != null || d.total != null);
          const last = p?.duels?.[p.duels.length - 1];
          return {
            kind: 'duel' as const,
            key: `d:${e.code}:${w.id}`,
            e,
            w,
            mine,
            other,
            day: w.day ?? last?.day ?? e.pool.from,
            course: last?.course ?? w.on?.course ?? '',
            sym: prizeSym(prizeOf(e.pool)),
            amount: decided ? (mine ? 1 : -1) * (p?.amount ?? 0) || 0 : null,
          };
        }),
    );
  const sides: Side[] = games
    .filter((s) => s.round !== NEXT_ROUND)
    .flatMap((s) => {
      const round = rounds.find((r) => r.id === s.round);
      if (!round) return [];
      const meName = round.players.find((p) => p.isMe)?.name ?? '';
      const me = s.players.find((p) => sameName(p.name, meName))?.id ?? null;
      const st = standingOf(sideGameView(s, round));
      return [{
        kind: 'game' as const,
        key: `g:${s.id}`,
        s,
        round,
        me,
        day: round.createdAt.slice(0, 10),
        course: round.courseName,
        sym: currencySymbol(s.settings.currency),
        amount: me && st.money ? (st.money[me] ?? 0) : null,
      }];
    });
  return [...duels, ...sides].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

const signed = (v: number, sym: string) => (Math.abs(v) < 0.005 ? '±0' : `${v > 0 ? '+' : '−'}${money(v, sym)}`);
const tone = (v: number | null) => (v == null || Math.abs(v) < 0.005 ? 'muted' : v > 0 ? 'good-text' : 'bad-text');
const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const titleOf = (b: SideBet) => (b.kind === 'duel' ? tr(`5+5+10 against ${b.other}`, `5+5+10 gegen ${b.other}`) : `${formDef(b.s.form).name()} · ${b.s.players.map((p) => p.name).join(', ')}`);

/** "Side-Bets" under "Wetten": what is left with each one over all of them, then each side bet – a tap its details. */
export function SideBetsList(props: { pools: PoolEntry[]; onOpenPool: (code: string) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('golfos:sidegames-changed', on);
    return () => window.removeEventListener('golfos:sidegames-changed', on);
  }, []);
  const [open, setOpen] = useState<string | null>(null);
  const bets = sideBetsOf(props.pools);
  if (!bets.length) return null;
  // no "Unterm Strich" over them (Sascha 18.11.2026: "Side-Bet unterm Strich kann raus") – what is left with each
  // person stands in Bilanz
  const shown = bets.find((b) => b.key === open) ?? null;
  return (
    <section className="setup-part side-bets" aria-label={tr('Side bets', 'Side-Bets')}>
      <span className="eyebrow">{tr('Side bets', 'Side-Bets')}</span>
      <ul className="list">
        {bets.map((b) => (
          <li key={b.key}>
            <button type="button" className="list-item side-bet-row" onClick={() => setOpen(b.key)}>
              <span className="grow">
                <span className="title">{titleOf(b)}</span>
                <span className="muted small one-line">{[b.course, short(b.day), b.kind === 'duel' && !b.e.pool.name.startsWith('5+5+10 · ') ? b.e.pool.name : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`side-bet-amount ${tone(b.amount)}`}>{b.amount == null ? (b.kind === 'duel' && b.w.challenge?.state === 'open' ? tr('open', 'offen') : '–') : signed(b.amount, b.sym)}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {shown && <SideBetSheet bet={shown} onClose={() => setOpen(null)} onOpenPool={props.onOpenPool} />}
    </section>
  );
}

const PART_NAME: Record<DuelPart['part'], () => string> = {
  front: () => tr('Front 9', 'Vorne (9)'),
  back: () => tr('Back 9', 'Hinten (9)'),
  total: () => tr('All 18', 'Gesamt (18)'),
};

/** One side bet afterwards: front, back and the 18 – both scores, who won, what it is worth; who pays whom. */
function SideBetSheet(props: { bet: SideBet; onClose: () => void; onOpenPool: (code: string) => void }) {
  const b = props.bet;
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet side-bet-sheet" role="dialog" aria-label={titleOf(b)} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{titleOf(b)}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">{[b.course, dayText(b.day)].filter(Boolean).join(' · ')}</span>
        {b.kind === 'duel' ? <DuelDetail bet={b} onOpenPool={props.onOpenPool} /> : <GameDetail bet={b} />}
      </section>
    </div>
  );
}

function DuelDetail(props: { bet: Duel; onOpenPool: (code: string) => void }) {
  const { e, w, mine, other, sym } = props.bet;
  const raw = duelDetails(w, e.pool);
  const days = mine ? raw : flipDetails(raw);
  const parts = w.parts ?? { front: 5, back: 5, total: 10 };
  const scoring = w.net ? tr(`Net · handicap ${w.allowance ?? 100} %`, `Netto · Vorgabe ${w.allowance ?? 100} %`) : tr('Gross', 'Brutto');
  const total = days.reduce((s, d) => s + d.amount, 0);
  const complete = days.some((d) => d.parts.some((p) => p.win != null));
  const who = (p: DuelPart) => (p.win == null ? '–' : p.win > 0 ? tr('You', 'Du') : p.win < 0 ? other : tr('Halved', 'Geteilt'));
  return (
    <>
      <span className="muted small">{`${scoring} · ${money(parts.front, sym)} / ${money(parts.back, sym)} / ${money(parts.total, sym)}`}</span>
      {w.challenge?.state === 'open' && <p className="small muted">{tr(`Waiting for ${other} to accept.`, `Wartet, bis ${other} annimmt.`)}</p>}
      {!days.length && w.challenge?.state !== 'open' && <p className="small muted">{tr('Not played yet – the result comes from both cards of the day.', 'Noch nicht gespielt – das Ergebnis kommt aus beiden Scorekarten des Tages.')}</p>}
      {days.map((d) => (
        <div key={d.day} className="side-bet-day">
          {days.length > 1 && <span className="eyebrow">{`${d.course} · ${short(d.day)}`}</span>}
          <table className="game-hist side-bet-table">
            <thead>
              <tr>
                <th></th>
                <th>{tr('You', 'Du')}</th>
                <th>{other}</th>
                <th>{tr('Won by', 'Gewinner')}</th>
                <th className="num">{sym}</th>
              </tr>
            </thead>
            <tbody>
              {d.parts.map((p) => (
                <tr key={p.part}>
                  <td>{PART_NAME[p.part]()}</td>
                  <td className={p.win != null && p.win > 0 ? 'won' : undefined}>{p.mine ?? '–'}</td>
                  <td className={p.win != null && p.win < 0 ? 'won' : undefined}>{p.theirs ?? '–'}</td>
                  <td>{who(p)}</td>
                  <td className={`num ${tone(p.win == null ? null : p.amount)}`}>{p.win == null ? '–' : signed(p.amount, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {complete && (
        <div className="side-bet-settle">
          <span className="eyebrow">{tr('Settlement', 'Verrechnung')}</span>
          <strong className={tone(total)}>
            {Math.abs(total) < 0.005 ? tr('Even – nobody pays.', 'Ausgeglichen – keiner zahlt.') : total > 0 ? tr(`${other} pays you ${money(total, sym)}.`, `${other} zahlt dir ${money(total, sym)}.`) : tr(`You pay ${other} ${money(total, sym)}.`, `Du zahlst ${other} ${money(total, sym)}.`)}
          </strong>
          <span className="muted small">
            {tr(`Settled in “${e.pool.name}” – there netted with every other bet in it.`, `Abgerechnet in „${e.pool.name}“ – dort mit allen anderen Wetten darin verrechnet.`)}
          </span>
          <button type="button" className="btn-secondary" onClick={() => props.onOpenPool(e.code)}>
            {tr('Open the settlement', 'Abrechnung öffnen')}
          </button>
        </div>
      )}
    </>
  );
}

function GameDetail(props: { bet: Side }) {
  const { s, round, sym } = props.bet;
  const g = sideGameView(s, round);
  const st = standingOf(g);
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  const pay = st.money ? transfers(st.money) : [];
  return (
    <>
      <StandingCard game={g} final={!!round.finishedAt} />
      <div className="side-bet-settle">
        <span className="eyebrow">{tr('Settlement', 'Verrechnung')}</span>
        {pay.length ? (
          pay.map((t) => (
            <span key={`${t.from}>${t.to}`}>{tr(`${name(t.from)} pays ${name(t.to)} ${money(t.amount, sym)}`, `${name(t.from)} zahlt ${name(t.to)} ${money(t.amount, sym)}`)}</span>
          ))
        ) : (
          <span className="muted">{tr('Nobody pays anybody.', 'Keiner zahlt etwas.')}</span>
        )}
      </div>
    </>
  );
}
