import { useRef, useState } from 'react';
import type { LngLat } from '../types';
import { bearingDeg, distanceM, keepOnGreen } from '../lib/geo';
import { move } from '../lib/aimpoint';
import { dec, tr } from '../lib/i18n';
import { FloatActions } from './FloatActions';
import type { ImagerySource } from '../lib/imagery';

/** The aerial photo's tiles around the green (Sascha 11.11.2026: "in the USA the putt editor lacks bunkers and so on" –
 *  the maps there know tees and greens only): the same source as the hole's map, each tile placed into the editor's
 *  turned metres by its corners. Mercator is straight enough over one tile. */
const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
function tileUrl(src: ImagerySource, z: number, x: number, y: number): string {
  if (src.tiles.includes('{bbox-epsg-3857}')) {
    const R = 6378137;
    const m = (v: number) => (v / 2 ** z) * 2 * Math.PI * R - Math.PI * R;
    const bbox = [m(x), -m(y + 1), m(x + 1), -m(y)].map((v) => v.toFixed(2)).join(',');
    return src.tiles.replace('{bbox-epsg-3857}', bbox);
  }
  const yy = src.scheme === 'tms' ? 2 ** z - 1 - y : y;
  return src.tiles.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(yy));
}

// Putts on the green right after the hole (Sascha 14.10.2026, as in BeBrassie): drag the flag to where the hole was
// and one ball per putt to where it lay – e.g. first putt from 5 m, second from 10 cm. The round check then has the
// putts and the pin and only the shots before the green are left to check.

const M_LAT = 110540;
const mLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** The zoom buttons over the green – off: pinch and drag are enough (Sascha 17.10.2026). */
const SHOW_ZOOM_BUTTONS = false;

/**
 * The balls the editor starts with: those saved, else the first putt where the player stood on the green (else short
 * of the pin on the way in) and each next one closer. The round check shows the same on its map and in the putts' row
 * before the editor was opened (Sascha 13.11.2026: "immer und auf allen Bahnen").
 */
export function startBalls(o: { pin: LngLat; from: LngLat; putts: number; balls: LngLat[] | null; ballOnGreen: LngLat | null; walk?: { path: LngLat[]; stops: LngLat[] } | null }): LngLat[] {
  if (o.balls && o.balls.length === o.putts) return o.balls;
  if (o.putts <= 0) return [];
  const back = bearingDeg(o.pin, o.from);
  // the first spot he stood still on the green (GPS walk) is most likely the first putt
  const stood = o.walk?.stops.find((s) => distanceM(s, o.pin) >= 1.5 && distanceM(s, o.pin) < 40);
  const first = o.ballOnGreen && distanceM(o.ballOnGreen, o.pin) < 40 ? o.ballOnGreen : (stood ?? move(o.pin, back, Math.min(12, 3 + o.putts * 2.5)));
  const d0 = distanceM(first, o.pin);
  const out: LngLat[] = [first];
  for (let k = 1; k < o.putts; k++) {
    const d = k === o.putts - 1 ? Math.min(1, d0 * 0.15) : d0 * 0.3 ** k;
    out.push(move(o.pin, back + (k % 2 ? 25 : -25), Math.max(0.3, d)));
  }
  return out;
}

