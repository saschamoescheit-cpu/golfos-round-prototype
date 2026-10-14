import type { FairwayResult } from '../types';
import { tr } from '../lib/i18n';

// The tee shot with symbols as in Hole19 (Sascha 14.10.2026): missed left, fairway (middle), missed right, out of
// bounds. Exactly one – a second tap keeps it (no toggling off), out of bounds shows black (15.10.2026).

const icon = (d: JSX.Element) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const OPTIONS: { value: FairwayResult; label: () => string; icon: JSX.Element }[] = [
  {
    value: 'left',
    label: () => tr('Left', 'Links'),
    icon: icon(
      <>
        <path d="M16 20L7.5 6" />
        <path d="M7.5 6l.2 4.6M7.5 6l4 2.3" />
      </>,
    ),
  },
  {
    value: 'hit',
    label: () => tr('Middle', 'Mitte'),
    icon: icon(
      <>
        <circle cx="12" cy="10" r="6.5" />
        <circle cx="12" cy="10" r="1.6" fill="currentColor" />
        <path d="M12 21v-4.5" />
      </>,
    ),
  },
  {
    value: 'right',
    label: () => tr('Right', 'Rechts'),
    icon: icon(
      <>
        <path d="M8 20L16.5 6" />
        <path d="M16.5 6l-.2 4.6M16.5 6l-4 2.3" />
      </>,
    ),
  },
  {
    value: 'ob',
    label: () => tr('Out of bounds', 'Aus'),
    icon: <span className="fw-ob" aria-hidden="true">OB</span>,
  },
];

export function FairwayPicker(props: { value: FairwayResult | null; onChange: (v: FairwayResult | null) => void }) {
  return (
    <div className="fw-picker" role="radiogroup" aria-label={tr('Tee shot', 'Abschlag')}>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" className={`fw-option${o.value === 'ob' ? ' ob' : ''}`} aria-pressed={props.value === o.value} aria-label={`${tr('Tee shot', 'Abschlag')}: ${o.label()}`} onClick={() => props.onChange(o.value)}>
          {o.icon}
          <small>{o.label()}</small>
        </button>
      ))}
    </div>
  );
}
