import { useState } from 'react';
import { tr } from '../lib/i18n';
import { money } from '../lib/gameforms';
import { PickSheet, SettingsRow } from './Settings';

// The stake picker of Games (a stake per hole, a skin …), shared (02.11.2026: "one look everywhere" – a bet's stake
// the same as a game's): the usual amounts as chips in a SheetRow's sheet, "other …" typed in and checked.
const STAKES = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10];

/** The stake: the usual amounts as chips, any other typed in (Sascha 16.10.2026: "bei den Einsätzen überall eine
 *  manuelle Eingabe – analog Chicago"). */
export function StakePicker(props: { value: number; onChange: (v: number) => void; /** the amounts offered – a bet larger ones (5, 10, 20 …) */ stakes?: number[] }) {
  const stakes = props.stakes ?? STAKES;
  const custom = props.value > 0 && !stakes.includes(props.value);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const take = () => {
    const v = Number(text.replace(/[€$]/g, '').replace(/\s/g, '').replace(',', '.'));
    if (!text.trim() || !Number.isFinite(v) || v <= 0) return setError(tr('Type an amount, e.g. 3', 'Gib einen Betrag ein, z. B. 3'));
    if (v > 1000) return setError(tr(`At most ${money(1000)}.`, `Höchstens ${money(1000)}.`));
    setError(null);
    setTyping(false);
    props.onChange(Math.round(v * 100) / 100);
  };
  return (
    <>
      <div className="chip-set">
        {stakes.map((v) => (
          <button key={v} type="button" className={`chip${!typing && props.value === v ? ' on' : ''}`} aria-pressed={props.value === v} onClick={() => { setTyping(false); setError(null); props.onChange(v); }}>
            {v ? money(v) : tr('none', 'ohne')}
          </button>
        ))}
        <button type="button" className={`chip${typing || custom ? ' on' : ''}`} aria-pressed={typing || custom} onClick={() => { setTyping(true); setText(custom ? String(props.value).replace('.', tr('.', ',')) : ''); }}>
          {custom && !typing ? money(props.value) : tr('other …', 'anderer …')}
        </button>
      </div>
      {typing && (
        <div className="cap-input">
          <input
            className="input"
            inputMode="decimal"
            autoFocus
            aria-label={tr('Stake in euros', 'Einsatz in Euro')}
            placeholder="3"
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && take()}
          />
          <button type="button" className="btn-secondary" onClick={take}>
            {tr('Use', 'Übernehmen')}
          </button>
        </div>
      )}
      {error && <span className="small bad-text" role="alert">{error}</span>}
    </>
  );
}

/** The stake as a row with its list (Sascha 03.11.2026: "the stake's sheet looks other than the other menus" – the
 *  amounts as the options of "Vorgabe", the chosen one ticked; "Anderer Betrag …" typed in below). One tap picks and
 *  closes, as every other row. */
export function StakeRow(props: { label: string; value: number; onChange: (v: number) => void; stakes?: number[]; disabled?: boolean; /** "$" or "× Getränk" – not money: counted (03.11.2026) */ sym?: string }) {
  const count = !!props.sym && props.sym.startsWith('×');
  const m = (v: number) => money(v, props.sym);
  const stakes = props.stakes ?? STAKES;
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const custom = props.value > 0 && !stakes.includes(props.value);
  const OTHER = -1;
  const close = () => {
    setOpen(false);
    setTyping(false);
    setError(null);
  };
  const take = () => {
    const v = Number(text.replace(/[€$]/g, '').replace(/\s/g, '').replace(',', '.'));
    if (!text.trim() || !Number.isFinite(v) || v <= 0) return setError(count ? tr('Type a number, e.g. 2', 'Gib eine Anzahl ein, z. B. 2') : tr('Type an amount, e.g. 3', 'Gib einen Betrag ein, z. B. 3'));
    if (v > (count ? 20 : 1000)) return setError(tr(`At most ${m(count ? 20 : 1000)}.`, `Höchstens ${m(count ? 20 : 1000)}.`));
    props.onChange(count ? Math.round(v) : Math.round(v * 100) / 100);
    close();
  };
  return (
    <>
      <SettingsRow label={props.label} value={props.value ? m(props.value) : tr('none', 'ohne')} onClick={() => setOpen(true)} disabled={props.disabled} />
      {open && (
        <PickSheet<number>
          title={props.label}
          current={typing || custom ? OTHER : props.value}
          options={[
            ...stakes.map((v) => ({ value: v, name: v ? m(v) : tr('None', 'Ohne') })),
            count
              ? { value: OTHER, name: custom ? tr(`Other number: ${m(props.value)}`, `Andere Anzahl: ${m(props.value)}`) : tr('Other number …', 'Andere Anzahl …') }
              : { value: OTHER, name: custom ? tr(`Other amount: ${m(props.value)}`, `Anderer Betrag: ${m(props.value)}`) : tr('Other amount …', 'Anderer Betrag …') },
          ]}
          onPick={(v) => {
            if (v === OTHER) {
              setTyping(true);
              setText(custom ? money(props.value).replace(/ [€$]$/, '') : '');
              return;
            }
            props.onChange(v);
            close();
          }}
          onClose={close}
        >
          {typing && (
            <div className="cap-input">
              <input
                className="input"
                inputMode={count ? 'numeric' : 'decimal'}
                autoFocus
                aria-label={count ? tr('The number', 'Die Anzahl') : tr('The amount', 'Der Betrag')}
                placeholder="3"
                value={text}
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
