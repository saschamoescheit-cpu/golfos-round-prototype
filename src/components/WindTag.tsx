import { tr } from '../lib/i18n';

/** Where the wind comes from against the line of play – diagonal winds named both ways ("Rückenwind von links"). */
export function windSide(windFromDeg: number, bearing: number, kmh: number): string {
  if (Math.round(kmh) < 5) return tr('Calm', 'Windstill');
  const rel = ((windFromDeg - bearing + 540) % 360) - 180; // 0 = from straight ahead, > 0 = from the right
  const a = Math.abs(rel);
  const side = rel > 0 ? tr('from the right', 'von rechts') : tr('from the left', 'von links');
  if (a <= 30) return tr('Into the wind', 'Gegenwind');
  if (a >= 150) return tr('Downwind', 'Rückenwind');
  if (a < 60) return tr(`Into the wind ${side}`, `Gegenwind ${side}`);
  if (a > 120) return tr(`Downwind ${side}`, `Rückenwind ${side}`);
  return tr(`Wind ${side}`, `Wind ${side}`);
}

/**
 * The wind of a hole or a shot when checking the round (Sascha 25.10.2026: "spielte wie 152 m" with where the wind came
 * from and how strong): an arrow against the direction of play – up is towards the target, so an arrow pointing down
 * blows into the player's face – then "Gegenwind 18 km/h", and the gusts when they were clearly stronger.
 */
export function WindTag(props: { w: { windKmh: number; windFromDeg: number; gustKmh?: number }; bearing: number; gusts?: boolean }) {
  const { w, bearing } = props;
  // the arrow shows where the wind blows to, turned against the line of play
  const turn = (w.windFromDeg + 180 - bearing + 360) % 360;
  const gust = props.gusts && w.gustKmh != null && w.gustKmh >= w.windKmh + 5 ? Math.round(w.gustKmh) : null;
  const calm = Math.round(w.windKmh) < 5;
  return (
    <span className="wind-tag">
      {!calm && (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${Math.round(turn)}deg)` }}>
          <path d="M12 3v18M12 3l-6 6M12 3l6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {calm ? windSide(w.windFromDeg, bearing, w.windKmh) : `${windSide(w.windFromDeg, bearing, w.windKmh)} ${Math.round(w.windKmh)} km/h`}
      {gust ? tr(` · gusts ${gust}`, ` · Böen ${gust}`) : ''}
    </span>
  );
}
