import type { LngLat, Ring } from '../types';
import type { HoleMapData } from '../lib/geo';

// A hole drawn like a yardage book (feature 027): tee at the bottom, green at the top, fairways, bunkers, water,
// trees and the course boundary, plus distance dots to the green centre and the caddie's landing spot.

interface Props {
  data: HoleMapData;
  trees?: Ring[];
  boundary?: Ring[];
  marks?: { pos: LngLat; label: string }[]; // distance dots (e.g. "150")
  aim?: LngLat | null; // the caddie's landing spot off the tee
  unitLabel?: string;
}

function projector(tee: LngLat, green: LngLat) {
  const k = 111320 * Math.cos((tee[1] * Math.PI) / 180);
  const raw = (p: LngLat): [number, number] => [(p[0] - tee[0]) * k, (p[1] - tee[1]) * 111320];
  const [gx, gy] = raw(green);
  const b = Math.atan2(gx, gy); // bearing tee → green
  const c = Math.cos(b), s = Math.sin(b);
  return (p: LngLat): [number, number] => {
    const [x, y] = raw(p);
    return [x * c - y * s, -(x * s + y * c)]; // rotated so the playing direction points up; SVG y down
  };
}

export function HoleSketch(props: Props) {
  const { data } = props;
  const pr = projector(data.tee, data.greenCenter);
  const pts = [...data.line.map(pr), ...(data.green ?? []).map(pr)];
  if (props.aim) pts.push(pr(props.aim));
  const minx0 = Math.min(...pts.map((p) => p[0])) - 40;
  const maxx0 = Math.max(...pts.map((p) => p[0])) + 40;
  const miny = Math.min(...pts.map((p) => p[1])) - 25;
  const maxy = Math.max(...pts.map((p) => p[1])) + 20;
  const w = Math.max(maxx0 - minx0, 150);
  const cx = (minx0 + maxx0) / 2;
  const minx = cx - w / 2;
  const h = maxy - miny;
  const near = (r: Ring) => r.some((p) => {
    const [x, y] = pr(p);
    return x > minx - 60 && x < minx + w + 60 && y > miny - 60 && y < maxy + 60;
  });
  const path = (r: Ring, close = true) => {
    const q = r.map(pr);
    return q.length < 2 ? '' : 'M' + q.map(([x, y]) => `${x.toFixed(0)} ${y.toFixed(0)}`).join(' L') + (close ? ' Z' : '');
  };
  const id = `clip-${Math.round(data.tee[0] * 1e6)}-${Math.round(data.tee[1] * 1e6)}`;
  return (
    <svg className="sketch" viewBox={`${minx.toFixed(0)} ${miny.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`} role="img" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect x={minx} y={miny} width={w} height={h} />
        </clipPath>
      </defs>
      <rect x={minx} y={miny} width={w} height={h} className="sk-rough" />
      <g clipPath={`url(#${id})`}>
        {(props.trees ?? []).filter(near).map((r, k) => <path key={`t${k}`} d={path(r)} className="sk-trees" />)}
        {data.fairways.map((r, k) => <path key={`f${k}`} d={path(r)} className="sk-fw" />)}
        {data.tees.map((r, k) => <path key={`e${k}`} d={path(r)} className="sk-tee" />)}
        {data.water.map((r, k) => <path key={`w${k}`} d={path(r)} className="sk-water" />)}
        {data.bunkers.map((r, k) => <path key={`b${k}`} d={path(r)} className="sk-bunker" />)}
        {data.green && <path d={path(data.green)} className="sk-green" />}
        {(props.boundary ?? []).filter(near).map((r, k) => <path key={`o${k}`} d={path(r, false)} className="sk-ob" />)}
        <path d={path(data.line, false)} className="sk-line" />
        {props.aim && (() => {
          const [x, y] = pr(props.aim!);
          const [tx, ty] = pr(data.tee);
          return (
            <>
              <line x1={tx} y1={ty} x2={x} y2={y} className="sk-shot" />
              <circle cx={x} cy={y} r={5} className="sk-aim" />
            </>
          );
        })()}
        {(props.marks ?? []).map((m) => {
          const [x, y] = pr(m.pos);
          return (
            <g key={m.label}>
              <circle cx={x} cy={y} r={2.2} className="sk-dot" />
              <text x={x + 6} y={y + 3} className="sk-mark">
                {m.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
