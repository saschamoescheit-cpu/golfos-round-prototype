import type { ReactNode } from 'react';
import { ACTION_ICONS } from '../components/ActionBar';

// The action bar of Agility (Facelift 11.11.2026, a5/a6/a7/a10): the app's one bar `.sc-actions` / `.sc-action` as in
// ActionBar (components/ActionBar.tsx) – side by side, the icon over a short word, the red one last – with the few icons
// only Agility needs (pause, it hurts, into Training), kept here so the shared icon set stays as it is.

const svg = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const MOB_ICONS = {
  ...ACTION_ICONS,
  // pausing: the two bars, as "Pausieren" in the round's leave sheet
  pause: svg(<path d="M9 5v14M15 5v14" />),
  // it hurts: the warning sign
  hurt: svg(
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>,
  ),
  // into Training: the plus
  add: svg(<path d="M12 5v14M5 12h14" />),
  // open another module: the arrow on
  open: svg(<path d="M5 12h14M13 6l6 6-6 6" />),
  // back a step: the arrow round to the left, as "Zurück" in the round's finish question
  back: svg(
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>,
  ),
};

export interface MobAction {
  label: string;
  /** what a screen reader says when the word alone is too short */
  aria?: string;
  icon: keyof typeof MOB_ICONS;
  danger?: boolean;
  disabled?: boolean;
  /** a class of its own (for the tests) */
  className?: string;
  onClick: () => void;
}

/** One row of actions, at most four, the red one last. */
export function MobActionBar(props: { label: string; actions: (MobAction | false | null | undefined)[]; className?: string }) {
  const shown = props.actions.filter((a): a is MobAction => !!a);
  if (!shown.length) return null;
  return (
    <div className={`sc-actions${props.className ? ` ${props.className}` : ''}`} role="group" aria-label={props.label}>
      {shown.map((a) => (
        <button key={a.label} type="button" className={`sc-action${a.danger ? ' danger' : ''}${a.className ? ` ${a.className}` : ''}`} aria-label={a.aria} disabled={a.disabled} onClick={a.onClick}>
          {MOB_ICONS[a.icon]}
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The warning sign of pain (TPI: its own result) – in the red circle instead of a "!". */
export function PainIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </svg>
  );
}

/** The tick of a met criterion or a tip – an SVG, not the "✓" glyph. */
export function TickIcon(props: { size?: number; className?: string }) {
  const s = props.size ?? 16;
  return (
    <svg className={props.className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The trend of a retest against the physio: up better, down worse, level the same, both ways mixed. */
export function TrendIcon(props: { kind: 'better' | 'same' | 'worse' | 'mixed' | 'open' }) {
  const d = props.kind === 'better' ? 'M12 19V5M6 11l6-6 6 6' : props.kind === 'worse' ? 'M12 5v14M6 13l6 6 6-6' : props.kind === 'same' ? 'M5 9h14M5 15h14' : props.kind === 'mixed' ? 'M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4' : '';
  if (!d) return null;
  return (
    <svg className="mob-trend" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
