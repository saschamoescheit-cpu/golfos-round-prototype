import { tr } from '../lib/i18n';
import { isNone, prizeAmount, prizeSym, type Prize } from '../lib/prize';
import { keyName, prizeSlots, prizeSum, type TourPrizes } from '../lib/tourprizes';
import type { Special } from '../lib/specials';
import { ChoiceRow, SettingsList } from './Settings';
import { StakeRow } from './StakePicker';
import { PrizeRow } from './PrizeRow';

const FEES = [0, 5, 10, 20, 25, 50, 100];
const AMOUNTS = [0, 10, 20, 25, 30, 50, 100, 200];
const COUNTS = [0, 1, 2, 3, 4, 5];

/** "Worum" of a tournament (Sascha 14.11.2026, mock-ups 2 and 3 "Turnier-Preise"): what is played for as in Games, the
 *  entry fee per player and who collects it, then an amount per place – gross, net (per class), the special prizes;
 *  the pot and the prizes added up below, a warning when the prizes are more than the pot. */
export function TourPrizesRows(props: { value: TourPrizes | null; onChange: (v: TourPrizes | null) => void; players: string[]; net: boolean; classes: string[]; specials: Special[]; holeName: (i: number) => string }) {
  const v = props.value;
  const prize = v?.prize ?? null;
  const on = !!prize && !isNone(prize);
  const money = prize?.kind === 'money';
  const sym = prize ? prizeSym(prize) : '';
  const set = (patch: Partial<TourPrizes>) => props.onChange({ ...(v ?? { prize: prize!, amounts: {} }), ...patch } as TourPrizes);
  const names = props.players.filter((n) => n.trim());
  const collector = names.find((n) => keyName(n) === keyName(v?.collector ?? '')) ?? names[0] ?? '';
  const slots = prizeSlots({ net: props.net, classes: props.classes, specials: props.specials, holeName: props.holeName });
  const amounts = v?.amounts ?? {};
  const fee = v?.fee ?? 0;
  const pot = fee * names.length;
  const sum = v ? prizeSum(v) : 0;
  const grossSet = slots.some((s) => s.id.startsWith('gross') && (amounts[s.id] ?? 0) > 0);
  const netSet = slots.some((s) => s.id.startsWith('net') && (amounts[s.id] ?? 0) > 0);
  const amt = (x: number) => (prize ? prizeAmount(x, prize) : String(x));
  return (
    <section className="setup-part tour-prizes">
      <span className="eyebrow">{tr('Played for', 'Worum')}</span>
      <SettingsList>
        <PrizeRow
          noWho
          value={prize}
          onChange={(p: Prize) => (isNone(p) ? props.onChange({ prize: p, amounts: {} }) : set({ prize: p }))}
        />
        {on && <StakeRow label={tr('Entry fee per player', 'Startgeld je Spieler')} value={fee} sym={sym} stakes={money ? FEES : COUNTS} onChange={(f) => set({ fee: f || undefined })} />}
        {on && fee > 0 && names.length > 1 && (
          <ChoiceRow<string>
            label={tr('Collects the fees', 'Startgeld sammelt')}
            title={tr('Who collects the fees and pays the prizes', 'Wer sammelt das Startgeld und zahlt die Preise aus')}
            value={keyName(collector)}
            onChange={(k) => set({ collector: names.find((n) => keyName(n) === k) ?? collector })}
            options={names.map((n) => ({ value: keyName(n), name: n }))}
          />
        )}
      </SettingsList>
      {on && fee > 0 && (
        <div className="tour-pot" role="status">
          <span>{tr(`Pot · ${names.length} players × ${amt(fee)}`, `Topf · ${names.length} Spieler × ${amt(fee)}`)}</span>
          <strong>{amt(pot)}</strong>
        </div>
      )}
      {on && (
        <>
          <span className="eyebrow">{tr('Prizes', 'Preise')}</span>
          <SettingsList label={tr('Prizes', 'Preise')}>
            {slots.map((s) => (
              <StakeRow key={s.id} label={s.label} value={amounts[s.id] ?? 0} sym={sym} stakes={money ? AMOUNTS : COUNTS} onChange={(x) => set({ amounts: { ...amounts, [s.id]: x } })} />
            ))}
            {grossSet && netSet && (
              <ChoiceRow<'gross' | 'both'>
                label={tr('Gross and net winner', 'Brutto- und Netto-Sieg')}
                title={tr('One player wins gross and net', 'Ein Spieler gewinnt brutto und netto')}
                value={v?.double ?? 'gross'}
                onChange={(d) => set({ double: d })}
                options={[
                  { value: 'gross', name: tr('Gross prize only', 'Nur Brutto-Preis'), text: tr('The net prize goes to the next – as usual in a club.', 'Der Netto-Preis geht an den Nächsten – wie im Club üblich.') },
                  { value: 'both', name: tr('Both prizes', 'Beide Preise'), text: tr('He gets the gross and the net prize.', 'Er bekommt Brutto- und Netto-Preis.') },
                ]}
              />
            )}
          </SettingsList>
          {sum > 0 && (
            <div className="tour-pot" role="status">
              <span>{tr('Prizes together', 'Preise zusammen')}</span>
              <strong>{amt(sum)}</strong>
            </div>
          )}
          {sum > 0 && fee > 0 && sum !== pot && (
            <span className={`small ${sum > pot ? 'warn-text' : 'muted'}`} role="note">
              {sum > pot
                ? tr(`${amt(sum - pot)} more than the pot (${amt(pot)}) – ${collector} adds it, or change the prizes.`, `${amt(sum - pot)} mehr als im Topf (${amt(pot)}) – ${collector} legt drauf, oder Preise anpassen.`)
                : tr(`${amt(pot - sum)} of the pot stays with ${collector}.`, `${amt(pot - sum)} vom Topf bleiben bei ${collector}.`)}
            </span>
          )}
          {sum > 0 && fee === 0 && <span className="muted small">{tr(`No entry fee: ${collector} pays the prizes.`, `Ohne Startgeld: ${collector} zahlt die Preise.`)}</span>}
          {sum > 0 && <span className="muted small">{tr('A tie shares the prize.', 'Bei Gleichstand wird der Preis geteilt.')}</span>}
        </>
      )}
    </section>
  );
}
