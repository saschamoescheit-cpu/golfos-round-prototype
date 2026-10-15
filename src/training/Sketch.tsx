import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import type { L, P, SideItem, Sketch, SketchItem } from './types';

// Our own drawings for the drills (Sascha 15.10.2026: no pictures copied from the internet). A sketch is described in
// meters – top view (x to the right, y towards the target) or side view (slopes, flight) – and drawn here as SVG.
// Balls, tees and holes are drawn larger than to scale, so they stay visible on a phone.

const txt = (t: L | string) => (typeof t === 'string' ? t : tr(t.en, t.de));

const C = {
  bg: '#5d8f3a',
  rough: '#4b7a2e',
  fairway: '#6ea545',
  fringe: '#7fb850',
  green: '#8cc95c',
  sand: '#e9d9a6',
  water: '#4f8fc0',
  mat: '#3f8a4a',
  line: '#ffffff',
  roll: '#ffffff',
  flight: '#ffe27a',
  aim: '#ff7a59',
  club: '#d8dde2',
  text: '#10210c',
  ring: '#ffd23f',
  stick: '#ff9d2e',
  sky: '#cfe6f5',
  ground: '#6ea545',
};

export function SketchView(props: { sketch: Sketch; label?: string }) {
  const s = props.sketch;
  const caption = s.caption ? txt(s.caption) : null;
  return (
    <figure className="tr-sketch">
      {s.view === 'top' ? <Top sketch={s} label={props.label} /> : s.view === 'side' ? <Side sketch={s} label={props.label} /> : <Face marks={s.marks} label={props.label} />}
      {caption && <figcaption className="muted small">{caption}</figcaption>}
    </figure>
  );
}

