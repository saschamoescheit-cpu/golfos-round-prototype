import type { PuttStats } from '../lib/puttstats';
import { dec, tr } from '../lib/i18n';

// The putter in the clubs list (Sascha 24.10.2026): how often a putt goes in from each distance, and from each length of
// the first putt how many putts the hole took – one (green), two, three and more (red).

const W = 320;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
const short = (label: string) => label.replace(' m', '');

/** Putts holed per distance band: a column each, the share on top, the number of putts below. */
export function PuttMakeChart(props: { stats: PuttStats }) {
  const bands = props.stats.bands;
  const H = 170;
  const top = 22;
  const base = H - 36;
  const colW = W / bands.length;
  return (
    <svg className="spread-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Putts holed by distance', 'Eingelocht nach Entfernung')}>
      <line x1={0} x2={W} y1={base} y2={base} className="spread-grid" />
      <line x1={0} x2={W} y1={top + (base - top) / 2} y2={top + (base - top) / 2} className="spread-grid" />
      <text x={4} y={top + (base - top) / 2 - 3} className="spread-axis">50 %</text>
      {bands.map((b, k) => {
        const p = pct(b.holed, b.tried);
        const h = p == null ? 0 : Math.max(2, ((base - top) * p) / 100);
        const x = k * colW + colW * 0.2;
        return (
          <g key={b.label}>
            {p != null && <rect x={x} y={base - h} width={colW * 0.6} height={h} rx={4} className="putt-bar" />}
            <text x={k * colW + colW / 2} y={p == null ? base - 6 : base - h - 5} textAnchor="middle" className="spread-label">
              {p == null ? '–' : `${p}%`}
            </text>
            <text x={k * colW + colW / 2} y={base + 14} textAnchor="middle" className="spread-axis">
              {dec(short(b.label))}
            </text>
            <text x={k * colW + colW / 2} y={base + 27} textAnchor="middle" className="spread-axis">
              {b.tried ? `${b.tried}×` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** From each length of the first putt: one, two, three and more putts as one bar. */
export function PuttCountChart(props: { stats: PuttStats }) {
  const rows = props.stats.bands;
  const rowH = 22;
  const H = rows.length * rowH + 8;
  const left = 52;
  const right = 34;
  const span = W - left - right;
  return (
    <svg className="spread-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Putts per hole by the length of the first putt', 'Putts je Loch nach Länge des ersten Putts')}>
      {rows.map((b, k) => {
        const y = 6 + k * rowH;
        const parts = [
          { n: b.one, cls: 'putt-one' },
          { n: b.two, cls: 'putt-two' },
          { n: b.three, cls: 'putt-three' },
        ];
        let x = left;
        return (
          <g key={b.label}>
            <text x={6} y={y + 13} className="spread-axis">{dec(b.label)}</text>
            <rect x={left} y={y + 3} width={span} height={12} rx={6} className="putt-track" />
            {b.holes > 0 &&
              parts.map((pt) => {
                const w = (span * pt.n) / b.holes;
                const r = <rect key={pt.cls} x={x} y={y + 3} width={w} height={12} className={pt.cls} />;
                x += w;
                return pt.n ? r : null;
              })}
            <text x={W - 4} y={y + 13} textAnchor="end" className="spread-axis">{b.holes || '–'}</text>
          </g>
        );
      })}
    </svg>
  );
}
