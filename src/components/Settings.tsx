import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { SaveButton } from './ui';

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

/** One row: "Label · value ›" – tapped, it opens what it stands for. `need`: a required choice not made yet – its value
 *  ("Platz wählen") in green, the one look of a required field in the app (Sascha 03.11.2026); an optional one stays grey. */
export function SettingsRow(props: { label: ReactNode; value?: ReactNode; onClick: () => void; disabled?: boolean; need?: boolean }) {
  return (
    <button type="button" className="settings-row" onClick={props.onClick} disabled={props.disabled}>
      <span>{props.label}</span>
      {props.value != null && <span className={`settings-value${props.need ? ' need' : ''}`}>{props.value}</span>}
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

/** A row with its own sheet of choices – the usual case: a choice of several, each with what it means. `prompt`: a
 *  required choice – shown in green ("Gegner wählen") while none is made. */
export function ChoiceRow<T>(props: { label: string; title?: string; options: Choice<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; prompt?: string }) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((o) => o.value === props.value);
  return (
    <>
      <SettingsRow label={props.label} value={current?.name ?? props.prompt ?? '–'} need={!current && !!props.prompt} onClick={() => setOpen(true)} disabled={props.disabled} />
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
              <span className="sheet-head-acts">
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(false)}>
                  ✕
                </button>
                <SaveButton onClick={() => setOpen(false)} />
              </span>
            </div>
            {props.children}
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

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayIso = () => {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth(), n.getDate());
};

/** A day as a row, its sheet a month in the look of GolfOS (Sascha 03.11.2026: "the date and time pickers in the design of
 *  GolfOS, in the whole app" – not the phone's wheel): ‹ month ›, the weekdays Mo–So, today ringed, the day chosen green;
 *  one tap picks it and closes. */
export function DateRow(props: { label: string; value: string; onChange: (iso: string) => void; min?: string; max?: string; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" id={props.id} className="settings-row" onClick={() => setOpen(true)}>
        <span>{props.label}</span>
        <span className="settings-value">{dayText(props.value)}</span>
        <span aria-hidden="true">›</span>
      </button>
      {open && (
        <DateSheet
          title={props.label}
          value={props.value}
          min={props.min}
          max={props.max}
          onPick={(iso) => {
            props.onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DateSheet(props: { title: string; value: string; min?: string; max?: string; onPick: (iso: string) => void; onClose: () => void }) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(props.value) ? props.value : todayIso();
  const [month, setMonth] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const locale = tr('en-GB', 'de-DE');
  const first = new Date(month.y, month.m, 1);
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const today = todayIso();
  const out = (iso: string) => (!!props.min && iso < props.min) || (!!props.max && iso > props.max);
  const step = (k: number) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + k) / 12), m: (((m + k) % 12) + 12) % 12 }));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet date-sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="date-month">
          <button type="button" className="icon-btn" aria-label={tr('Month before', 'Monat davor')} onClick={() => step(-1)}>
            ‹
          </button>
          <strong>{first.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Next month', 'Nächster Monat')} onClick={() => step(1)}>
            ›
          </button>
        </div>
        <div className="date-grid" role="grid">
          {weekdays.map((w) => (
            <span key={w} className="date-weekday muted small" aria-hidden="true">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`l${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const iso = isoOf(month.y, month.m, i + 1);
            return (
              <button
                key={iso}
                type="button"
                className={`date-day${iso === props.value ? ' on' : ''}${iso === today ? ' today' : ''}`}
                aria-pressed={iso === props.value}
                aria-label={dayText(iso)}
                disabled={out(iso)}
                onClick={() => props.onPick(iso)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        {!out(today) && today !== props.value && (
          <button type="button" className="btn-secondary" onClick={() => props.onPick(today)}>
            {tr('Today', 'Heute')}
          </button>
        )}
      </section>
    </div>
  );
}

/** A time of day as a row ("Startzeit · 09:20 ›"), its sheet in the look of GolfOS (03.11.2026): the hours and the minutes as
 *  two columns to tap – to the minute (a tee time 12:08) – and "Fertig". */
export function TimeRow(props: { label: string; value: string; onChange: (hhmm: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" id={props.id} className="settings-row" onClick={() => setOpen(true)}>
        <span>{props.label}</span>
        <span className="settings-value">{props.value || '–'}</span>
        <span aria-hidden="true">›</span>
      </button>
      {open && (
        <TimeSheet
          title={props.label}
          value={props.value}
          onDone={(v) => {
            props.onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TimeSheet(props: { title: string; value: string; onDone: (hhmm: string) => void; onClose: () => void }) {
  const [h0, m0] = /^\d{1,2}:\d{2}$/.test(props.value) ? props.value.split(':').map(Number) : [9, 0];
  const [h, setH] = useState(h0);
  const [m, setM] = useState(m0);
  const two = (n: number) => String(n).padStart(2, '0');
  const hours = useRef<HTMLDivElement>(null);
  const mins = useRef<HTMLDivElement>(null);
  // the chosen ones in view when the sheet opens
  useEffect(() => {
    for (const box of [hours.current, mins.current]) {
      const on = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (box && on) box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.clientHeight / 2;
    }
  }, []);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet time-sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <span className="sheet-head-acts">
            <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
              ✕
            </button>
            <SaveButton onClick={() => props.onDone(`${two(h)}:${two(m)}`)} />
          </span>
        </div>
        <strong className="time-shown" aria-live="polite">
          {two(h)}:{two(m)}
        </strong>
        <div className="time-cols">
          <div className="time-col" ref={hours} role="group" aria-label={tr('Hour', 'Stunde')}>
            {Array.from({ length: 24 }, (_, k) => (
              <button key={k} type="button" className={`time-cell${k === h ? ' on' : ''}`} aria-pressed={k === h} onClick={() => setH(k)}>
                {two(k)}
              </button>
            ))}
          </div>
          <div className="time-col" ref={mins} role="group" aria-label={tr('Minute', 'Minute')}>
            {Array.from({ length: 60 }, (_, k) => (
              <button key={k} type="button" className={`time-cell${k === m ? ' on' : ''}`} aria-pressed={k === m} onClick={() => setM(k)}>
                {two(k)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
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
