// The marks of a round in the rounds list, drawn like the seal of a signed round (SignedIcon) and the pause mark
// (PausedIcon); the tiles above the list carry the same marks, so they are the legend (Sascha 17.10.2026: "a green
// symbol instead of the green text").

/** Shots still to check: a magnifier. */
export function CheckShotsIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3L20.5 20.5" />
    </svg>
  );
}

/** Not signed yet: a pen. */
export function ToSignIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/** A shot noted by hand: a club with a plus – the "shot here" button, its marks on the map and in the round check. */
export function ShotHereIcon(props: { size?: number }) {
  const s = props.size ?? 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3l7 14" />
      <path d="M13 17c-.6 1.6-2.4 2.6-4.6 2.3l-.6-1.6c1.6.1 3-.3 3.8-1.4z" />
      <path d="M18 5v6M15 8h6" />
    </svg>
  );
}