export function PuttEditor(props: {
  title: string;
  green: LngLat[] | null; // outline of the green (null: only the centre is known)
  greenCenter: LngLat;
  /** the bunkers of the hole – those at the green are drawn around it (Sascha 18.10.2026) */
  bunkers?: LngLat[][];
  from: LngLat; // where the green is played from – the view is turned so this side is at the bottom
  pin: LngLat;
  putts: number;
  balls: LngLat[] | null; // saved before, or null
  ballOnGreen: LngLat | null; // GPS position when the player stood on the green
  /** the player's GPS walk on this green and where he stood still (greenwalk.ts) */
  walk?: { path: LngLat[]; stops: LngLat[] } | null;
  /** the number of putts to set here too (the round check, Sascha 11.11.2026: "forgot the putts on the round – could
   * not place flag and putts afterwards"); its − / + adds or takes the last ball */
  countable?: boolean;
  onSave: (v: { pin: LngLat; balls: LngLat[]; putts: number }) => void;
  onCancel: () => void;
  /** the hole's aerial photo under the green – bunkers, water, paths where the map has none (Sascha 11.11.2026) */
  imagery?: ImagerySource | null;
}) {
  const c = props.greenCenter;
  const up = bearingDeg(props.from, c); // playing direction: up on the screen
  const [pin, setPin] = useState<LngLat>(props.pin);
  const [balls, setBalls] = useState<LngLat[]>(() => startBalls(props));
  // closed by ✕ or beside the sheet: what was moved is kept (Sascha 13.11.2026) – unchanged, nothing is saved
  const opened = useRef(JSON.stringify({ pin: props.pin, balls }));
  const close = () => (JSON.stringify({ pin, balls }) !== opened.current ? props.onSave({ pin, balls, putts: balls.length }) : props.onCancel());
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
  // the greenside bunkers: any corner within 15 m of the green's edge (or 40 m of its centre without an outline)
  const nearGreen = (b: LngLat[]) => b.some((q) => (props.green ? props.green.some((g) => distanceM(q, g) < 15) : distanceM(q, c) < 40));
  const bunkers = (props.bunkers ?? []).filter(nearGreen);
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
  // the photo's tiles covering the green's square (turned: its corners' radius), as fine as the source has them
  const photo = (() => {
    const src = props.imagery;
    if (!src) return [];
    const rad = half * Math.SQRT2 + 5;
    const [w, e] = [c[0] - rad / mLon(c[1]), c[0] + rad / mLon(c[1])];
    const [s, n] = [c[1] - rad / M_LAT, c[1] + rad / M_LAT];
    let z = Math.min(src.maxzoom, 20);
    while (z > 15 && (Math.floor(lon2x(e, z)) - Math.floor(lon2x(w, z)) + 1) * (Math.floor(lat2y(s, z)) - Math.floor(lat2y(n, z)) + 1) > 30) z--;
    const out: { key: string; href: string; m: string }[] = [];
    for (let x = Math.floor(lon2x(w, z)); x <= Math.floor(lon2x(e, z)); x++)
      for (let y = Math.floor(lat2y(n, z)); y <= Math.floor(lat2y(s, z)); y++) {
        const p0 = toXY([x2lon(x, z), y2lat(y, z)]);
        const p1 = toXY([x2lon(x + 1, z), y2lat(y, z)]);
        const p2 = toXY([x2lon(x, z), y2lat(y + 1, z)]);
        out.push({ key: `${z}/${x}/${y}`, href: tileUrl(src, z, x, y), m: `matrix(${p1[0] - p0[0]} ${p1[1] - p0[1]} ${p2[0] - p0[0]} ${p2[1] - p0[1]} ${p0[0]} ${p0[1]})` });
      }
    return out;
  })();
  const vh = half / view.zoom;
  const vb = `${view.cx - vh} ${view.cy - vh} ${vh * 2} ${vh * 2}`;
  const r = vh / 26; // markers keep their size on the screen at every zoom
  // the green as drawn: the square view fitted into the element (iPad landscape: wider than high – centred, letterboxed;
  // Sascha 11.11.2026: "the flag cannot be moved at all, the putts hang" – the finger was read against the width)
  const fit = () => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const side = Math.min(box.width, box.height) || 1;
    return { px: side / (vh * 2), left: box.left + (box.width - side) / 2, top: box.top + (box.height - side) / 2 };
  };
  const metresPerPx = () => {
    const f = fit();
    return f ? 1 / f.px : 0;
  };
  const zoomBy = (k: number) => setView((v) => clampView(v.zoom * k, v.cx, v.cy));
  // onto the putts: flag and balls with a little room around them
  const toPutts = () => {
    const q = [pin, ...balls].map(toXY);
    const xs = q.map((p) => p[0]);
    const ys = q.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 2) / 2 + 1.5;
    setView(clampView(half / span, (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2));
  };

  // flag and balls on the screen (px) – a finger near one takes it, only farther away it moves the green
  // (Sascha 21.10.2026: "sometimes the whole green moves although I want to move the flag")
  // (Sascha 11.11.2026: "sometimes I could not move the putts and the flag"): the flag is taken by its cloth too, a
  // ball by its length beside it – where a finger takes them – not only by the hole and the ball's centre
  const GRAB_PX = 40;
  const nearest = (cx: number, cy: number): number | 'pin' | null => {
    const el = svg.current;
    if (!el) return null;
    const f = fit();
    if (!f) return null;
    const px = ([x, y]: [number, number]) => [f.left + (x - (view.cx - vh)) * f.px, f.top + (y - (view.cy - vh)) * f.px];
    let best: number | 'pin' | null = null;
    let bestD = GRAB_PX;
    // every spot the marker is drawn at (metres of the view from its point; r = a marker's unit)
    const take = (what: number | 'pin', p: LngLat, spots: [number, number][]) => {
      const [x0, y0] = toXY(p);
      for (const [ox, oy] of spots) {
        const [x, y] = px([x0 + ox, y0 + oy]);
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          best = what;
        }
      }
    };
    balls.forEach((b, k) => take(k, b, [[0, 0], [r * 3.2, -r * 0.2], [r * 5.6, -r * 0.2]]));
    take('pin', pin, [[0, 0], [0, -r * 2], [r * 1.3, -r * 3.2]]); // the flag wins a tie: it is what is moved most
    return best;
  };
  const down = (ev: React.PointerEvent) => {
    // a new touch on its own (no other finger down): a finger of the zoom before whose lifting went elsewhere is gone –
    // kept, it made every later finger the second of a pinch and nothing could be dragged any more (Sascha 08.11.2026:
    // "after zooming in I could not place the flag and the putts any more")
    if (ev.isPrimary) touches.current.clear();
    touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    // every finger followed to its lifting, also when it lifts beside the green
    try {
      svg.current?.setPointerCapture?.(ev.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
    if (touches.current.size === 1) {
      const what = nearest(ev.clientX, ev.clientY);
      if (what != null) {
        ev.preventDefault();
        drag.current = what;
        grab.current = { x: ev.clientX, y: ev.clientY, at: toXY(what === 'pin' ? pin : balls[what]) };
        setActive(what); // the finger followed already (captured above)
        return;
      }
    }
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
      const box = svg.current?.getBoundingClientRect();
      const k = ((half / g.zoom) * 2) / (Math.min(box?.width ?? 1, box?.height ?? 1) || 1);
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
  const fmt = (m: number) => (m < 0.95 ? `${Math.round(m * 100)} cm` : `${dec(m.toFixed(1))} m`);
  // a putt added: the first one short of the flag on the way in, each next one between the last ball and the hole
  const nextBall = (b: LngLat[]): LngLat => {
    if (!b.length) return move(pin, bearingDeg(pin, props.from), 6);
    const last = b[b.length - 1];
    return move(pin, bearingDeg(pin, last) + 25, Math.max(0.3, distanceM(last, pin) * 0.3));
  };
  // where the flag stands on the green (Sascha 21.10.2026): from the nearer edge, and from the front or to the back
  // along the playing line – whichever is nearer
  const pinSpot = (() => {
    if (!props.green) return null;
    const [px, py] = toXY(pin);
    const q = props.green.map(toXY);
    let edge = Infinity;
    let side = '';
    const ys: number[] = [];
    for (let k = 0; k < q.length; k++) {
      const [ax, ay] = q[k];
      const [bx, by] = q[(k + 1) % q.length];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const nx = ax + t * dx, ny = ay + t * dy;
      const d = Math.hypot(nx - px, ny - py);
      if (d < edge) {
        edge = d;
        side = Math.abs(nx - px) >= Math.abs(ny - py) ? (nx > px ? tr('right', 'rechts') : tr('left', 'links')) : ny > py ? tr('front', 'vorne') : tr('back', 'hinten');
      }
      if ((ax <= px && bx > px) || (bx <= px && ax > px)) ys.push(ay + ((px - ax) / (bx - ax)) * dy); // the playing line through the flag
    }
    if (!Number.isFinite(edge) || ys.length < 2) return null;
    const front = Math.max(...ys) - py; // +y = towards the player
    const back = py - Math.min(...ys);
    const along = front <= back ? tr(`${fmt(front)} from the front`, `${fmt(front)} von vorne`) : tr(`${fmt(back)} to the back`, `${fmt(back)} bis hinten`);
    return `${along} · ${tr(`${fmt(edge)} from the edge ${side}`, `${fmt(edge)} vom Rand ${side}`)}`;
  })();

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet putt-editor" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        {/* ✕ = close, what was moved kept (Sascha 13.11.2026); the save floating bottom right, above the sheet (Sascha
            11.11.2026: "der Speicherbutton soll auch in der Rundennachbereitung schweben") */}
        <div className="sheet-head">
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={close}>
            ✕
          </button>
          <strong>{props.title}</strong>
          <span aria-hidden="true" />
        </div>
        <FloatActions overSheet save={{ label: tr('Save putts', 'Putts speichern'), onClick: () => props.onSave({ pin, balls, putts: balls.length }) }} />
        {/* no explanation, no zoom buttons (Sascha 17.10.2026) – two fingers zoom and move the green */}
        {SHOW_ZOOM_BUTTONS && (
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
        )}
        <div className="putt-wrap">
        {active != null && (
          <div className="putt-readout" aria-live="polite">
            {active === 'pin' ? (
              <>
                {`${tr('Flag', 'Fahne')} · ${balls.map((b, k) => `${k + 1}: ${fmt(distanceM(b, pin))}`).join(' · ')}`}
                {pinSpot && <span className="putt-readout-sub">{pinSpot}</span>}
              </>
            ) : (
              `${tr('Putt', 'Putt')} ${active + 1}: ${fmt(distanceM(balls[active], pin))}`
            )}
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
          // only the green's own loss ends a finger (Sascha 11.11.2026: "sometimes I could not move the putts and the
          // flag"): on the iPhone a finger belongs to the ball or flag it touched first – taken over by the green above,
          // the ball "loses" it and that bubbled up here and ended the drag before it began
          onLostPointerCapture={(ev) => ev.target === ev.currentTarget && lift(ev)}
          onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
          role="img"
          aria-label={tr('Green with flag and balls', 'Grün mit Fahne und Bällen')}
        >
          {photo.map((t) => (
            <image key={t.key} href={t.href} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={t.m} className="putt-photo" aria-hidden="true" />
          ))}
          {bunkers.map((b, k) => (
            <polygon key={k} points={b.map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} className={`putt-bunker${photo.length ? ' on-photo' : ''}`} strokeWidth={r * 0.25} />
          ))}
          <polygon points={ring.map(toXY).map(([x, y]) => `${x},${y}`).join(' ')} className={`putt-green-shape${photo.length ? ' on-photo' : ''}`} strokeWidth={r * 0.35} />
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
              <g className="putt-pin" aria-label={tr('Flag, drag to the hole', 'Fahne, zum Loch ziehen')}>
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
              <g key={k} className="putt-ball" aria-label={tr(`Ball before putt ${k + 1}, drag to move`, `Ball vor Putt ${k + 1}, zum Verschieben ziehen`)}>
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
        {props.countable && (
          <div className="stepper-row putt-count">
            <span className="stepper-label">{tr('Putts', 'Putts')}</span>
            <div className="stepper" role="group" aria-label={tr('Putts', 'Putts')}>
              <button type="button" aria-label={tr('Putts minus one', 'Putts minus eins')} disabled={balls.length === 0} onClick={() => setBalls((b) => b.slice(0, -1))}>
                −
              </button>
              <span className="stepper-value" aria-live="polite">
                {balls.length}
              </span>
              <button type="button" aria-label={tr('Putts plus one', 'Putts plus eins')} disabled={balls.length >= 6} onClick={() => setBalls((b) => [...b, nextBall(b)])}>
                +
              </button>
            </div>
          </div>
        )}
        {pinSpot && (
          <p className="putt-pinspot small" style={{ margin: 0 }}>
            {tr('Flag: ', 'Fahne: ')}
            {pinSpot}
          </p>
        )}
        {walk && (
          <p className="muted small" style={{ margin: 0 }}>
            {tr('Dashed: your GPS walk on the green · rings: where you stood still', 'Gestrichelt: dein GPS-Laufweg auf dem Grün · Ringe: hier hast du gestanden')}
          </p>
        )}
      </section>
    </div>
  );
}
