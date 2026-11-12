import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { currencyCatalogue, currencyName, ECB } from '../lib/currencies';
import { symOf } from '../lib/fx';
import { SettingsRow } from './Settings';

// "Währung" in the profile (Sascha 12.11.2026: "den ganzen Währungskatalog anbieten – ISO-Liste mit Namen, durchsuchbar;
// EUR, USD, GBP, CHF zuerst"): a row like every setting, its sheet with a search field over code and name. "Keine" stays
// first – each game and bet in its own currency; a currency the European Central Bank has no rate for says so.

const label = (code: string) => {
  const sym = symOf(code);
  return sym && sym !== code ? `${currencyName(code)} (${sym})` : `${currencyName(code)} (${code})`;
};

export function CurrencyRow(props: { value: string | undefined; onChange: (code: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsRow label={tr('Currency', 'Währung')} value={props.value ? label(props.value) : tr('None', 'Keine')} onClick={() => setOpen(true)} />
      {open && (
        <CurrencySheet
          value={props.value}
          onPick={(c) => {
            setOpen(false);
            if (c !== props.value) props.onChange(c);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CurrencySheet(props: { value: string | undefined; onPick: (code: string | undefined) => void; onClose: () => void }) {
  // the whole catalogue as a list, no search field (Sascha 13.11.2026: "Entferne die Suche")
  const shown = useMemo(currencyCatalogue, []);
  const tick = (
    <span className="pick-check" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
  const text = (code: string) => (ECB.has(code) ? code : `${code} · ${tr('no daily rate of the ECB – amounts stay as they are', 'kein Tageskurs der EZB – Beträge bleiben, wie sie sind')}`);
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet currency-sheet" role="dialog" aria-label={tr('Currency', 'Währung')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Currency', 'Währung')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">{tr('"Bilanz" converts games and bets in another currency to it – at the rate of the day they end.', '„Bilanz“ rechnet Spiele und Wetten in einer anderen Währung hierhin um – zum Kurs des Tages, an dem sie enden.')}</span>
        <div className="pick-list">
          {(
            <button type="button" className="pick-option" aria-pressed={!props.value} onClick={() => props.onPick(undefined)}>
              <span className="grow">
                <strong>{tr('None', 'Keine')}</strong>
                <span className="muted small">{tr('Every game and bet in its own currency', 'Jedes Spiel und jede Wette in seiner Währung')}</span>
              </span>
              {!props.value && tick}
            </button>
          )}
          {shown.map((c) => (
            <button key={c.code} type="button" className="pick-option" data-code={c.code} aria-pressed={props.value === c.code} onClick={() => props.onPick(c.code)}>
              <span className="grow">
                <strong>{label(c.code)}</strong>
                <span className="muted small">{text(c.code)}</span>
              </span>
              {props.value === c.code && tick}
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
