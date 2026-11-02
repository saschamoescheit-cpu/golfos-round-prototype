// The marks of a bet in the standing (Sascha 02.11.2026: "a 1 for the bets made makes no sense – a nice icon, and one
// for a bet not made yet, in the style of the app's icons"): drawn like the seal of a signed round (SignedIcon) – made:
// the seal with its check; still open: a target, the shot still to play; over and missed: the circle struck through.

/** Still open – a target. */
export function BetOpenIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Over and not made – the circle struck through. */
export function BetMissedIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18L18 6" />
    </svg>
  );
}
