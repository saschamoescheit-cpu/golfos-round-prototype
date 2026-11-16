import { tr } from '../lib/i18n';
import { prizeAmount, prizeName, type Prize } from '../lib/prize';
import { eventStandings, liveFlights, type RoundEvent } from '../lib/sharedround';
import { seriesGuests, seriesStandings } from '../lib/seriesstandings';
import { addBalances, hasPrizes, prizeAwards, prizeSettle, prizeSum, rankKind, settleBalances, type Award, type RankRow, type TourPrizes } from '../lib/tourprizes';
import type { TourSeries } from '../lib/tourstore';
import { tourPrizeResult } from './TourPrizeBoard';

type PrizedEvent = RoundEvent & { prizes?: TourPrizes };

/** The same thing played for – money in the same currency, the same drink …: only those are added up. */
export const samePrize = (a: Prize, b: Prize): boolean => a.kind === b.kind && (a as { currency?: string }).currency === (b as { currency?: string }).currency && (a as { label?: string }).label === (b as { label?: string }).label;

/** What a series' settlement is counted in: the series' own prize, else the first tournament's with prizes. */
export function seriesPrizeRef(s: Pick<TourSeries, 'prizes'>, dayPrizes: (TourPrizes | null | undefined)[]): Prize | null {
  if (hasPrizes(s.prizes)) return s.prizes.prize;
  return dayPrizes.find((p): p is TourPrizes => hasPrizes(p))?.prize ?? null;
}

/** A tournament's prizes settled at the end of its series, together with the series' own (Sascha 15.11.2026: "Eine
 *  Abrechnung am Ende") – those in the series' currency; another kind settles on its own page. */
export const settledInSeries = (s: Pick<TourSeries, 'prizes'>, dayPrizes: (TourPrizes | null | undefined)[], own: TourPrizes | null | undefined): boolean => {
  const ref = seriesPrizeRef(s, dayPrizes);
  return !!ref && hasPrizes(own) && samePrize(ref, own.prize);
};

const isDone = (e: RoundEvent) => {
  const rows = eventStandings(e, { gross: true }).rows;
  return rows.length > 0 && rows.every((r) => r.finished);
};
// a guest (Sascha 16.11.2026: "Nur Tageswertung") wins nothing of the series' own – as a No Return
const rank = (rows: { name: string; pos: string; sum: number; noReturn: boolean; guest: boolean }[]): RankRow[] => rows.map((r) => ({ name: r.name, pos: r.noReturn || r.guest ? '–' : r.pos, sort: r.noReturn || r.guest ? null : r.sum }));

/** The series' prizes: its own on the total (gross, net), the day prizes of its tournaments, and the one settlement over
 *  all of them once the last round is in. `evs`: the rounds in the series' order, each with its tournament's prizes. */
export function seriesPrizeResult(s: Pick<TourSeries, 'prizes' | 'paid'>, evs: (PrizedEvent | null)[]) {
  const played = evs.filter((e): e is PrizedEvent => !!e && liveFlights(e).length > 0);
  // the series' players – its guests play for their days' prizes only (Sascha 16.11.2026)
  const guests = seriesGuests(evs);
  const players = [...new Map(played.flatMap((e) => liveFlights(e).flatMap((f) => f.players.flatMap((p) => (p.members?.length ? p.members.map((m) => m.name) : [p.name])))).filter((n) => n.trim() && !guests.has(n.trim().toLowerCase())).map((n) => [n.trim().toLowerCase(), n])).values()];
  const tp = hasPrizes(s.prizes) ? s.prizes : null;
  const net = played.some((e) => (e.format?.scoring ?? 'net') !== 'stroke' && (e.format?.allowance ?? 100) > 0);
  const own: Award[] = tp ? prizeAwards(tp, { gross: rank(seriesStandings(played, { gross: true, field: evs }).rows), net: net ? rank(seriesStandings(played, { gross: false, field: evs }).rows) : null }) : [];
  const ref = seriesPrizeRef(s, evs.map((e) => e?.prizes));
  const days = evs.flatMap((e, k) => {
    const r = e ? tourPrizeResult(e) : null;
    return r && ref && samePrize(ref, r.tp.prize) ? [{ k, r }] : [];
  });
  const done = evs.length > 0 && evs.every((e) => !!e && isDone(e));
  const balance = addBalances(...days.map((d) => d.r.settle.balance), ...(tp ? [prizeSettle(tp, players, own).balance] : []));
  return { tp, ref, net, own, days, players, balance, transfers: settleBalances(balance), done, any: !!tp || days.length > 0 };
}

/** The series' prizes on its page (Sascha 15.11.2026, "Auf der Serienseite" + "Eine Abrechnung am Ende"): what the
 *  series is played for and who wins it – provisional until the last round –, the day prizes of its rounds, and once
 *  every round is in, who pays whom over all of it; the host marks a payment "Bezahlt". */
