import { useState } from 'react';
import { tr } from '../lib/i18n';
import { PRIZE_CHOICES, WHO_CHOICES, prizeName, whoOf, type Prize, type PrizeKind, type PrizeWho } from '../lib/prize';
import { PickSheet, SettingsRow } from './Settings';

/** "Worum wird gespielt ›" (Sascha 03.11.2026): no value until chosen – in green, a required field. The first step:
 *  Geld, Getränke, Essen, Schläger putzen, Eigener Einsatz …, Ohne Einsatz; the second: the currency for money, who buys
 *  for whom for a thing. The same row in Games and in the bets. */
export function PrizeRow(props: { value: Prize | null; onChange: (p: Prize) => void; disabled?: boolean }) {
  const [step, setStep] = useState<null | 'kind' | 'currency' | 'label' | 'who'>(null);
  const [kind, setKind] = useState<PrizeKind | null>(null);
  const [text, setText] = useState(props.value?.kind === 'custom' ? props.value.label : '');
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setStep(null);
    setError(null);
  };
  const pickKind = (k: PrizeKind) => {
    setKind(k);
    if (k === 'none') {
      props.onChange({ kind: 'none' });
      return close();
    }
    setStep(k === 'money' ? 'currency' : k === 'custom' ? 'label' : 'who');
  };
  const pickWho = (who: PrizeWho) => {
    const k = kind ?? props.value?.kind;
    if (k === 'custom') props.onChange({ kind: 'custom', label: text.trim().slice(0, 30), who });
    else if (k === 'drinks' || k === 'meal' || k === 'clubs') props.onChange({ kind: k, who });
    close();
  };
  const label = tr('Played for', 'Worum wird gespielt');
  const current = props.value;
  return (
    <>
      <SettingsRow label={label} value={current ? prizeName(current) : tr('Choose', 'Bitte wählen')} need={!current} onClick={() => setStep('kind')} disabled={props.disabled} />
      {step === 'kind' && (
        <PickSheet<PrizeKind> title={label} current={current?.kind as PrizeKind} options={PRIZE_CHOICES().map((c) => ({ value: c.kind, name: c.name, text: c.text }))} onPick={pickKind} onClose={close} />
      )}
      {step === 'currency' && (
        <PickSheet<'EUR' | 'USD'>
          title={tr('Money – the currency', 'Geld – die Währung')}
          current={(current?.kind === 'money' ? current.currency : null) as 'EUR' | 'USD'}
          options={[
            { value: 'EUR', name: 'Euro (€)' },
            { value: 'USD', name: 'Dollar ($)', text: tr('For a trip to the USA', 'Für eine Reise in die USA') },
          ]}
          onPick={(c) => {
            props.onChange({ kind: 'money', currency: c });
            close();
          }}
          onClose={close}
        />
      )}
      {step === 'label' && (
        <PickSheet<string> title={tr('Own stake', 'Eigener Einsatz')} current={''} options={[]} onPick={() => undefined} onClose={close}>
          <div className="cap-input">
            <input
              className="input"
              autoFocus
              required
              aria-label={tr('What is played for', 'Worum gespielt wird')}
              placeholder={tr('e.g. a round of beer', 'z. B. Bier-Runde')}
              value={text}
              maxLength={30}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (text.trim() ? setStep('who') : setError(tr('Type what is played for', 'Gib ein, worum gespielt wird')))}
            />
            <button type="button" className="btn-secondary" onClick={() => (text.trim() ? setStep('who') : setError(tr('Type what is played for, e.g. a round of beer', 'Gib ein, worum gespielt wird, z. B. Bier-Runde')))}>
              {tr('Next', 'Weiter')}
            </button>
          </div>
          {error && (
            <span className="small bad-text" role="alert">
              {error}
            </span>
          )}
        </PickSheet>
      )}
      {step === 'who' && (
        <PickSheet<PrizeWho>
          title={tr('Who buys for whom', 'Wer gibt wem aus')}
          current={(current && current.kind === (kind ?? current.kind) ? whoOf(current) : null) as PrizeWho}
          options={WHO_CHOICES()}
          onPick={pickWho}
          onClose={close}
        />
      )}
    </>
  );
}
