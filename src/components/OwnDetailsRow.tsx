import { SaveButton } from './ui';
import { useState } from 'react';
import { tr } from '../lib/i18n';
import { ownKey } from '../lib/owndetails';
import { SettingsRow, ToggleList, ToggleRow } from './Settings';

/** "Eigene Detailerfassung" under "Einer für alle" (Sascha 07.11.2026): the players who still enter their own details –
 *  putts, tee shot, sand – for their own analysis; the scorer's count stays the score. One row, its sheet a switch per
 *  player – the same in Rounds, Tournaments and Games. `value`: the names (lower case, lib/owndetails ownKey). */
export function OwnDetailsRow(props: { names: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const names = [...new Set(props.names.map((n) => n.trim()).filter(Boolean))];
  const on = names.filter((n) => props.value.includes(ownKey(n)));
  return (
    <>
      <SettingsRow label={tr('Own details', 'Eigene Detailerfassung')} value={on.length ? on.join(', ') : tr('Nobody', 'Niemand')} onClick={() => setOpen(true)} disabled={!names.length} />
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Own details', 'Eigene Detailerfassung')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Own details', 'Eigene Detailerfassung')}</strong>
              <span className="sheet-head-acts">
                <SaveButton label={tr('Done', 'Fertig')} onClick={() => setOpen(false)} />
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(false)}>
                  ✕
                </button>
              </span>
            </div>
            <span className="muted small">
              {tr("Who also enters his own putts, tee shot and sand on his phone – for his own analysis; the scorer's count stays the score.", 'Wer zusätzlich auf seinem Handy Putts, Abschlag und Sand für die eigene Auswertung erfasst – die Zählung des Schreibers bleibt der Score.')}
            </span>
            <ToggleList>
              {names.map((n) => (
                <ToggleRow
                  key={n}
                  inList
                  label={n}
                  on={props.value.includes(ownKey(n))}
                  onChange={(v) => props.onChange(v ? [...new Set([...props.value, ownKey(n)])] : props.value.filter((x) => x !== ownKey(n)))}
                />
              ))}
            </ToggleList>
          </section>
        </div>
      )}
    </>
  );
}
