import { useRef, useState } from 'react';
import type { LngLat } from '../types';
import { bearingDeg, distanceM, keepOnGreen } from '../lib/geo';
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
  /** the player's GPS walk on this green and where he stood still (greenwalk.ts) */
  walk?: { path: LngLat[]; stops: LngLat[] } | null;
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
    // the first spot he stood still on the green (GPS walk) is most likely the first putt
    const stood = props.walk?.stops.find((s) => distanceM(s, props.pin) >= 1.5 && distanceM(s, props.pin) < 40);
    const first = props.ballOnGreen && distanceM(props.ballOnGreen, props.pin) < 40 ? props.ballOnGreen : (stood ?? move(props.pin, back, Math.min(12, 3 + props.putts * 2.5)));
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
  // finer and visible (Sascha 16.10.2026: "the finger covers the metres … much too sensitive"): the dragged ball moves
  // by half the finger's way from where it was – it does not jump under the finger – and its length stands large
  // above the green while dragging
  const FINE = 0.5;
  const grab = useRef<{ x: number; y: number; at: [number, number] } | null>(null);
  const [active, setActive] = useState<number | 'pin' | null>(null);
  // zoom in to place the balls (Sascha 16.10.2026: "beim Bearbeiten der Putts sollte man reinzoomen können"): two
  // fingers spread, one finger on the free green moves the view, the buttons zoom in steps or onto the putts
  const [view, setView] = useState<{ zoom: number; cx: number; cy: number }>({ zoom: 1, cx: 0, cy: 0 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number; cx: number; cy: number; mid: { x: number; y: number } } | null>(null);
  const panFrom = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

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
  const walk = props.walk ?? null;
  const pts = [...ring, pin, ...balls, ...(walk?.path ?? [])].map(toXY);
  const half = Math.max(14, ...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 3;
  const MAX_ZOOM = 10;
  // the view: a square of half/zoom around (cx, cy), kept on the green's square
  const clampView = (zoom: number, cx: number, cy: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const h = half / z;
    const lim = half - h;
    return { zoom: z, cx: Math.min(lim, Math.max(-lim, cx)), cy: Math.min(lim, Math.max(-lim, cy)) };
  };
  const vh = half / view.zoom;
  const vb = `${view.cx - vh} ${view.cy - vh} ${vh * 2} ${vh * 2}`;
  const r = vh / 26; // markers keep their size on the screen at every zoom
  const metresPerPx = () => (svg.current ? (vh * 2) / svg.current.clientWidth : 0);
  const zoomBy = (k: number) => setView((v) => clampView(v.zoom * k, v.cx, v.cy));
  // onto the putts: flag and balls with a little room around them
  const toPutts = () => {
    const q = [pin, ...balls].map(toXY);
    const xs = q.map((p) => p[0]);
    const ys = q.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 2) / 2 + 1.5;
    setView(clampView(half / span, (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2));
  };

  const down = (ev: React.PointerEvent) => {
    touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      drag.current = null; // two fingers: zoom, not move a ball
      grab.current = null;
      setActive(null);
      panFrom.current = null;
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom, cx: view.cx, cy: view.cy, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else if (drag.current == null && view.zoom > 1) panFrom.current = { x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy };
  };
  const lift = (ev: React.PointerEvent) => {
    touches.current.delete(ev.pointerId);
    if (touches.current.size < 2) gesture.current = null;
    if (touches.current.size === 0) {
      drag.current = null;
      grab.current = null;
      setActive(null);
      panFrom.current = null;
    }
  };
  const pointer = (ev: React.PointerEvent) => {
    if (touches.current.has(ev.pointerId)) touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const g = gesture.current;
    if (g && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const zoom = g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist);
      // the fingers' middle moves the view along
      const k = (half / g.zoom) * 2 / (svg.current?.clientWidth || 1);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView(clampView(zoom, g.cx - (mid.x - g.mid.x) * k, g.cy - (mid.y - g.mid.y) * k));
      return;
    }
    const pan = panFrom.current; // read now – the finger may lift before React applies the update
    if (pan && drag.current == null) {
      const k = metresPerPx();
      setView((v) => clampView(v.zoom, pan.cx - (ev.clientX - pan.x) * k, pan.cy - (ev.clientY - pan.y) * k));
      return;
    }
    const gr = grab.current;
    if (drag.current == null || !gr || !svg.current) return;
    const k = metresPerPx() * FINE;
    const p = toLngLat(gr.at[0] + (ev.clientX - gr.x) * k, gr.at[1] + (ev.clientY - gr.y) * k);
    if (drag.current === 'pin') setPin(keepOnGreen(p, props.green, c, 0.3)); // the hole is on the green
    else {
      const k = drag.current;
      setBalls((b) => b.map((x, j) => (j === k ? p : x)));
    }
  };
  const start = (what: number | 'pin') => (ev: React.PointerEvent) => {
    ev.preventDefault();
    if (touches.current.size >= 2) return; // a second finger zooms
    drag.current = what;
    grab.current = { x: ev.clientX, y: ev.clientY, at: toXY(what === 'pin' ? pin : balls[what]) };
    setActive(what);
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
        <div className="putt-zoom" role="group" aria-label={tr('Zoom', 'Zoom')}>
          <button type="button" className="chip" aria-label={tr('Zoom out', 'Herauszoomen')} disabled={view.zoom <= 1} onClick={() => zoomBy(1 / 1.6)}>
            −
          </button>
          <button type="button" className="chip" aria-label={tr('Zoom in', 'Hineinzoomen')} disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.6)}>
            +
          </button>
          <button type="button" className="chip" onClick={toPutts}>
            {tr('Onto the putts', 'Auf die Putts')}
          </button>
          {view.zoom > 1 && (
            <button type="button" className="chip" onClick={() => setView({ zoom: 1, cx: 0, cy: 0 })}>
              {tr('Whole green', 'Ganzes Grün')}
            </button>
          )}
        </div>
        <div className="putt-wrap">
        {active != null && (
          <div className="putt-readout" aria-live="polite">
            {active === 'pin'
              ? `${tr('Flag', 'Fahne')} · ${balls.map((b, k) => `${k + 1}: ${fmt(distanceM(b, pin))}`).join(' · ')}`
              : `${tr('Putt', 'Putt')} ${active + 1}: ${fmt(distanceM(balls[active], pin))}`}
          </div>
        )}
        <svg
          ref={svg}
          className="putt-green"
          viewBox={vb}
          onPointerDownCapture={down}
          onPointerMove={pointer}
          onPointerUp={lift}
          onPointerCancel={lift}
          onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
          role="img"
          aria-label={tr('Green with flag and balls', 'Grün mit Fahne und Bällen')}
        >
          <polygon points={ring.map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} className="putt-green-shape" strokeWidth={r * 0.35} />
          {/* where he walked on the green (GPS) and where he stood still */}
          {walk && (
            <g className="putt-walk" aria-hidden="true">
              <polyline points={walk.path.map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth={r * 0.25} strokeDasharray={`${r * 0.5} ${r * 0.5}`} strokeLinejoin="round" />
              {walk.stops.map((s, k) => {
                const [x, y] = toXY(s);
                return <circle key={k} cx={x} cy={y} r={r * 0.8} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth={r * 0.22} />;
              })}
            </g>
          )}
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
        </div>
        {walk && (
          <p className="muted small" style={{ margin: 0 }}>
            {tr('Dashed: your GPS walk on the green · rings: where you stood still', 'Gestrichelt: dein GPS-Laufweg auf dem Grün · Ringe: hier hast du gestanden')}
          </p>
        )}
      </section>
    </div>
  );
}
