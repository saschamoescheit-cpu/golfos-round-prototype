import { tr } from '../lib/i18n';
import { t } from './ui';
import type { LieChart, LieKind } from './types';

// The overview "lie and grass → ball position and club" at the top of a topic's shots (Sascha 15.11.2026: "How do
// ball position and club choice change with the lie and the height of the grass?"). Per row: the lie drawn from the
// side, the stance from above with the ball position (target to the right, right-hander), the club and one line.

const GRASS = '#6ea545';
const GRASS_DARK = '#3d6b22';
const SOIL = '#a07a4a';
const LAWN = '#8cc95c'; // the grass seen from above, as in the sketches

/** grass blades from x0 to x1, height h, standing on the ground at y = 40 */
function blades(x0: number, x1: number, h: number, step = 3.2) {
  const out: JSX.Element[] = [];
  for (let x = x0, i = 0; x <= x1; x += step, i++) {
    const lean = i % 2 ? 1.2 : -1.2;
    const hh = h * (0.8 + 0.2 * ((i * 7) % 3));
    out.push(<path key={x} d={`M${x.toFixed(1)} 40 q ${lean} ${(-hh / 2).toFixed(1)} ${(lean * 1.6).toFixed(1)} ${(-hh).toFixed(1)}`} stroke={i % 3 ? GRASS : GRASS_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />);
  }
  return out;
}

const Ball = (p: { cx: number; cy: number }) => <circle cx={p.cx} cy={p.cy} r="5.5" fill="#fff" stroke="#55606a" strokeWidth="1.1" />;

/** the lie from the side */
export function LiePicture(p: { lie: LieKind }) {
  const g = <rect x="0" y="40" width="80" height="10" fill={p.lie === 'bare' ? SOIL : GRASS_DARK} />;
  let body: JSX.Element;
  switch (p.lie) {
    case 'short':
      body = (
        <>
          {blades(2, 78, 3)}
          <Ball cx={40} cy={34} />
        </>
      );
      break;
    case 'up':
      body = (
        <>
          {blades(2, 78, 12)}
          <Ball cx={40} cy={26} />
        </>
      );
      break;
    case 'down':
      body = (
        <>
          <Ball cx={40} cy={36} />
          {blades(2, 78, 15, 2.6)}
        </>
      );
      break;
    case 'collar':
      body = (
        <>
          {blades(2, 46, 3)}
          {blades(48, 78, 15, 2.6)}
          <Ball cx={38} cy={34} />
        </>
      );
      break;
    case 'bare':
      body = (
        <>
          {blades(2, 16, 3)}
          {blades(64, 78, 3)}
          <Ball cx={40} cy={34} />
        </>
      );
      break;
    case 'divot':
      body = (
        <>
          {blades(2, 26, 3)}
          {blades(56, 78, 3)}
          <path d="M26 40 Q41 50 56 40 Z" fill={SOIL} />
          <Ball cx={41} cy={38} />
        </>
      );
      break;
    default:
      body = (
        <>
          {blades(2, 78, 4)}
          <Ball cx={40} cy={33} />
          <path d="M20 22 q2 4 0 5 q-2 -1 0 -5 M60 18 q2 4 0 5 q-2 -1 0 -5" fill="#4a90c8" />
        </>
      );
  }
  return (
    <svg className="tr-lie-pic" viewBox="0 0 80 50" role="img" aria-hidden="true">
      <rect x="0" y="0" width="80" height="50" rx="6" fill="#cfe6f5" />
      {g}
      {body}
    </svg>
  );
}

/** the stance from above: the trail foot left, the lead foot right, the ball where it goes (−1 … 1) */
export function StancePicture(p: { ball: number }) {
  const x = 45 + Math.max(-1, Math.min(1, p.ball)) * 20;
  return (
    <svg className="tr-lie-pic" viewBox="0 0 90 50" role="img" aria-hidden="true">
      <rect x="0" y="0" width="90" height="50" rx="6" fill={LAWN} />
      <line x1="25" y1="14" x2="65" y2="14" stroke="#ffffff99" strokeWidth="1" strokeDasharray="2 2" />
      <ellipse cx="25" cy="34" rx="5.5" ry="10" fill="#2b3a44" />
      <ellipse cx="65" cy="34" rx="5.5" ry="10" fill="#2b3a44" />
      <line x1={x} y1="20" x2={x} y2="44" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="2 2" />
      <circle cx={x} cy="14" r="4.6" fill="#fff" stroke="#55606a" strokeWidth="1" />
      <path d="M74 6 h9 m-3 -3 l3 3 l-3 3" stroke="#10210c" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function LieChartView(p: { chart: LieChart }) {
  return (
    <section className="card tr-lie" aria-label={t(p.chart.title)}>
      <span className="eyebrow">{t(p.chart.title)}</span>
      <div className="tr-lie-head muted small">
        <span>{tr('Lie', 'Lage')}</span>
        <span>{tr('Ball position', 'Ballposition')}</span>
        <span>{tr('Club', 'Schläger')}</span>
      </div>
      {p.chart.rows.map((r, i) => (
        <div key={i} className="tr-lie-row">
          <LiePicture lie={r.lie} />
          <StancePicture ball={r.ball} />
          <div className="tr-lie-text">
            <strong>{t(r.name)}</strong>
            <span className="tr-lie-club">{t(r.club)}</span>
            <span className="muted small">{t(r.note)}</span>
          </div>
        </div>
      ))}
      {p.chart.caption && <p className="muted small">{t(p.chart.caption)}</p>}
    </section>
  );
}
