// The weather on the map as a line drawing in the text colour, like the menu icons (Sascha 15.10.2026) – no
// coloured emoji: the sun was yellow-orange, the app's CI has no yellow (Sascha 16.10.2026).

const SUN = <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>;
const CLOUD = <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 11 3.5 3.5 0 0 0 7 18z" />;

/** Open-Meteo weather code → a line icon (sun, sun and cloud, cloud, fog, thunder, snow, rain). */
export function WeatherIcon(props: { code: number; size?: number }) {
  const c = props.code;
  const body =
    c === 0 ? SUN
    : c <= 2 ? <><path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1" /><path d="M5.6 10.4A3 3 0 0 1 10.6 7" /><path d="M8 20h9a3.6 3.6 0 0 0 .3-7.2A5 5 0 0 0 8 13.3 3.3 3.3 0 0 0 8 20z" /></>
    : c === 3 ? CLOUD
    : c === 45 || c === 48 ? <path d="M4 9h16M3 13h18M5 17h14" />
    : c >= 95 ? <>{CLOUD}<path d="M12 14l-2 4h3l-2 4" transform="translate(0 -2)" /></>
    : c >= 71 && c <= 77 ? <>{CLOUD}<path d="M9 21h.01M12 22h.01M15 21h.01" transform="translate(0 -1)" /></>
    : c >= 51 ? <><path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 8 3.5 3.5 0 0 0 7 15z" /><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" /></>
    : <><path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1" /><path d="M5.6 10.4A3 3 0 0 1 10.6 7" /><path d="M8 20h9a3.6 3.6 0 0 0 .3-7.2A5 5 0 0 0 8 13.3 3.3 3.3 0 0 0 8 20z" /></>;
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-3px' }}>
      {body}
    </svg>
  );
}