function Top(props: { sketch: Extract<Sketch, { view: 'top' }>; label?: string }) {
  const { w, h, items } = props.sketch;
  const W = 340;
  const k = W / w;
  const H = Math.round(h * k);
  const X = (x: number) => x * k;
  const Y = (y: number) => H - y * k;
  const pt = (p: P) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`;
  const area = (it: { x: number; y: number; w: number; h: number; round?: boolean }, fill: string, key: number, extra?: ReactNode) =>
    it.round ? (
      <ellipse key={key} cx={X(it.x + it.w / 2)} cy={Y(it.y + it.h / 2)} rx={(it.w * k) / 2} ry={(it.h * k) / 2} fill={fill} />
    ) : (
      <g key={key}>
        <rect x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={6} fill={fill} />
        {extra}
      </g>
    );
  const draw = (it: SketchItem, i: number): ReactNode => {
    switch (it.k) {
      case 'rough':
        return area({ ...it }, C.rough, i);
      case 'fairway':
        return area(it, C.fairway, i);
      case 'fringe':
        return area(it, C.fringe, i);
      case 'green':
        return area(it, C.green, i);
      case 'sand':
        return area(it, C.sand, i);
      case 'water':
        return area(it, C.water, i);
      case 'mat':
        return (
          <g key={i}>
            <rect x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={4} fill={C.mat} stroke="#2c6a36" strokeWidth={2} />
            {/* the lines printed on a putting mat */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={X(it.x + it.w * f)} x2={X(it.x + it.w * f)} y1={Y(it.y)} y2={Y(it.y + it.h)} stroke="#ffffff55" strokeWidth={1} />
            ))}
          </g>
        );
      case 'towel':
        return <rect key={i} x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={3} fill="#f4f1ea" stroke="#c9c3b5" strokeWidth={1.5} />;
      case 'zone':
        return (
          <g key={i}>
            <rect x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={4} fill="#ffffff22" stroke={C.line} strokeWidth={2} strokeDasharray="6 4" />
            {it.label && (
              <text x={X(it.x + it.w / 2)} y={Y(it.y + it.h / 2) + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.text}>
                {txt(it.label)}
              </text>
            )}
          </g>
        );
      case 'hole':
        return (
          <g key={i}>
            <circle cx={X(it.at[0])} cy={Y(it.at[1])} r={7} fill="#1b1b1b" stroke="#ffffff" strokeWidth={1.5} />
            {it.flag && (
              <>
                <line x1={X(it.at[0])} y1={Y(it.at[1])} x2={X(it.at[0])} y2={Y(it.at[1]) - 30} stroke="#f5f5f5" strokeWidth={2} />
                <path d={`M${X(it.at[0])},${Y(it.at[1]) - 30} l14,5 l-14,5 z`} fill="#e8412c" />
              </>
            )}
          </g>
        );
      case 'ball':
        return (
          <g key={i} opacity={it.ghost ? 0.5 : 1}>
            <circle cx={X(it.at[0])} cy={Y(it.at[1])} r={5.5} fill="#ffffff" stroke="#55606a" strokeWidth={1} />
            {it.n != null && (
              <text x={X(it.at[0]) + 8} y={Y(it.at[1]) - 6} fontSize={11} fontWeight={700} fill={C.text}>
                {typeof it.n === 'object' ? txt(it.n) : it.n}
              </text>
            )}
          </g>
        );
      case 'tee':
        return <circle key={i} cx={X(it.at[0])} cy={Y(it.at[1])} r={3.2} fill="#ffcf33" stroke="#7a5a00" strokeWidth={1} />;
      case 'coin':
        return <circle key={i} cx={X(it.at[0])} cy={Y(it.at[1])} r={5} fill="#d9b44a" stroke="#8a6a12" strokeWidth={1.2} />;
      case 'stick':
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke={C.stick} strokeWidth={4} strokeLinecap="round" />;
      case 'string':
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke="#ffffff" strokeWidth={1.5} strokeDasharray="2 3" />;
      case 'ring':
        return (
          <g key={i}>
            <circle cx={X(it.at[0])} cy={Y(it.at[1])} r={it.r * k} fill={it.fill ? '#ffd23f33' : 'none'} stroke={C.ring} strokeWidth={2.5} />
            {it.label && (
              <text x={X(it.at[0])} y={Y(it.at[1]) - it.r * k - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.text}>
                {txt(it.label)}
              </text>
            )}
          </g>
        );
      case 'path': {
        const color = it.style === 'flight' ? C.flight : it.style === 'aim' ? C.aim : it.style === 'club' ? C.club : C.roll;
        const d = it.pts.length === 3 ? `M${pt(it.pts[0])} Q${pt(it.pts[1])} ${pt(it.pts[2])}` : `M${it.pts.map(pt).join(' L')}`;
        const last = it.pts[it.pts.length - 1];
        const prev = it.pts[it.pts.length - 2];
        const ang = (Math.atan2(Y(last[1]) - Y(prev[1]), X(last[0]) - X(prev[0])) * 180) / Math.PI;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={color} strokeWidth={it.style === 'club' ? 3 : 2.2} strokeDasharray={it.style === 'aim' ? '7 5' : it.style === 'flight' ? '2 4' : undefined} strokeLinecap="round" />
            {it.arrow && <path d="M0,0 l-9,-5 l0,10 z" fill={color} transform={`translate(${X(last[0])},${Y(last[1])}) rotate(${ang})`} />}
          </g>
        );
      }
      case 'player': {
        // two feet seen from above, toes towards the ball line
        const [x, y] = [X(it.at[0]), Y(it.at[1])];
        const rot = it.face === 'left' ? 180 : it.face === 'up' ? -90 : 0;
        return (
          <g key={i} transform={`translate(${x},${y}) rotate(${rot})`} aria-hidden="true">
            <ellipse cx={-2} cy={-11} rx={9} ry={4.5} fill="#2b3a44" />
            <ellipse cx={-2} cy={11} rx={9} ry={4.5} fill="#2b3a44" />
            <circle cx={-14} cy={0} r={8} fill="#2b3a44" opacity={0.35} />
          </g>
        );
      }
      case 'club': {
        const a = it.angle ?? 0;
        return (
          <g key={i} transform={`translate(${X(it.at[0])},${Y(it.at[1])}) rotate(${-a})`}>
            <line x1={0} y1={0} x2={0} y2={-60} stroke={C.club} strokeWidth={2.5} />
            <rect x={-7} y={-2} width={14} height={6} rx={2} fill={C.club} />
          </g>
        );
      }
      case 'putter': {
        // a putter head of about 11 cm, square to the target line (up the page), just behind the ball
        const [x, y] = [X(it.at[0]), Y(it.at[1])];
        const w = Math.max(16, 0.11 * k);
        return <rect key={i} x={x - w / 2} y={y + 6} width={w} height={6} rx={2} fill="#d8dde2" stroke="#55606a" strokeWidth={1} />;
      }
      case 'slope': {
        const [x, y] = [X(it.at[0]), Y(it.at[1])];
        return (
          <g key={i} transform={`translate(${x},${y}) rotate(${it.dir})`}>
            <line x1={0} y1={16} x2={0} y2={-14} stroke="#16324a" strokeWidth={2.5} />
            <path d="M0,-18 l-6,9 l12,0 z" fill="#16324a" />
            {it.label && (
              <text x={8} y={4} fontSize={11} fill="#16324a" fontWeight={700} transform={`rotate(${-it.dir})`}>
                {txt(it.label)}
              </text>
            )}
          </g>
        );
      }
      case 'text':
        return (
          <text key={i} x={X(it.at[0])} y={Y(it.at[1])} fontSize={it.size ?? 12} fontWeight={700} fill={C.text} textAnchor={it.anchor ?? 'middle'}>
            {txt(it.t)}
          </text>
        );
      case 'dim': {
        const [a, b] = [it.from, it.to];
        const label = txt(it.t);
        const mx = (X(a[0]) + X(b[0])) / 2;
        const my = (Y(a[1]) + Y(b[1])) / 2;
        return (
          <g key={i}>
            <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#16324a" strokeWidth={1.2} markerStart="url(#tr-dim)" markerEnd="url(#tr-dim)" />
            <rect x={mx - label.length * 3.6 - 4} y={my - 9} width={label.length * 7.2 + 8} height={16} rx={4} fill="#ffffffcc" />
            <text x={mx} y={my + 3} fontSize={11} fontWeight={700} fill="#16324a" textAnchor="middle">
              {label}
            </text>
          </g>
        );
      }
    }
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={props.label ?? tr('Sketch of the drill', 'Skizze der Übung')} style={{ display: 'block', background: C.bg, borderRadius: 12 }}>
      <defs>
        <marker id="tr-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#16324a" />
        </marker>
      </defs>
      {items.map(draw)}
    </svg>
  );
}

/** A golfer in side view: address on the slope (tilted), top of the swing or finish. */
function Figure(props: { x: number; y: number; k: number; tilt: number; pose: 'address' | 'top' | 'finish' | 'front' }) {
  const s = props.k * 1.75; // body height in px
  const u = s / 10;
  const { pose } = props;
  if (pose === 'front')
    // face-on: feet apart, the ball between them, the target to the right
    return (
      <g transform={`translate(${props.x},${props.y}) rotate(${-props.tilt})`} stroke="#22313b" strokeWidth={Math.max(2, u * 0.55)} strokeLinecap="round" fill="none">
        <path d={`M${-u * 1.8},0 L${-u * 0.6},${-u * 4.6} L${u * 0.6},${-u * 4.6} L${u * 1.8},0`} />
        <path d={`M0,${-u * 4.6} L${-u * 0.2},${-u * 8}`} />
        <circle cx={-u * 0.25} cy={-u * 8.9} r={u * 0.8} fill="#22313b" />
        <path d={`M${-u * 1.1},${-u * 7.4} L${-u * 0.3},${-u * 4.3} M${u * 0.7},${-u * 7.4} L${-u * 0.1},${-u * 4.3}`} />
        <path d={`M${-u * 0.2},${-u * 4.3} L${u * 0.1},0`} stroke="#9aa4ab" strokeWidth={Math.max(1.5, u * 0.3)} />
      </g>
    );
  return (
    <g transform={`translate(${props.x},${props.y}) rotate(${-props.tilt})`} stroke="#22313b" strokeWidth={Math.max(2, u * 0.55)} strokeLinecap="round" fill="none">
      {/* legs */}
      <path d={`M${-u * 1.2},0 L${-u * 0.6},${-u * 4.2} L${u * 0.4},${-u * 4.6}`} />
      <path d={`M${u * 1.4},0 L${u * 0.8},${-u * 4.2}`} />
      {/* spine bent forward at address */}
      <path d={pose === 'finish' ? `M0,${-u * 4.6} L${u * 0.2},${-u * 8.2}` : `M0,${-u * 4.6} L${u * 1.9},${-u * 7.8}`} />
      <circle cx={pose === 'finish' ? u * 0.3 : u * 2.5} cy={pose === 'finish' ? -u * 9 : -u * 8.5} r={u * 0.8} fill="#22313b" />
      {pose === 'address' && (
        <>
          <path d={`M${u * 1.7},${-u * 7.4} L${u * 2.4},${-u * 4.2}`} />
          <path d={`M${u * 2.4},${-u * 4.2} L${u * 3.4},0`} stroke="#9aa4ab" strokeWidth={Math.max(1.5, u * 0.3)} />
        </>
      )}
      {pose === 'top' && (
        <>
          <path d={`M${u * 1.7},${-u * 7.4} L${-u * 0.6},${-u * 8.6}`} />
          <path d={`M${-u * 0.6},${-u * 8.6} L${u * 2.8},${-u * 10.2}`} stroke="#9aa4ab" strokeWidth={Math.max(1.5, u * 0.3)} />
        </>
      )}
      {pose === 'finish' && (
        <>
          <path d={`M${u * 0.2},${-u * 7.6} L${-u * 1.2},${-u * 9.2}`} />
          <path d={`M${-u * 1.2},${-u * 9.2} L${-u * 3.4},${-u * 7.4}`} stroke="#9aa4ab" strokeWidth={Math.max(1.5, u * 0.3)} />
        </>
      )}
    </g>
  );
}

function Side(props: { sketch: Extract<Sketch, { view: 'side' }>; label?: string }) {
  const { w, h, items } = props.sketch;
  const W = 340;
  const k = W / w;
  const H = Math.round(h * k);
  const X = (x: number) => x * k;
  const Y = (y: number) => H - y * k;
  const draw = (it: SideItem, i: number): ReactNode => {
    switch (it.k) {
      case 'ground': {
        const pts = it.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
        return <polygon key={i} points={`${X(it.pts[0][0])},${H} ${pts} ${X(it.pts[it.pts.length - 1][0])},${H}`} fill={C.ground} stroke="#3d6b22" strokeWidth={2} />;
      }
      case 'figure':
        return <Figure key={i} x={X(it.at[0])} y={Y(it.at[1])} k={k} tilt={it.tilt ?? 0} pose={it.pose ?? 'address'} />;
      case 'ball':
        return <circle key={i} cx={X(it.at[0])} cy={Y(it.at[1]) - 4} r={4.5} fill="#ffffff" stroke="#55606a" />;
      case 'flag':
        return (
          <g key={i}>
            <line x1={X(it.at[0])} y1={Y(it.at[1])} x2={X(it.at[0])} y2={Y(it.at[1]) - 34} stroke="#f5f5f5" strokeWidth={2} />
            <path d={`M${X(it.at[0])},${Y(it.at[1]) - 34} l14,5 l-14,5 z`} fill="#e8412c" />
          </g>
        );
      case 'flight': {
        const p = it.pts;
        const d = p.length === 3 ? `M${X(p[0][0])},${Y(p[0][1])} Q${X(p[1][0])},${Y(p[1][1])} ${X(p[2][0])},${Y(p[2][1])}` : `M${p.map((q) => `${X(q[0])},${Y(q[1])}`).join(' L')}`;
        return <path key={i} d={d} fill="none" stroke="#c98f00" strokeWidth={2.2} strokeDasharray={it.dashed ? '3 4' : undefined} />;
      }
      case 'arrow': {
        const ang = (Math.atan2(Y(it.to[1]) - Y(it.from[1]), X(it.to[0]) - X(it.from[0])) * 180) / Math.PI;
        return (
          <g key={i}>
            <line x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke="#16324a" strokeWidth={2} />
            <path d="M0,0 l-9,-5 l0,10 z" fill="#16324a" transform={`translate(${X(it.to[0])},${Y(it.to[1])}) rotate(${ang})`} />
          </g>
        );
      }
      case 'line':
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke="#16324a" strokeWidth={1.5} strokeDasharray={it.dashed ? '5 4' : undefined} />;
      case 'text':
        return (
          <text key={i} x={X(it.at[0])} y={Y(it.at[1])} fontSize={it.size ?? 12} fontWeight={700} fill="#16324a" textAnchor={it.anchor ?? 'middle'}>
            {txt(it.t)}
          </text>
        );
    }
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={props.label ?? tr('Sketch', 'Skizze')} style={{ display: 'block', background: C.sky, borderRadius: 12 }}>
      {items.map(draw)}
    </svg>
  );
}

/** The club face from the front with impact marks (x, y from -1 to 1: toe/heel, high/low). */
function Face(props: { marks: { x: number; y: number; n?: L | string }[]; label?: string }) {
  return (
    <svg viewBox="0 0 340 170" width="100%" role="img" aria-label={props.label ?? tr('Club face', 'Schlagfläche')} style={{ display: 'block', background: '#2a3640', borderRadius: 12 }}>
      <path d="M40,120 Q40,40 120,38 L270,34 Q312,36 306,92 Q300,130 250,134 L60,136 Q40,136 40,120 z" fill="#c9d0d6" stroke="#8b959d" strokeWidth={2} />
      {[60, 75, 90, 105, 120].map((y) => (
        <line key={y} x1={70} x2={285} y1={y} y2={y - 2} stroke="#9aa4ab" strokeWidth={1} />
      ))}
      <line x1={330} y1={30} x2={300} y2={70} stroke="#8b959d" strokeWidth={6} strokeLinecap="round" />
      <circle cx={175} cy={86} r={14} fill="none" stroke="#46c46e" strokeWidth={2} strokeDasharray="3 3" />
      {props.marks.map((m, i) => (
        <g key={i}>
          <ellipse cx={175 + m.x * 95} cy={86 - m.y * 40} rx={8} ry={6} fill="#1d5fa8" opacity={0.75} />
          {m.n && (
            <text x={175 + m.x * 95} y={86 - m.y * 40 - 10} fontSize={11} fill="#ffffff" textAnchor="middle" fontWeight={700}>
              {txt(m.n)}
            </text>
          )}
        </g>
      ))}
      <text x={60} y={160} fontSize={11} fill="#c9d3cc">
        {tr('heel', 'Ferse')}
      </text>
      <text x={290} y={160} fontSize={11} fill="#c9d3cc" textAnchor="end">
        {tr('toe', 'Spitze')}
      </text>
    </svg>
  );
}
