import { useState } from 'react';
import { tr } from '../lib/i18n';
import { money } from '../lib/gameforms';
import { PAY_DETAILS, paypalLink, type PayHow, type Payment } from '../lib/wagers';
import { isMoney, MONEY_EUR, oweText, paidWord, type Prize } from '../lib/prize';
import { ACTION_ICONS } from './ActionBar';
import { SwipeRow } from './SwipeRow';

/** An open payment's button says what a tap does – "Als bezahlt markieren" – in a neutral outline; green only once done
 *  (Sascha 12.11.2026: "Bezahlt ist grün, aber ich habe noch nicht bezahlt – in grün wirkt es, als hätte ich schon bezahlt"). */
export const markWord = (w: string): string => tr(`Mark as ${w.toLowerCase()}`, `Als ${w.toLowerCase()} markieren`);

type Transfer = { from: string; to: string; amount: number };
/** one line of what a payment is made of: a bet (+), what the other owes back and is set off (−), what was paid already */
export type WhyLine = { label: string; amount: number; off?: boolean };

/** a payment's swipe: "Zurücknehmen" with the arrow back, grey – nothing is deleted (Facelift-Abnahme G4) */
export const TAKE_BACK = () => ({ word: tr('Take back', 'Zurücknehmen'), icon: ACTION_ICONS.reopen, tone: 'neutral' as const });

const day = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');
/** how a payment came, in words */
export const howText = (h: PayHow): string => (h === 'paypal' ? 'PayPal' : h === 'cash' ? tr('cash', 'bar') : tr('bank transfer', 'Überweisung'));

/** "Wer zahlt wem" with what was paid (Sascha 03.11.2026: "everyone sees whether he paid his debts or received
 *  them"): each open transfer with "Bezahlt" for the payer, "Erhalten" for the receiver; below, the payments – paid,
 *  received, or paid and waiting for the receiver. For the pools; the games can mount it the same way.
 *  standIn: a player without the app the host's phone marks for – otherwise each only his own (12.11.2026). */
