import { tr } from '../lib/i18n';
import { money } from '../lib/gameforms';
import type { Payment } from '../lib/wagers';
import { isMoney, MONEY_EUR, oweText, paidWord, type Prize } from '../lib/prize';

type Transfer = { from: string; to: string; amount: number };

const day = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');

/** "Wer zahlt wem" with what was paid (Sascha 03.11.2026: "everyone sees whether he paid his debts or received
 *  them"): each open transfer with "Bezahlt" for the payer, "Erhalten" for the receiver; below, the payments – paid,
 *  received, or paid and waiting for the receiver. For the pools; the games can mount it the same way.
 *  `anyone`: this phone marks for every player (the host – one phone for all). */
export function PaidMarks(props: {
  open: Transfer[];
  payments: Payment[];
  name: (id: string) => string;
  sym: string;
  /** what is played for: "zahlt an" / "schuldet", "Bezahlt" / "Eingelöst" (03.11.2026) */
  prize?: Prize;
  me?: string;
  anyone?: boolean;
  onMark: (t: Transfer, as: 'paid' | 'received') => void;
  onConfirm: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const mine = (id: string) => !!props.anyone || id === props.me;
  const prize = props.prize ?? MONEY_EUR;
  return (
    <div className="pool-pays-block">
      <span className="eyebrow">{isMoney(prize) ? tr('Who pays whom', 'Wer zahlt wem') : tr('Who owes whom', 'Wer schuldet wem')}</span>
      {props.open.length ? (
        <ul className="pool-pays">
          {props.open.map((t) => {
            // the receiver confirms, the payer says he paid; the host marks it paid for anyone
            const as = t.to === props.me ? 'received' : t.from === props.me || props.anyone ? 'paid' : null;
            return (
              <li key={`${t.from}-${t.to}`}>
                <span className="grow">
                  {/* "Cedric zahlt an Sascha" (Sascha 03.11.2026), not an arrow */}
                  {oweText(props.name(t.from), props.name(t.to), props.prize ?? MONEY_EUR)}
                </span>
                <strong>{money(t.amount, props.sym)}</strong>
                {as && (
                  <button
                    type="button"
                    className="chip paid-mark"
                    aria-label={as === 'received' ? tr(`Received ${money(t.amount, props.sym)} from ${props.name(t.from)}`, `${money(t.amount, props.sym)} von ${props.name(t.from)} erhalten`) : tr(`${props.name(t.from)} paid ${money(t.amount, props.sym)} to ${props.name(t.to)}`, `${props.name(t.from)} hat ${money(t.amount, props.sym)} an ${props.name(t.to)} bezahlt`)}
                    onClick={() => props.onMark(t, as)}
                  >
                    {as === 'received' ? tr('Received', 'Erhalten') : paidWord(prize)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="muted small">
          {props.payments.length
            ? isMoney(prize) ? tr('All paid.', 'Alles bezahlt.') : tr('All redeemed.', 'Alles eingelöst.')
            : tr('Nothing to pay yet – once bets are decided, it says here who pays whom.', 'Noch nichts zu zahlen – sobald Wetten entschieden sind, steht hier, wer wem wie viel zahlt.')}
        </span>
      )}
      {props.payments.length > 0 && (
        <>
          <span className="eyebrow">{paidWord(prize)}</span>
          <ul className="pool-pays paid-list" aria-label={paidWord(prize)}>
            {[...props.payments].reverse().map((p) => (
              <li key={p.id}>
                <span className="grow">
                  {tr(`${props.name(p.from)} to ${props.name(p.to)}`, `${props.name(p.from)} an ${props.name(p.to)}`)}
                  <span className="muted small paid-state">
                    {p.receivedAt
                      ? `${tr('received', 'erhalten')} ${day(p.receivedAt)}`
                      : `${paidWord(prize).toLowerCase()} ${day(p.paidAt)} – ${tr(`${props.name(p.to)} has not confirmed yet`, `${props.name(p.to)} bestätigt noch`)}`}
                  </span>
                </span>
                <strong className={p.receivedAt ? 'good-text' : undefined}>{money(p.amount, props.sym)}</strong>
                {!p.receivedAt && mine(p.to) && (
                  <button type="button" className="chip paid-mark" aria-label={tr(`Received ${money(p.amount, props.sym)} from ${props.name(p.from)}`, `${money(p.amount, props.sym)} von ${props.name(p.from)} erhalten`)} onClick={() => props.onConfirm(p.id)}>
                    {tr('Received', 'Erhalten')}
                  </button>
                )}
                {(mine(p.from) || mine(p.to)) && (
                  <button type="button" className="icon-btn paid-undo" aria-label={tr(`Take back: ${props.name(p.from)} to ${props.name(p.to)}`, `Zurücknehmen: ${props.name(p.from)} an ${props.name(p.to)}`)} onClick={() => props.onUndo(p.id)}>
                    ↺
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
