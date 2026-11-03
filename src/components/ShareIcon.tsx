// The share icon (03.11.2026: "Link teilen as an icon – the ways to share behind it"): a box with an arrow up, as the
// phone's own share button – the invitation of a round, the friend code.
export function ShareIcon(props: { size?: number }) {
  const n = props.size ?? 22;
  return (
    <svg viewBox="0 0 24 24" width={n} height={n} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
