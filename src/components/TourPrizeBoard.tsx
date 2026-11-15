import { tr } from '../lib/i18n';
import { prizeAmount, prizeName } from '../lib/prize';
import { eventStandings, liveFlights, netClasses, CLASS_NAMES, type RoundEvent } from '../lib/sharedround';
import { specialBoard } from '../lib/specials';
import { hasPrizes, keyName, prizeAwards, prizeSettle, prizeSum, type Award, type TourPrizes } from '../lib/tourprizes';

type PrizedEvent = RoundEvent & { prizes?: TourPrizes };

/** The awards and the settlement of a tournament's prizes – from its live event. */
export function tourPrizeResult(ev: PrizedEvent): { tp: TourPrizes; awards: Award[]; players: string[]; settle: ReturnType<typeof prizeSettle>; /** every card in – as the leaderboard says "Ergebnis" */ done: boolean } | null {
  const tp = ev.prizes;
  if (!hasPrizes(tp)) return null;
  const fmt = ev.format;
  const net = (fmt?.scoring ?? 'net') !== 'stroke' && (fmt?.allowance ?? 100) > 0;
  const classes = net && netClasses(ev).length ? CLASS_NAMES.slice(0, netClasses(ev).length + 1) : [];
  const gross = eventStandings(ev, { gross: true }).rows;
  const netRows = net ? eventStandings(ev, { gross: false }).rows : null;
  const specials = specialBoard(ev).map(({ special, rows }) => ({ special, name: rows[0]?.name ?? null }));
  const awards = prizeAwards(tp, { gross, net: netRows, classes, specials });
  const players = liveFlights(ev).flatMap((f) => f.players.flatMap((p) => (p.members?.length ? p.members.map((m) => m.name) : [p.name])));
  return { tp, awards, players, settle: prizeSettle(tp, players, awards), done: gross.length > 0 && gross.every((r) => r.finished) };
}

/** The tournament's prizes on its page (Sascha 14.11.2026, mock-ups 4 and 5): who wins what – provisional while it is
 *  played –, and once every card is in, who pays whom through the collector; the host marks a payment "Bezahlt". */
export function TourPrizeBoard(props: { ev: PrizedEvent; done: boolean; played: boolean; host: boolean; onPaid: (key: string, on: boolean) => void; /** settled at the end of this series (Sascha 15.11.2026) – no "Wer zahlt wem" here */ seriesName?: string }) {
  const r = tourPrizeResult(props.ev);
  if (!r) return null;
  const { tp, awards, settle } = r;
  const amt = (v: number) => prizeAmount(v, tp.prize);
  const fee = tp.fee ?? 0;
  const pot = fee * r.players.length;
  const labelsOf = (name: string) =>
    awards
      .flatMap((a) => a.winners.filter((w) => keyName(w.name) === keyName(name)).map((w) => `${a.label} ${amt(w.amount)}`))
      .join(' + ');
  return (
    <section className="card tour-prize-board" aria-label={tr('Prizes', 'Preise')}>
      <span className="eyebrow">
        {tr('Prizes', 'Preise')} · {prizeName(tp.prize)}
        {fee > 0 ? ` · ${tr(`pot ${amt(pot)}`, `Topf ${amt(pot)}`)}` : ''}
      </span>
      {props.played && awards.length ? (
        <ul className="game-pays tour-prize-list">
          {awards.map((a) => (
            <li key={a.slot}>
              <span>
                {a.label}
                <span className="muted small"> · {a.winners.map((w) => w.name).join(', ')}</span>
              </span>
              <span className="prize-chip">{a.winners.length > 1 ? tr(`${amt(a.winners[0].amount)} each`, `je ${amt(a.winners[0].amount)}`) : amt(a.winners[0].amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted small">
          {tr(`Prizes ${amt(prizeSum(tp))}`, `Preise ${amt(prizeSum(tp))}`)}
          {fee > 0 ? ` · ${tr(`entry fee ${amt(fee)} per player, collected by ${settle.collector}`, `Startgeld ${amt(fee)} je Spieler, sammelt ${settle.collector}`)}` : ''}
        </span>
      )}
      {props.played && !props.done && awards.length > 0 && <span className="muted small">{tr('Provisional – final once every card is in.', 'Vorläufig – fest, sobald alle Karten drin sind.')}</span>}
      {props.seriesName && <span className="muted small">{tr(`Settled at the end of the series "${props.seriesName}" – together with its prizes.`, `Abgerechnet wird am Ende der Serie „${props.seriesName}“ – zusammen mit den Serienpreisen.`)}</span>}
      {!props.seriesName && props.done && settle.transfers.length > 0 && (
        <>
          <span className="eyebrow tour-prize-pay-head">{tr('Who pays whom', 'Wer zahlt wem')}</span>
          <ul className="tour-prize-pays">
            {settle.transfers.map((t) => {
              const paid = !!tp.paid?.[t.key];
              const won = labelsOf(t.from === settle.collector ? t.to : t.from);
              const what = [won, t.fee ? tr(`− entry fee ${amt(t.fee)}`, `− Startgeld ${amt(t.fee)}`) : ''].filter(Boolean).join(' ');
              return (
                <li key={t.key} className={paid ? 'paid' : undefined}>
                  <span className="grow">
                    <strong>
                      {t.from} → {t.to}
                    </strong>
                    {what && <span className="muted small">{what}</span>}
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
