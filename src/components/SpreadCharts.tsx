import type { ClubReport } from '../lib/clubstats';
import { clubSpread, type ClubSpread } from '../lib/spread';
import { clubCode, tr } from '../lib/i18n';

// The spread as a picture (Sascha 23.10.2026, with a fairway-dispersion chart and a "dispersion triangle" as examples):
// one cone over all clubs – each club's 80 % ellipse at its length, widening with the length – and per club its shots
// around the target line. Own shots solid, an estimate from the handicap dashed.

const W = 320;

/** All clubs in one picture: from the ball (bottom middle) up to each club's ellipse at its typical length. */
export function SpreadCone(props: { reports: ClubReport[]; playing: number | null }) {
  const clubs = props.reports.filter((c) => c.median >= 40).sort((a, b) => a.median - b.median);
  if (!clubs.length) return null;
  const spreads = clubs.map((c) => ({ c, s: clubSpread(c.club, c.median, c, props.playing) }));
  const maxLen = Math.max(...clubs.map((c) => c.median + 20));
  const maxSide = Math.max(30, ...spreads.map(({ s }) => Math.max(-s.side.lo, s.side.hi) + 5));
  const H = 360;
  const top = 14;
  const bottom = H - 22;
  const y = (m: number) => bottom - (m / maxLen) * (bottom - top);
  const x = (m: number) => W / 2 + (m / maxSide) * (W / 2 - 40);
  const ky = (bottom - top) / maxLen; // px per metre in length
  const far = spreads[spreads.length - 1];
  // the club names on the right: clubs of (almost) the same length share one label ("6i · 7i")
  const labels: { y: number; text: string }[] = [];
  for (const { c } of spreads) {
    const at = y(c.median) + 4;
    const last = labels[labels.length - 1];
    if (last && Math.abs(last.y - at) < 12) last.text += ` · ${clubCode(c.club)}`;
    else labels.push({ y: at, text: clubCode(c.club) });
  }
  const step = maxLen > 200 ? 50 : 25;
  return (
    <svg className="spread-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Your spread per club', 'Deine Streuung je Schläger')}>
      {Array.from({ length: Math.floor(maxLen / step) }, (_, k) => (k + 1) * step).map((m) => (
        <g key={m}>
          <line x1={0} x2={W} y1={y(m)} y2={y(m)} className="spread-grid" />
          <text x={4} y={y(m) - 3} className="spread-axis">{m} m</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={top} y2={bottom} className="spread-mid" />
      {/* the cone: from the ball to the widest club's edges */}
      <line x1={x(0)} y1={bottom} x2={x(far.s.side.lo)} y2={y(far.c.median)} className="spread-cone" />
      <line x1={x(0)} y1={bottom} x2={x(far.s.side.hi)} y2={y(far.c.median)} className="spread-cone" />
      {spreads.map(({ c, s }) => (
        <g key={c.club}>
          <ellipse
            cx={x((s.side.lo + s.side.hi) / 2)}
            cy={y(c.median + (s.len.lo + s.len.hi) / 2)}
            rx={Math.max(3, x(s.side.hi) - x((s.side.lo + s.side.hi) / 2))}
            ry={Math.max(3, ((s.len.hi - s.len.lo) / 2) * ky)}
            className={s.shots ? 'spread-ell' : 'spread-ell est'}
          />
        </g>
      ))}
      {labels.map((l) => (
        <text key={l.text} x={W - 4} y={l.y} textAnchor="end" className="spread-label">
          {l.text}
        </text>
      ))}
      <circle cx={x(0)} cy={bottom} r={4} className="spread-ball" />
    </svg>
  );
}

/** One club: its shots around the target line (length in calm air) and the 80 % ellipse – and, when asked, the range's
 *  launch monitor shots as rings beside them (Sascha 26.10.2026: "range and course together", optional). */
export function SpreadDots(props: { report: ClubReport; spread: ClubSpread; range?: { len: number; side: number }[] }) {
  const { report: c, spread: s } = props;
  const pts = c.points;
  const range = props.range ?? [];
  const H = 150;
  const lens = [...pts.map((p) => p.len), ...range.map((p) => p.len)];
  const lo = Math.min(c.median + s.len.lo, ...lens) - 10;
  const hi = Math.max(c.median + s.len.hi, ...lens) + 10;
  const maxSide = Math.max(20, ...pts.map((p) => Math.abs(p.side) + 5), ...range.map((p) => Math.abs(p.side) + 5), -s.side.lo + 5, s.side.hi + 5);
  const x = (m: number) => W / 2 + (m / maxSide) * (W / 2 - 12);
  const y = (m: number) => H - 16 - ((m - lo) / (hi - lo)) * (H - 28);
  const tick = maxSide > 45 ? 40 : 20;
  return (
    <svg className="spread-chart dots" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr(`${pts.length} shots around the target line`, `${pts.length} Schläge um die Ziellinie`)}>
      {[-tick, tick].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={6} y2={H - 16} className="spread-grid" />
          <text x={t < 0 ? 4 : W - 4} y={H - 3} textAnchor={t < 0 ? 'start' : 'end'} className="spread-axis">{Math.abs(t)} m {t < 0 ? tr('L', 'L') : tr('R', 'R')}</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={6} y2={H - 16} className="spread-mid" />
      <ellipse
        cx={x((s.side.lo + s.side.hi) / 2)}
        cy={y(c.median + (s.len.lo + s.len.hi) / 2)}
        rx={Math.max(3, x(s.side.hi) - x((s.side.lo + s.side.hi) / 2))}
        ry={Math.max(3, ((s.len.hi - s.len.lo) / 2 / (hi - lo)) * (H - 28))}
        className={s.shots ? 'spread-ell' : 'spread-ell est'}
      />
      {range.map((p, k) => (
        <circle key={`r${k}`} cx={x(Math.max(-maxSide, Math.min(maxSide, p.side)))} cy={y(p.len)} r={4} className="spread-dot range" />
      ))}
      {pts.map((p, k) => (
        <circle key={k} cx={x(Math.max(-maxSide, Math.min(maxSide, p.side)))} cy={y(p.len)} r={4.5} className={p.strike === 'good' ? 'spread-dot good' : p.strike === 'miss' ? 'spread-dot miss' : 'spread-dot'} />
      ))}
      <text x={4} y={y(c.median) + 4} className="spread-axis">{c.median} m</text>
    </svg>
  );
}
