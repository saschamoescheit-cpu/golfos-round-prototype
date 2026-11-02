import { useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';

// The settings of a setup, one look everywhere (Sascha 02.11.2026: "Rounds and Games are the base – not everything
// makes sense as tabs, often it is clearer like Format in the round settings"): a list of rows "Label · value ›", each
// opening a sheet with the choices and what they mean; a day as a row too (the phone's date picker); a yes/no as a
// switch with its explanation. See docs/DESIGN.md.

/** The rows' box (`settings-list`). */
export function SettingsList(props: { children: ReactNode; label?: string }) {
  return (
    <div className="settings-list" role={props.label ? 'group' : undefined} aria-label={props.label}>
      {props.children}
    </div>
  );
}

/** One row: "Label · value ›" – tapped, it opens what it stands for. */
export function SettingsRow(props: { label: ReactNode; value?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="settings-row" onClick={props.onClick} disabled={props.disabled}>
      <span>{props.label}</span>
      {props.value != null && <span className="settings-value">{props.value}</span>}
      <span aria-hidden="true">›</span>
    </button>
  );
}

export interface Choice<T> {
  value: T;
  name: string;
  /** what it means – one line under the name */
  text?: string;
}

/** The sheet of choices behind a row (as "Modus" or "Wer erfasst" in the round setup): the chosen one ticked. */
export function PickSheet<T>(props: { title: string; options: Choice<T>[]; current: T; onPick: (v: T) => void; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="pick-list">
          {props.options.map((o) => (
            <button key={String(o.value)} type="button" className="pick-option" aria-pressed={o.value === props.current} onClick={() => props.onPick(o.value)}>
              <span className="grow">
                <strong>{o.name}</strong>
                {o.text && <span className="muted small">{o.text}</span>}
              </span>
              {o.value === props.current && (
                <span className="pick-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        {props.children}
      </section>
    </div>
  );
}

/** A row with its own sheet of choices – the usual case: a choice of several, each with what it means. */
export function ChoiceRow<T>(props: { label: string; title?: string; options: Choice<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((o) => o.value === props.value);
  return (
    <>
      <SettingsRow label={props.label} value={current?.name ?? '–'} onClick={() => setOpen(true)} disabled={props.disabled} />
      {open && (
        <PickSheet
          title={props.title ?? props.label}
          options={props.options}
          current={props.value}
          onPick={(v) => {
            props.onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** A row whose sheet holds its own picker (a stake with "other …", a cap) – closed with "Fertig". */
export function SheetRow(props: { label: string; value: ReactNode; title?: string; children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsRow label={props.label} value={props.value} onClick={() => setOpen(true)} disabled={props.disabled} />
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <section className="sheet" role="dialog" aria-label={props.title ?? props.label} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{props.title ?? props.label}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            {props.children}
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
              {tr('Done', 'Fertig')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

/** "Mo., 2. Nov. 2026" – a day as people read it, not "2026-11-02". */
export function dayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '–';
  return new Date(y, m - 1, d).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** A day as a row: the phone's own date picker opens on a tap (iOS and Android alike). */
export function DateRow(props: { label: string; value: string; onChange: (iso: string) => void; min?: string; max?: string; id?: string }) {
  return (
    <label className="settings-row date-row">
      <span>{props.label}</span>
      <span className="settings-value">{dayText(props.value)}</span>
      <span aria-hidden="true">›</span>
      <input id={props.id} type="date" className="date-row-input" aria-label={props.label} min={props.min} max={props.max} value={props.value} onChange={(e) => e.target.value && props.onChange(e.target.value)} />
    </label>
  );
}

/** A time of day as a row ("Startzeit · 09:20 ›"): the phone's time picker. */
export function TimeRow(props: { label: string; value: string; onChange: (hhmm: string) => void; id?: string }) {
  return (
    <label className="settings-row date-row">
      <span>{props.label}</span>
      <span className="settings-value">{props.value || '–'}</span>
      <span aria-hidden="true">›</span>
      <input id={props.id} type="time" className="date-row-input" aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}

/** Several switches in one box. */
export function ToggleList(props: { children: ReactNode }) {
  return <div className="drawer-list settings-switches">{props.children}</div>;
}

/** A yes/no as a switch with what it means (as "In der Nähe anzeigen"); `inList` inside a ToggleList. */
export function ToggleRow(props: { label: string; text?: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; inList?: boolean }) {
  const row = (
    <button type="button" className="drawer-row" role="switch" aria-checked={props.on} disabled={props.disabled} onClick={() => props.onChange(!props.on)}>
      <span className="switch-label">
        <span>{props.label}</span>
        {props.text && <span className="muted small">{props.text}</span>}
      </span>
      <span className={`drawer-switch${props.on ? ' on' : ''}`} aria-hidden="true" />
    </button>
  );
  return props.inList ? row : <ToggleList>{row}</ToggleList>;
}
