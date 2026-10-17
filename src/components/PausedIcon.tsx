// The mark of a paused round in the rounds list (Sascha 17.10.2026: "in a small circle, all of it green") – drawn like
// the seal of a signed round beside it.
export function PausedIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.8 8.6v6.8M14.2 8.6v6.8" />
    </svg>
  );
}
