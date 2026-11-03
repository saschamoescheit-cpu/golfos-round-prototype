import { useState } from 'react';
import { tr } from '../lib/i18n';
import { fromKind, kindOf, prizeName, PRIZE_CHOICES, type Prize, type PrizeKind } from '../lib/prize';
import { PickSheet, SettingsRow } from './Settings';

/** "Worum wird gespielt · Euro (€) ›" (Sascha 03.11.2026): money, drinks, a meal, cleaning the clubs – or one's own,
 *  typed ("Eigener Einsatz …"). The same row in Games and in the bets. */
export function PrizeRow(props: { value: Prize; onChange: (p: Prize) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(props.value.kind === 'custom' ? props.value.label : '');
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setTyping(false);
    setError(null);
  };
  const take = () => {
    if (!text.trim()) return setError(tr('Type what is played for, e.g. a round of beer', 'Gib ein, worum gespielt wird, z. B. Bier-Runde'));
    props.onChange(fromKind('custom', text.trim().slice(0, 30)));
    close();
  };
  const custom = props.value.kind === 'custom';
  return (
    <>
      <SettingsRow label={tr('Played for', 'Worum wird gespielt')} value={prizeName(props.value)} onClick={() => setOpen(true)} disabled={props.disabled} />
      {open && (
        <PickSheet<PrizeKind>
          title={tr('Played for', 'Worum wird gespielt')}
          current={typing ? 'custom' : kindOf(props.value)}
          options={[
            ...PRIZE_CHOICES().map((c) => ({ value: c.kind, name: c.name, text: c.text })),
            { value: 'custom' as const, name: custom ? tr(`Own stake: ${prizeName(props.value)}`, `Eigener Einsatz: ${prizeName(props.value)}`) : tr('Own stake …', 'Eigener Einsatz …'), text: tr('Typed by you – e.g. a round of beer, caddying', 'Frei eingegeben – z. B. Bier-Runde, Caddie spielen') },
          ]}
          onPick={(k) => {
            if (k === 'custom') {
              setTyping(true);
              return;
            }
            props.onChange(fromKind(k));
            close();
          }}
          onClose={close}
        >
          {typing && (
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
                onKeyDown={(e) => e.key === 'Enter' && take()}
              />
              <button type="button" className="btn-secondary" onClick={take}>
                {tr('Use', 'Übernehmen')}
              </button>
            </div>
          )}
          {error && (
            <span className="small bad-text" role="alert">
              {error}
            </span>
          )}
        </PickSheet>
      )}
    </>
  );
}
