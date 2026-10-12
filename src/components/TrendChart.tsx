import { trendChange } from '../lib/history';
import { dec } from '../lib/i18n';

// Line chart over the player's rounds (oldest left): one or more series, a dashed trend line for a single series.
// Plain SVG – no chart library for a handful of points.

export interface Series {
  label?: string;
  color: string;
  values: (number | null)[];
}

const W = 340;
const H = 170;
const PL = 34;
const PR = 12;
const PT = 14;
const PB = 22;

export function TrendChart(props: { series: Series[]; labels: string[]; fmt: (v: number) => string; zeroLine?: boolean; ariaLabel: string }) {
  const n = props.labels.length;
  const all = props.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!n || !all.length) return null;
  let lo = Math.min(...all, ...(props.zeroLine ? [0] : []));
  let hi = Math.max(...all, ...(props.zeroLine ? [0] : []));
  if (hi - lo < 1) {
    lo -= 0.5;
    hi += 0.5;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (i: number) => (n === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (n - 1));
  const y = (v: number) => PT + ((hi - v) * (H - PT - PB)) / (hi - lo);
  // round tick values (about 3–4 of them), so that 0 shows when it is in range
  const span = hi - lo;
  const step = [0.5, 1, 2, 5, 10, 20, 50].find((st) => span / st <= 4) ?? 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  const xLabels = n >= 5 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 1 ? [0, n - 1] : [0];
  const single = props.series.length === 1 ? props.series[0] : null;
  const trend = single ? trendLine(single.values) : null;

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.ariaLabel}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={PL - 6} y={y(t) + 4} textAnchor="end" className="tick">
            {props.fmt(t)}
          </text>
        </g>
      ))}
      {props.zeroLine && lo < 0 && hi > 0 && <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 3" />}
      {xLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 5} textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="tick">
          {props.labels[i]}
        </text>
      ))}
      {trend && <line x1={x(trend.i0)} y1={y(trend.v0)} x2={x(trend.i1)} y2={y(trend.v1)} stroke={single!.color} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.6" />}
      {props.series.map((s, k) => {
        const pts = s.values.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)]]));
        return (
          <g key={k}>
            {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />}
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r="3.6" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />
            ))}
          </g>
        );
      })}
      {single &&
        (() => {
          const last = single.values.map((v, i) => [v, i] as const).filter(([v]) => v != null).pop();
          if (!last) return null;
          return (
            <text x={Math.min(x(last[1]), W - PR - 4)} y={y(last[0]!) - 9} textAnchor="end" className="last">
              {props.fmt(last[0]!)}
            </text>
          );
        })()}
    </svg>
  );
}

/** Ends of the least-squares line through the values (null below 3 values). */
function trendLine(values: (number | null)[]): { i0: number; v0: number; i1: number; v1: number } | null {
  const t = trendChange(values);
  if (!t) return null;
  const pts = values.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  const i0 = pts[0][0];
  const i1 = pts[pts.length - 1][0];
  const mean = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const slope = i1 > i0 ? t.change / (i1 - i0) : 0;
  return { i0, v0: mean + slope * (i0 - mx), i1, v1: mean + slope * (i1 - mx) };
}

export const fmt1 = (v: number) => dec(v.toFixed(Math.abs(v) >= 20 || Number.isInteger(v) ? 0 : 1));
