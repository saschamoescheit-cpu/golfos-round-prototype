import { useRef, useState } from 'react';
import type { LngLat } from '../types';
import { bearingDeg, distanceM } from '../lib/geo';
import { move } from '../lib/aimpoint';
import { dec, tr } from '../lib/i18n';

// Putts on the green right after the hole (Sascha 14.10.2026, as in BeBrassie): drag the flag to where the hole was
// and one ball per putt to where it lay – e.g. first putt from 5 m, second from 10 cm. The round check then has the
// putts and the pin and only the shots before the green are left to check.

const M_LAT = 110540;
const mLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function PuttEditor(props: {
  title: string;
  green: LngLat[] | null; // outline of the green (null: only the centre is known)
  greenCenter: LngLat;
  from: LngLat; // where the green is played from – the view is turned so this side is at the bottom
  pin: LngLat;
  putts: number;
  balls: LngLat[] | null; // saved before, or null
  ballOnGreen: LngLat | null; // GPS position when the player stood on the green
  onSave: (v: { pin: LngLat; balls: LngLat[] }) => void;
  onCancel: () => void;
}) {
  const c = props.greenCenter;
  const up = bearingDeg(props.from, c); // playing direction: up on the screen
  const [pin, setPin] = useState<LngLat>(props.pin);
  const [balls, setBalls] = useState<LngLat[]>(() => {
    if (props.balls && props.balls.length === props.putts) return props.balls;
    // first putt: where the player stood on the green, else short of the pin on the way in; each next one closer
    const back = bearingDeg(props.pin, props.from);
    const first = props.ballOnGreen && distanceM(props.ballOnGreen, props.pin) < 40 ? props.ballOnGreen : move(props.pin, back, Math.min(12, 3 + props.putts * 2.5));
    const d0 = distanceM(first, props.pin);
    const out: LngLat[] = [first];
    for (let k = 1; k < props.putts; k++) {
      const d = k === props.putts - 1 ? Math.min(1, d0 * 0.15) : d0 * 0.3 ** k;
      out.push(move(props.pin, back + (k % 2 ? 25 : -25), Math.max(0.3, d)));
    }
    return out;
  });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | 'pin' | null>(null);

  // local metres: x = right of the playing line, y = along it (up)
  const toXY = (p: LngLat): [number, number] => {
    const e = (p[0] - c[0]) * mLon(c[1]);
    const n = (p[1] - c[1]) * M_LAT;
    const b = (up * Math.PI) / 180;
    return [e * Math.cos(b) - n * Math.sin(b), -(e * Math.sin(b) + n * Math.cos(b))];
  };
  const toLngLat = (x: number, y: number): LngLat => {
    const b = (up * Math.PI) / 180;
    const along = -y;
    const e = x * Math.cos(b) + along * Math.sin(b);
    const n = -x * Math.sin(b) + along * Math.cos(b);
    return [c[0] + e / mLon(c[1]), c[1] + n / M_LAT];
  };
  const ring = props.green ?? Array.from({ length: 24 }, (_, k) => move(c, k * 15, 12));
  const pts = [...ring, pin, ...balls].map(toXY);
  const half = Math.max(14, ...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 3;
  const vb = `${-half} ${-half} ${half * 2} ${half * 2}`;
  const r = half / 26; // marker size follows the zoom

  const pointer = (ev: React.PointerEvent) => {
    if (drag.current == null || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    const p = toLngLat(q.x, q.y);
    if (drag.current === 'pin') setPin(p);
    else {
      const k = drag.current;
      setBalls((b) => b.map((x, j) => (j === k ? p : x)));
    }
  };
  const start = (what: number | 'pin') => (ev: React.PointerEvent) => {
    ev.preventDefault();
    drag.current = what;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const fmt = (m: number) => (m < 0.95 ? `${Math.round(m * 100)} cm` : `${dec(m.toFixed(1))} m`);

  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet putt-editor" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        {/* ✕ = leave without saving, ✓ = save (Sascha 14.10.2026) */}
        <div className="sheet-head">
          <button type="button" className="icon-btn" aria-label={tr('Cancel – do not save', 'Abbrechen – nicht speichern')} onClick={props.onCancel}>
            ✕
          </button>
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn save" aria-label={tr('Save putts', 'Putts speichern')} onClick={() => props.onSave({ pin, balls })}>
            ✓
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Drag the flag to the hole and each ball to where it lay before the putt.', 'Ziehe die Fahne zum Loch und jeden Ball dorthin, wo er vor dem Putt lag.')}
        </p>
        <svg
          ref={svg}
          className="putt-green"
          viewBox={vb}
          onPointerMove={pointer}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          role="img"
          aria-label={tr('Green with flag and balls', 'Grün mit Fahne und Bällen')}
        >
          <polygon points={ring.map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} className="putt-green-shape" strokeWidth={r * 0.35} />
          <polyline points={[...balls, pin].map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} className="putt-line" strokeWidth={r * 0.3} strokeDasharray={`${r * 0.8} ${r * 0.6}`} />
          {(() => {
            const [x, y] = toXY(pin);
            return (
              <g className="putt-pin" onPointerDown={start('pin')} aria-label={tr('Flag, drag to the hole', 'Fahne, zum Loch ziehen')}>
                <circle cx={x} cy={y} r={r * 2.2} fill="transparent" />
                <circle cx={x} cy={y} r={r * 0.55} fill="#0e1418" />
                <path d={`M${x} ${y}V${y - r * 4}`} stroke="#fff" strokeWidth={r * 0.3} />
                <path d={`M${x} ${y - r * 4}h${r * 2.6}l${-r * 0.7} ${r * 0.8}l${r * 0.7} ${r * 0.8}h${-r * 2.6}z`} fill="#ff6b5e" />
              </g>
            );
          })()}
          {balls.map((b, k) => {
            const [x, y] = toXY(b);
            return (
              <g key={k} className="putt-ball" onPointerDown={start(k)} aria-label={tr(`Ball before putt ${k + 1}, drag to move`, `Ball vor Putt ${k + 1}, zum Verschieben ziehen`)}>
                <circle cx={x} cy={y} r={r * 2.4} fill="transparent" />
                <circle cx={x} cy={y} r={r * 1.1} fill="#fff" stroke="#0e1418" strokeWidth={r * 0.25} />
                <text x={x} y={y + r * 0.4} textAnchor="middle" fontSize={r * 1.15} fontWeight="700" fill="#0e1418">
                  {k + 1}
                </text>
                {/* the length of this putt right next to the ball, also while it is dragged */}
                <g className="putt-dist" transform={`translate(${x + r * 1.6} ${y - r * 0.2})`}>
                  <rect x={0} y={-r * 1.15} width={r * 5.8} height={r * 2.3} rx={r * 0.6} fill="#0e1418" opacity="0.85" />
                  <text x={r * 2.9} y={r * 0.5} textAnchor="middle" fontSize={r * 1.45} fontWeight="700" fill="#fff">
                    {fmt(distanceM(b, pin))}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </section>
    </div>
  );
}
