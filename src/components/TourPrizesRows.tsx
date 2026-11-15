import { tr } from '../lib/i18n';
import { isNone, prizeAmount, prizeSym, type Prize } from '../lib/prize';
import { keyName, PLACE_CHOICES, placesOf, prizeSlots, prizeSum, type TourPrizes } from '../lib/tourprizes';
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
export function TourPrizesRows(props: { value: TourPrizes | null; onChange: (v: TourPrizes | null) => void; players: string[]; net: boolean; classes: string[]; specials: Special[]; holeName: (i: number) => string; /** the heading – "Worum · ganze Serie" on a series (15.11.2026) */ title?: string }) {
  const v = props.value;
  const prize = v?.prize ?? null;
  const on = !!prize && !isNone(prize);
  const money = prize?.kind === 'money';
  const sym = prize ? prizeSym(prize) : '';
  const set = (patch: Partial<TourPrizes>) => props.onChange({ ...(v ?? { prize: prize!, amounts: {} }), ...patch } as TourPrizes);
  const names = props.players.filter((n) => n.trim());
  const collector = names.find((n) => keyName(n) === keyName(v?.collector ?? '')) ?? names[0] ?? '';
  const slots = prizeSlots({ net: props.net, classes: props.classes, specials: props.specials, holeName: props.holeName, tp: v });
  const amounts = v?.amounts ?? {};
  const fee = v?.fee ?? 0;
  const pot = fee * names.length;
  const sum = v ? prizeSum(v) : 0;
  const grossSet = slots.some((s) => s.id.startsWith('gross') && (amounts[s.id] ?? 0) > 0);
  const netSet = slots.some((s) => s.id.startsWith('net') && (amounts[s.id] ?? 0) > 0);
  const amt = (x: number) => (prize ? prizeAmount(x, prize) : String(x));
  // gross, net (each net class its own), the special prizes
  const cls = (id: string) => id.split(':')[1] ?? '';
  const netClasses = [...new Set(slots.filter((x) => x.group === 'net').map((x) => cls(x.id)))];
  const groups = [
    ...(slots.some((x) => x.group === 'gross') ? [{ key: 'gross', kind: 'gross' as const, title: tr('Prizes', 'Preise'), aria: tr('Gross prizes', 'Brutto-Preise'), slots: slots.filter((x) => x.group === 'gross') }] : []),
    ...netClasses.map((c) => ({ key: `net:${c}`, kind: 'net' as const, title: c ? tr(`Prizes · class ${c}`, `Preise · Klasse ${c}`) : tr('Prizes', 'Preise'), aria: tr('Net prizes', 'Netto-Preise'), slots: slots.filter((x) => x.group === 'net' && cls(x.id) === c) })),
    ...(slots.some((x) => x.group === 'special') ? [{ key: 'special', kind: 'special' as const, title: tr('Special prizes', 'Sonderwertungen'), aria: tr('Special prizes', 'Sonderwertungen'), slots: slots.filter((x) => x.group === 'special') }] : []),
  ];
  return (
    <section className="setup-part tour-prizes">
      <span className="eyebrow">{props.title ?? tr('Played for', 'Worum')}</span>
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
        {/* which rankings win prizes and how many places (Sascha 15.11.2026, mock-up A: "konfigurierbar") */}
        {on && props.net && (
          <ChoiceRow<'both' | 'gross' | 'net'>
            label={tr('Rankings', 'Wertungen')}
            title={tr('Which rankings win prizes', 'Welche Wertungen gewinnen Preise')}
            value={v?.scoring ?? 'both'}
            onChange={(sc) => set({ scoring: sc === 'both' ? undefined : sc })}
            options={[
              { value: 'both', name: tr('Gross + net', 'Brutto + Netto'), text: tr('Both rankings win prizes – the usual way.', 'Beide Wertungen gewinnen Preise – üblich.') },
              { value: 'gross', name: tr('Gross only', 'Nur Brutto'), text: tr('Only the strokes count.', 'Nur die Schläge zählen.') },
              { value: 'net', name: tr('Net only', 'Nur Netto'), text: tr('With the handicap allowance.', 'Mit der HCP-Vorgabe.') },
            ]}
          />
        )}
        {on && (
          <ChoiceRow<number>
            label={tr('Places per ranking', 'Plätze je Wertung')}
            value={placesOf(v)}
            onChange={(n) => set({ places: n === 3 ? undefined : n })}
            options={PLACE_CHOICES.map((n) => ({ value: n, name: n === 1 ? tr('Winner only', 'Nur Sieger') : tr(`${n} places`, `${n} Plätze`) }))}
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
          {/* a group per ranking (Sascha 15.11.2026: "brutto und netto noch visuell anders darstellen", mock-up A) */}
          {groups.map((g) => (
            <div key={g.key} className={`prize-group ${g.kind}`}>
              <span className="eyebrow">
                {g.kind !== 'special' && <span className={`rank-tag ${g.kind}`}>{g.kind === 'gross' ? tr('GROSS', 'BRUTTO') : tr('NET', 'NETTO')}</span>}
                {g.title}
              </span>
              <SettingsList label={g.aria}>
                {g.slots.map((sl) => (
                  <StakeRow key={sl.id} label={sl.place ? (sl.place === 1 ? tr('Winner', 'Sieger') : tr(`${sl.place}. place`, `${sl.place}. Platz`)) : sl.label} title={sl.label} value={amounts[sl.id] ?? 0} sym={sym} stakes={money ? AMOUNTS : COUNTS} onChange={(x) => set({ amounts: { ...amounts, [sl.id]: x } })} />
                ))}
              </SettingsList>
            </div>
          ))}
          {grossSet && netSet && (
            <SettingsList>
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
            </SettingsList>
          )}
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
