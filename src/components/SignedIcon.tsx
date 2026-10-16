// The seal of a signed round (Sascha 16.10.2026: "signierte Runden könnten ein extra Icon erhalten"): a rosette with a
// check, in the brand green.
export function SignedIcon(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l2.1 1.6 2.6-.3 1 2.4 2.4 1-.3 2.6 1.6 2.2-1.6 2.1.3 2.6-2.4 1-1 2.4-2.6-.3L12 21.5l-2.1-1.6-2.6.3-1-2.4-2.4-1 .3-2.6L2.6 12l1.6-2.1-.3-2.6 2.4-1 1-2.4 2.6.3z" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
    </svg>
  );
}
