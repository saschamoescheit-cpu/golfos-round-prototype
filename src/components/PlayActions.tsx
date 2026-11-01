// The buttons while something runs – a round, a game, a test, a drill, the warm-up (Sascha 1.11.2026: "buttons with
// icons like Pause II – one design in all modules is very important"): the tiles of the round's drawer, an icon above
// the word, "Finish" always last with its red square.

import type { ReactElement } from 'react';

export type PlayAct = 'pause' | 'skip' | 'end' | 'done' | 'flip';

const ICONS: Record<PlayAct, ReactElement> = {
  pause: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1.2" />
      <rect x="14" y="4" width="4" height="16" rx="1.2" />
    </svg>
  ),
  skip: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 5.2v13.6a.8.8 0 0 0 1.25.66L16 12.66a.8.8 0 0 0 0-1.32L6.25 4.54A.8.8 0 0 0 5 5.2z" />
      <rect x="16.5" y="4" width="3" height="16" rx="1.2" />
    </svg>
  ),
  end: (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
    </svg>
  ),
  done: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.5l5 5L19.5 7" />
    </svg>
  ),
  flip: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <path d="M9 13.5a3 3 0 0 0 5.6 1.2M15 12.5a3 3 0 0 0-5.6-1.2" />
      <path d="M14.6 16.4v-1.7h-1.7M9.4 9.6v1.7h1.7" />
    </svg>
  ),
};

export interface PlayButton {
  act: PlayAct;
  label: string;
  /** read by screen readers when the word alone is short ("Pause – continue later") */
  aria?: string;
  onClick: () => void;
}

export function PlayActions(props: { buttons: (PlayButton | null | false)[]; className?: string }) {
  const bs = props.buttons.filter((b): b is PlayButton => !!b);
  return (
    <div className={`drawer-actions play-actions${props.className ? ` ${props.className}` : ''}`} style={{ gridTemplateColumns: `repeat(${bs.length}, 1fr)` }}>
      {bs.map((b) => (
        <button key={b.act} type="button" className={`drawer-action ${b.act}`} onClick={b.onClick} aria-label={b.aria ?? b.label}>
          {ICONS[b.act]}
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  );
}
