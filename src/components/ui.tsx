import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';

export function Stepper(props: {
  value: number | null;
  placeholder?: number;
  min?: number;
  onChange: (v: number) => void;
  compact?: boolean;
  label: string;
}) {
  const { value, placeholder, min = 0, onChange, compact, label } = props;
  const base = value ?? placeholder ?? min;
  return (
    <div className={`stepper${compact ? ' compact' : ''}`} role="group" aria-label={label}>
      <button type="button" aria-label={tr(`${label} minus one`, `${label} minus eins`)} disabled={base <= min} onClick={() => onChange(Math.max(min, base - 1))}>
        −
      </button>
      <span className={`value${value == null ? ' placeholder' : ''}`} aria-live="polite">
        {value ?? placeholder ?? '–'}
      </span>
      <button type="button" aria-label={tr(`${label} plus one`, `${label} plus eins`)} onClick={() => onChange(base + 1)}>
        +
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(props.value === o.value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Like Segmented, but the options wrap to further lines – for more options than fit side by side on a small phone
 *  (the app's chips: green when chosen). A second tap clears the choice. */
export function Chips<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  label: string;
}) {
  return (
    <div className="chip-row wrap chips-field" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(props.value === o.value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Saving – a round button in the signal colour with the disc (Sascha 04.11.2026: "instead of a 'Fertig' button a round
 *  circle with the save symbol, as when editing – everywhere in the app"). */
export function SaveButton(props: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn save-circle" aria-label={props.label ?? tr('Save', 'Speichern')} onClick={props.onClick} disabled={props.disabled}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
        <path d="M8 4v5h7V4M8 20v-6h8v6" />
      </svg>
    </button>
  );
}

export function TopBar(props:{ title: ReactNode; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <div className="topbar">
      {props.onBack && (
        <button type="button" className="icon-btn" aria-label={props.backLabel ?? tr('Back', 'Zurück')} onClick={props.onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <h1>{props.title}</h1>
      {props.right}
    </div>
  );
}

export function Attribution() {
  return <p className="attribution">{tr('Course data', 'Platzdaten')} © OpenStreetMap contributors (ODbL) · OpenGolfAPI</p>;
}

export function formatToPar(n: number): string {
  if (n === 0) return tr('E', 'Par');
  return n > 0 ? `+${n}` : String(n);
}