export function SeriesPrizeBoard(props: { series: Pick<TourSeries, 'prizes' | 'paid'>; evs: (PrizedEvent | null)[]; host: boolean; onPaid: (key: string, on: boolean) => void }) {
  const r = seriesPrizeResult(props.series, props.evs);
  if (!r.any || !r.ref) return null;
  const amt = (v: number) => prizeAmount(v, r.ref!);
  const fee = r.tp?.fee ?? 0;
  const anyPlayed = r.players.length > 0 && props.evs.some((e) => !!e && eventStandings(e, { gross: true }).rows.some((x) => (x.thru ?? 0) > 0));
  const dayAwards = r.days.filter((d) => d.r.awards.length && props.evs[d.k] && eventStandings(props.evs[d.k]!, { gross: true }).rows.some((x) => (x.thru ?? 0) > 0));
  return (
    <section className="card tour-prize-board" aria-label={tr('Prizes of the series', 'Preise der Serie')}>
      <span className="eyebrow">
        {tr('Prizes', 'Preise')} · {prizeName(r.ref)}
        {fee > 0 ? ` · ${tr(`pot ${amt(fee * r.players.length)}`, `Topf ${amt(fee * r.players.length)}`)}` : ''}
      </span>
      {r.tp && (
        <>
          <span className="small tour-prize-sub">{tr('The whole series', 'Ganze Serie')}</span>
          {anyPlayed && r.own.length ? (
            <ul className="game-pays tour-prize-list">
              {r.own.map((a) => (
                <li key={a.slot}>
                  <span className="prize-line">
                    {rankKind(a.slot) !== 'special' && <span className={`rank-tag ${rankKind(a.slot)}`}>{rankKind(a.slot) === 'gross' ? tr('GROSS', 'BRUTTO') : tr('NET', 'NETTO')}</span>}
                    {a.label}
                    <span className="muted small"> · {a.winners.map((w) => w.name).join(', ')}</span>
                  </span>
                  <span className={`prize-chip ${rankKind(a.slot)}`}>{a.winners.length > 1 ? tr(`${amt(a.winners[0].amount)} each`, `je ${amt(a.winners[0].amount)}`) : amt(a.winners[0].amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted small">
              {tr(`Prizes ${amt(prizeSum(r.tp))}`, `Preise ${amt(prizeSum(r.tp))}`)}
              {fee > 0 ? ` · ${tr(`entry fee ${amt(fee)} per player for the series`, `Startgeld ${amt(fee)} je Spieler für die Serie`)}` : ''}
            </span>
          )}
        </>
      )}
      {dayAwards.length > 0 && (
        <>
          <span className="small tour-prize-sub">{tr('Day prizes', 'Tagespreise')}</span>
          <ul className="game-pays tour-prize-list">
            {dayAwards.flatMap((d) =>
              d.r.awards.map((a) => (
                <li key={`${d.k}:${a.slot}`}>
                  <span className="prize-line">
                    {rankKind(a.slot) !== 'special' && <span className={`rank-tag ${rankKind(a.slot)}`}>{rankKind(a.slot) === 'gross' ? tr('GROSS', 'BRUTTO') : tr('NET', 'NETTO')}</span>}
                    R{d.k + 1} · {a.label}
                    <span className="muted small"> · {a.winners.map((w) => w.name).join(', ')}</span>
                  </span>
                  <span className={`prize-chip ${rankKind(a.slot)}`}>{a.winners.length > 1 ? tr(`${amt(a.winners[0].amount)} each`, `je ${amt(a.winners[0].amount)}`) : amt(a.winners[0].amount)}</span>
                </li>
              )),
            )}
          </ul>
        </>
      )}
      {!r.done && <span className="muted small">{tr('Settled once after the last round – day prizes and the series together.', 'Abgerechnet wird einmal nach der letzten Runde – Tagespreise und Serie zusammen.')}</span>}
      {r.done && r.transfers.length > 0 && (
        <>
          <span className="eyebrow tour-prize-pay-head">{tr('Who pays whom', 'Wer zahlt wem')}</span>
          <ul className="tour-prize-pays">
            {r.transfers.map((t) => {
              const paid = !!props.series.paid?.[t.key];
              return (
                <li key={t.key} className={paid ? 'paid' : undefined}>
                  <span className="grow">
                    <strong>
                      {t.from} → {t.to}
                    </strong>
                    <span className="muted small">{tr('prizes and entry fees of the series', 'Preise und Startgelder der Serie')}</span>
                  </span>
                  <strong className="tour-prize-amt">{amt(t.amount)}</strong>
                  {props.host ? (
                    <button type="button" className={paid ? 'btn-secondary bell-act' : 'btn-primary bell-act'} aria-pressed={paid} aria-label={paid ? tr(`${t.from} → ${t.to}: paid – undo`, `${t.from} → ${t.to}: bezahlt – zurücknehmen`) : tr(`${t.from} → ${t.to}: mark paid`, `${t.from} → ${t.to}: als bezahlt markieren`)} onClick={() => props.onPaid(t.key, !paid)}>
                      {paid ? tr('Paid ✓', 'Bezahlt ✓') : tr('Paid', 'Bezahlt')}
                    </button>
                  ) : (
                    paid && <span className="good-text small">{tr('paid', 'bezahlt')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