export function PaidMarks(props: {
  open: Transfer[];
  payments: Payment[];
  name: (id: string) => string;
  sym: string;
  /** what is played for: "zahlt an" / "schuldet", "Bezahlt" / "Eingelöst" (03.11.2026) */
  prize?: Prize;
  me?: string;
  /** a player this phone marks for besides its own – one without the app (the host's phone); everyone else only sees the
   *  others' payments, synchronised (Sascha 12.11.2026: "only the bets that concern me directly") */
  standIn?: (id: string) => boolean;
  onMark: (t: Transfer, as: 'paid' | 'received', how?: PayHow) => void;
  onConfirm: (id: string, how?: PayHow) => void;
  /** a player's PayPal.me name – the payer pays him by PayPal right from here (Sascha 10.11.2026) */
  paypalOf?: (id: string) => string | null | undefined;
  /** the money's currency, for the PayPal link */
  currency?: 'EUR' | 'USD';
  onUndo: (id: string) => void | boolean | Promise<void | boolean>;
  /** what each payment is made of, right below it (Sascha 11.11.2026, design round 2: "der Rechenweg muss von der Logik
   *  her anders" – no separate "Rechenweg", each payment says where it comes from and what is set off) */
  why?: (t: Transfer) => WhyLine[] | null;
  /** pairs set off to nothing – said once below the payments, so a ±0 is traceable too */
  even?: string[];
}) {
  const mine = (id: string) => id === props.me || !!props.standIn?.(id);
  const prize = props.prize ?? MONEY_EUR;
  // "Erhalten": how it came – PayPal, cash, transfer (Sascha 10.11.2026: "the receiver chooses how he got it")
  const [asking, setAsking] = useState<null | { t?: Transfer; id?: string; amount: number; from: string }>(null);
  const received = (how: PayHow) => {
    if (asking?.t) props.onMark(asking.t, 'received', how);
    else if (asking?.id) props.onConfirm(asking.id, how);
    setAsking(null);
  };
  return (
    <div className="pool-pays-block">
      <span className="eyebrow">{isMoney(prize) ? tr('Who pays whom', 'Wer zahlt wem') : tr('Who owes whom', 'Wer schuldet wem')}</span>
      {props.open.length ? (
        <ul className="pool-pays">
          {props.open.map((t) => {
            // the receiver confirms, the payer says he paid – each his own; the others' only shown
            const as = mine(t.to) ? 'received' : mine(t.from) ? 'paid' : null;
            return (
              <li key={`${t.from}-${t.to}`} className={props.why ? 'pays-with-why' : undefined}>
                <span className="grow">
                  {/* "Cedric zahlt an Sascha" (Sascha 03.11.2026), not an arrow */}
                  {oweText(props.name(t.from), props.name(t.to), props.prize ?? MONEY_EUR)}
                </span>
                <strong>{money(t.amount, props.sym)}</strong>
                {/* the payer: straight to PayPal with the amount, when the receiver has his PayPal.me name */}
                {PAY_DETAILS && t.from === props.me && isMoney(prize) && props.paypalOf?.(t.to) && (
                  <a className="chip paypal-pay" href={paypalLink(props.paypalOf(t.to)!, t.amount, props.currency ?? 'EUR')} target="_blank" rel="noopener noreferrer" aria-label={tr(`Pay ${money(t.amount, props.sym)} to ${props.name(t.to)} by PayPal`, `${money(t.amount, props.sym)} an ${props.name(t.to)} per PayPal zahlen`)}>
                    PayPal
                  </a>
                )}
                {as && (
                  <button
                    type="button"
                    className={`chip paid-mark ${as === 'received' ? 'mark-received' : 'mark-paid'}`}
                    aria-label={as === 'received' ? tr(`Received ${money(t.amount, props.sym)} from ${props.name(t.from)}`, `${money(t.amount, props.sym)} von ${props.name(t.from)} erhalten`) : tr(`${props.name(t.from)} paid ${money(t.amount, props.sym)} to ${props.name(t.to)}`, `${props.name(t.from)} hat ${money(t.amount, props.sym)} an ${props.name(t.to)} bezahlt`)}
                    onClick={() => (as === 'received' && isMoney(prize) && PAY_DETAILS ? setAsking({ t, amount: t.amount, from: t.from }) : props.onMark(t, as))}
                  >
                    {markWord(as === 'received' ? tr('Received', 'Erhalten') : paidWord(prize))}
                  </button>
                )}
                {(() => {
                  const lines = props.why?.(t);
                  if (!lines?.length) return null;
                  const off = lines.some((l) => l.off);
                  return (
                    <div className="pays-why">
                      {lines.map((l, k) => (
                        <div key={k} className={l.off ? 'off' : undefined}>
                          <span>{l.label}</span>
                          <span>{`${l.amount < 0 ? '−' : ''}${money(Math.abs(Math.round(l.amount * 100) / 100), props.sym)}`}</span>
                        </div>
                      ))}
                      {lines.length > 1 && (
                        <div className="sum">
                          <span>{off ? tr('set off', 'verrechnet') : tr('together', 'zusammen')}</span>
                          <span>{money(t.amount, props.sym)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
      {!!props.even?.length && (
        <span className="muted small pays-even">
          {props.even.join(' · ')}
        </span>
      )}
      {props.payments.length > 0 && (
        <>
          <span className="eyebrow">{paidWord(prize)}</span>
          <ul className="pool-pays paid-list" aria-label={paidWord(prize)}>
            {[...props.payments].reverse().map((p) => {
              const who = tr(`${props.name(p.from)} to ${props.name(p.to)}`, `${props.name(p.from)} an ${props.name(p.to)}`);
              const row = (
                <>
                  <span className="grow">
                    {who}
                    <span className="muted small paid-state">
                      {p.receivedAt
                        ? `${tr('received', 'erhalten')} ${day(p.receivedAt)}${PAY_DETAILS && p.how ? ` · ${howText(p.how)}` : ''}`
                        : `${paidWord(prize).toLowerCase()} ${day(p.paidAt)} – ${tr(`${props.name(p.to)} has not confirmed yet`, `${props.name(p.to)} bestätigt noch`)}`}
                    </span>
                  </span>
                  <strong className={p.receivedAt ? 'good-text' : undefined}>{money(p.amount, props.sym)}</strong>
                  {!p.receivedAt && mine(p.to) && (
                    <button type="button" className="chip paid-mark mark-received" aria-label={tr(`Received ${money(p.amount, props.sym)} from ${props.name(p.from)}`, `${money(p.amount, props.sym)} von ${props.name(p.from)} erhalten`)} onClick={() => (isMoney(prize) && PAY_DETAILS ? setAsking({ id: p.id, amount: p.amount, from: p.from }) : props.onConfirm(p.id))}>
                      {markWord(tr('Received', 'Erhalten'))}
                    </button>
                  )}
                </>
              );
              return (
                <li key={p.id}>
                  {/* taken back by swiping left, as a mail – the action says "Zurücknehmen" with the arrow back, no bin (Sascha
                      11.11.2026, Facelift-Abnahme G4: "Nach links wischen ok, aber Mülleimer ist löschen statt zurücknehmen") */}
                  {mine(p.from) || mine(p.to) ? (
                    <SwipeRow label={who} className="paid-row" action={TAKE_BACK()} onDelete={() => props.onUndo(p.id)}>
                      {row}
                      {/* for the keyboard and VoiceOver – the swipe is for the finger */}
                      <button type="button" className="sr-only" aria-label={tr(`Take back: ${who}`, `Zurücknehmen: ${who}`)} onClick={() => props.onUndo(p.id)}>
                        {tr('Take back', 'Zurücknehmen')}
                      </button>
                    </SwipeRow>
                  ) : (
                    <div className="paid-row">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {props.payments.some((p) => mine(p.from) || mine(p.to)) && <span className="muted small paid-hint">{tr('Swipe a payment left to take it back.', 'Eine Zahlung nach links wischen nimmt sie zurück.')}</span>}
        </>
      )}
      {asking && (
        <div className="sheet-backdrop" onClick={() => setAsking(null)}>
          <section className="sheet" role="dialog" aria-label={tr('How did it come?', 'Wie erhalten?')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr(`${money(asking.amount, props.sym)} from ${props.name(asking.from)} – how?`, `${money(asking.amount, props.sym)} von ${props.name(asking.from)} – wie erhalten?`)}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setAsking(null)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {(['paypal', 'cash', 'transfer'] as PayHow[]).map((h) => (
                <button key={h} type="button" className="pick-option" onClick={() => received(h)}>
                  <strong>{howText(h).replace(/^./, (c) => c.toUpperCase())}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
