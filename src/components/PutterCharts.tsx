import type { PuttStats } from '../lib/puttstats';
import { dec, tr } from '../lib/i18n';

// The putter in the clubs list (Sascha 24.10.2026): how often a putt goes in from each distance, and from each length of
// the first putt how many putts the hole took – one (green), two, three and more (red). Reworked the same day ("optimise
// the look"): an axis of its own, the share on top of the column, no column for 0 %, the number of putts and holes
// named.

const W = 320;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
const short = (label: string) => label.replace(' m', '');

/** Putts holed per distance band: a column each, the share on it, the number of putts below. */
export function PuttMakeChart(props: { stats: PuttStats }) {
  const bands = props.stats.bands;
  const H = 200;
  const left = 34; // the axis
  const top = 24; // room for the share above the tallest column
  const base = H - 46;
  const span = W - left - 6;
  const colW = span / bands.length;
  const y = (p: number) => base - ((base - top) * p) / 100;
  return (
    <svg className="spread-chart putt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Putts holed by distance', 'Eingelocht nach Entfernung')}>
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={left} x2={W - 6} y1={y(p)} y2={y(p)} className={p === 0 ? 'putt-base' : 'spread-grid'} />
          <text x={left - 6} y={y(p) + 4} textAnchor="end" className="spread-axis">
            {p}%
          </text>
        </g>
      ))}
      {bands.map((b, k) => {
        const p = pct(b.holed, b.tried);
        const cx = left + k * colW + colW / 2;
        const bw = colW * 0.62;
        const h = p ? y(0) - y(p) : 0;
        return (
          <g key={b.label}>
            {h > 0 && <path d={`M${cx - bw / 2} ${base} V${base - h + 5} q0 -5 5 -5 H${cx + bw / 2 - 5} q5 0 5 5 V${base} Z`} className="putt-bar" />}
            <text x={cx} y={base - h - 6} textAnchor="middle" className={p == null ? 'putt-val none' : 'putt-val'}>
              {p == null ? '–' : `${p}%`}
            </text>
            <text x={cx} y={base + 16} textAnchor="middle" className="spread-axis">
              {dec(short(b.label))}
            </text>
            <text x={cx} y={base + 31} textAnchor="middle" className="spread-axis faint">
              {b.tried || ''}
            </text>
          </g>
        );
      })}
      <text x={left - 6} y={base + 16} textAnchor="end" className="spread-axis">m</text>
      <text x={left - 6} y={base + 31} textAnchor="end" className="spread-axis faint">
        {tr('n', 'Anz.')}
      </text>
    </svg>
  );
}

/** From each length of the first putt: one, two, three and more putts as one bar, the number of holes in each part. */
export function PuttCountChart(props: { stats: PuttStats }) {
  const rows = props.stats.bands;
  const rowH = 26;
  const head = 18;
  const H = head + rows.length * rowH + 4;
  const left = 50;
  const right = 40;
  const span = W - left - right;
  return (
    <svg className="spread-chart putt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Putts per hole by the length of the first putt', 'Putts je Loch nach Länge des ersten Putts')}>
      <text x={8} y={13} className="spread-axis faint">{tr('first putt', '1. Putt')}</text>
      <text x={W - 8} y={13} textAnchor="end" className="spread-axis faint">{tr('holes', 'Löcher')}</text>
      {rows.map((b, k) => {
        const y = head + k * rowH;
        const parts = [
          { n: b.one, cls: 'putt-one' },
          { n: b.two, cls: 'putt-two' },
          { n: b.three, cls: 'putt-three' },
        ];
        let x = left;
        return (
          <g key={b.label}>
            <text x={8} y={y + 15} className="spread-axis">{dec(b.label)}</text>
            <rect x={left} y={y + 3} width={span} height={16} rx={5} className="putt-track" />
            <clipPath id={`putt-row-${k}`}>
              <rect x={left} y={y + 3} width={span} height={16} rx={5} />
            </clipPath>
            {b.holes > 0 && (
              <g clipPath={`url(#putt-row-${k})`}>
                {parts.map((pt) => {
                  const w = (span * pt.n) / b.holes;
                  const seg = pt.n ? (
                    <g key={pt.cls}>
                      <rect x={x} y={y + 3} width={w} height={16} className={pt.cls} />
                      {w >= 16 && (
                        <text x={x + w / 2} y={y + 15} textAnchor="middle" className="putt-seg">
                          {pt.n}
                        </text>
                      )}
                    </g>
                  ) : null;
                  x += w;
                  return seg;
                })}
              </g>
            )}
            <text x={W - 8} y={y + 15} textAnchor="end" className="spread-axis">{b.holes || '–'}</text>
          </g>
        );
      })}
    </svg>
  );
}
