import type { ReactNode } from 'react';

// The actions of a screen in one bar (Sascha 03.11.2026: "three buttons side by side with icons in one menu, three
// text-only buttons one under the other elsewhere – that cannot be"): as the scorecard of Rounds – side by side, the
// same width, the icon over a short word; the destructive one red and last. docs/DESIGN.md.

const svg = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

/** The icons of the actions – one per meaning, the same everywhere. */
export const ACTION_ICONS = {
  // the share of the scorecard: the arrow out of the box
  share: svg(
    <>
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </>,
  ),
  // the green pen
  edit: svg(<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10zM14 7l3 3" />),
  // saving: the disc, as the round save button – not a check (Sascha 04.11.2026: "a save symbol instead of a check, in the whole app")
  save: svg(
    <>
      <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>,
  ),
  // finished: the flag on the green
  finish: svg(
    <>
      <path d="M8 21V3l9 4-9 4" />
      <path d="M4 21h8" />
    </>,
  ),
  // open again: the arrow back round
  reopen: svg(
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </>,
  ),
  // parted: the chain broken
  dissolve: svg(
    <>
      <path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2" />
      <path d="M12 4v3M12 17v3" />
    </>,
  ),
  // the bin of the scorecard
  delete: svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />),
  // the birdie book: an open book
  book: svg(<path d="M12 6c-2-1.3-4.7-1.8-8-1.5v13c3.3-.3 6 .2 8 1.5 2-1.3 4.7-1.8 8-1.5v-13c-3.3-.3-6 .2-8 1.5zM12 6v13" />),
  // the course preview: the eye
  preview: svg(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  // planning the round: the flag with its target
  plan: svg(
    <>
      <path d="M6 21V4l10 3.5L6 11" />
      <circle cx="17" cy="17" r="3" />
    </>,
  ),
  // Facelift 11.11.2026 – play: adding (a shot, a target), the hole map, the scorecard, a note
  add: svg(<path d="M12 5v14M5 12h14" />),
  map: svg(<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />),
  card: svg(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>,
  ),
  note: svg(<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4" />),
};

export interface Action {
  label: string;
  /** what a screen reader says when the word alone is too short */
  aria?: string;
  icon: keyof typeof ACTION_ICONS;
  /** red – deleting, finishing; put it last */
  danger?: boolean;
  disabled?: boolean;
  /** a green dot on the icon – there is something (a hole note) */
  dot?: boolean;
  onClick: () => void;
}

/** One row of actions: `.sc-actions` / `.sc-action` (styles.css), at most four. */
export function ActionBar(props: { label: string; actions: (Action | false | null | undefined)[] }) {
  const shown = props.actions.filter((a): a is Action => !!a);
  if (!shown.length) return null;
  return (
    <div className="sc-actions" role="group" aria-label={props.label}>
      {shown.map((a) => (
        <button key={a.label} type="button" className={`sc-action${a.danger ? ' danger' : ''}`} aria-label={a.aria} disabled={a.disabled} onClick={a.onClick}>
          {ACTION_ICONS[a.icon]}
          <span>{a.label}</span>
          {a.dot && <i className="note-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
