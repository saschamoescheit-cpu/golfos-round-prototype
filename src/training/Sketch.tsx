import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { getLang, tr } from '../lib/i18n';
import { isLeftHanded } from '../lib/profile';
import { sided } from './sides';
import type { L, P, SideItem, Sketch, SketchItem } from './types';
import { Golfer, golferJoints, type GolferOptions } from './Golfer';
import { at, ballFlight, hitAt, timeline, type Frame } from './motion';
import { ballsAt, rollPlan } from './roll';

// Our own drawings for the drills (Sascha 15.10.2026: no pictures copied from the internet). A sketch is described in
// meters – top view (x to the right, y towards the target) or side view (slopes, flight) – and drawn here as SVG.
// Balls, tees and holes are drawn larger than to scale, so they stay visible on a phone.

// plain labels are written with a German decimal comma ("1,2 m") – a point in English
const plain = (t: L | string) => (typeof t === 'string' ? (getLang() === 'en' ? t.replace(/(\d),(\d)/g, '$1.$2') : t) : tr(t.en, t.de));

export { swapSides } from './sides';
// the sketch texts follow the mirrored drawing for left-handers
const txt = (t: L | string) => sided(plain(t));

/** the drawing of a sketch, mirrored for left-handers; texts inside stay readable (MText) */
const MirrorCtx = createContext(false);
function Mirror(props: { w: number; children: ReactNode }) {
  const m = isLeftHanded();
  return <MirrorCtx.Provider value={m}>{m ? <g transform={`translate(${props.w} 0) scale(-1 1)`}>{props.children}</g> : props.children}</MirrorCtx.Provider>;
}
/** a text in a sketch: in a mirrored drawing it is flipped back around its x and its alignment swaps sides */
function MText(props: SVGProps<SVGTextElement>) {
  const m = useContext(MirrorCtx);
  if (!m) return <text {...props} />;
  const x = Number(props.x ?? 0);
  const a = props.textAnchor ?? 'start';
  return <text {...props} textAnchor={a === 'start' ? 'end' : a === 'end' ? 'start' : a} transform={`matrix(-1 0 0 1 ${2 * x} 0)`} />;
}

const C = {
  bg: '#5d8f3a',
  rough: '#4b7a2e',
  fairway: '#6ea545',
  fringe: '#7fb850',
  green: '#8cc95c',
  sand: '#e9d9a6', // ci-allow: bunker sand
  water: '#4f8fc0',
  mat: '#3f8a4a',
  line: '#ffffff',
  roll: '#ffffff',
  flight: '#ffffff', // dotted white over the grass (no yellow – CI 16.10.2026)
  aim: '#ff7a59',
  club: '#d8dde2',
  text: '#10210c',
  ring: '#ffffff',
  stick: '#ff9d2e',
  sky: '#cfe6f5',
  ground: '#6ea545',
};

/** the figure that moves: the one named, else the one at the ball (a sequence of steps has the ball at its address) */
function motionFig(s: Extract<Sketch, { view: 'side' }>, m: NonNullable<Extract<Sketch, { view: 'side' }>['motion']>): number {
  if (m.fig !== undefined) return m.fig;
  const figs = s.items.filter((x): x is Extract<SideItem, { k: 'figure' }> => x.k === 'figure');
  const ball = s.items.find((x): x is Extract<SideItem, { k: 'ball' }> => x.k === 'ball');
  if (!ball || figs.length < 2) return 0;
  let best = 0;
  figs.forEach((f, i) => Math.abs(f.at[0] - ball.at[0]) < Math.abs(figs[best].at[0] - ball.at[0]) && (best = i));
  return best;
}

// the 3D video of a movement: three.js only loads when it is played
const Swing3D = lazy(() => import('./anim3d/Swing3D'));

/** a figure's options that stay the same through a movement */
const KEEP: (keyof GolferOptions)[] = ['club', 'stance', 'flip', 'oneHand', 'gripStick', 'towel', 'spineClub', 'crossClub'];

/** Plays the movement of a side sketch: three runs, then the still picture again (a tap stops it earlier). */
function useMotion(s: Sketch) {
  const motion = s.view === 'side' ? s.motion : undefined;
  // one timeline per moving figure; the first one names the phases
  const tls = useMemo(() => {
    if (!motion || s.view !== 'side' || !motion.frames.length) return null;
    const figs = s.items.filter((x): x is Extract<SideItem, { k: 'figure' }> => x.k === 'figure');
    const parts = [{ fig: motionFig(s, motion), frames: motion.frames }, ...(motion.with ?? [])];
    const out = parts.flatMap((p) => {
      const fig = figs[p.fig];
      if (!fig) return [];
      const base: Omit<GolferOptions, 'pose'> = {};
      for (const k of KEEP) if (fig[k] !== undefined) (base as Record<string, unknown>)[k] = fig[k];
      return [{ fig: p.fig, tl: timeline(base, { frames: p.frames }) }];
    });
    return out.length ? out : null;
  }, [s, motion]);
  const total = tls ? Math.max(...tls.map((x) => x.tl.total)) : 0;
  const [time, setTime] = useState<number | null>(null);
  const playing = time !== null;
  const raf = useRef(0);
  useEffect(() => {
    if (!playing || !tls) return;
    const run = total + 0.9; // a short rest in the finish before the next run
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= run * 3) return setTime(null);
      setTime(Math.min(t % run, total));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, tls, total]);
  if (!tls || !motion || s.view !== 'side') return null;
  const now = time === null ? null : tls.map((x) => ({ fig: x.fig, ...at(x.tl, time) }));
  const frames = now ? new Map(now.map((x) => [x.fig, x.j])) : undefined;
  // the ball of each moving figure after its hit: [dx, dy] in metres
  const balls = time === null ? undefined : new Map(tls.flatMap((x) => {
    const h = hitAt(x.tl, time);
    return h ? [[x.fig, ballFlight(h.shot, h.since)] as [number, [number, number]]] : [];
  }));
  return { playing, frames, balls, label: now?.[0].label, toggle: () => setTime(playing ? null : 0) };
}

/** The ball on a top view: rolling or flying along its drawn paths (three runs, a tap stops it earlier). */
function useRoll(s: Sketch) {
  const plan = useMemo(() => rollPlan(s), [s]);
  const [time, setTime] = useState<number | null>(null);
  const playing = time !== null;
  const raf = useRef(0);
  useEffect(() => {
    if (!playing || !plan) return;
    const run = plan.total + 0.6;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= run * 3) return setTime(null);
      setTime(Math.min(t % run, plan.total));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, plan]);
  if (!plan) return null;
  return {
    playing,
    rolling: time === null ? undefined : { balls: ballsAt(plan, time), hide: plan.starts.filter((x) => x.t <= time).map((x) => x.at) },
    toggle: () => setTime(playing ? null : 0),
  };
}

export function SketchView(props: { sketch: Sketch; label?: string }) {
  const s = props.sketch;
  const caption = s.caption ? txt(s.caption) : null;
  const motion = useMotion(s);
  const video = s.view === 'side' ? s.motion?.video : undefined;
  const roll = useRoll(s);
  const [show3d, setShow3d] = useState(false);
  const player = video
    ? { on: show3d, close: show3d, toggle: () => setShow3d(!show3d), label: show3d ? tr('Back to the picture', 'Zurück zum Bild') : tr('Play the 3D video', '3D-Video abspielen') }
    : roll && !motion
      ? { on: roll.playing, close: false, toggle: roll.toggle, label: roll.playing ? tr('Stop', 'Stopp') : tr('Play the movement', 'Bewegung abspielen') }
      : motion
        ? { on: motion.playing, close: false, toggle: motion.toggle, label: motion.playing ? tr('Stop', 'Stopp') : tr('Play the movement', 'Bewegung abspielen') }
        : null;
  const callouts: (L | string)[] =
    s.view === 'side' || s.view === 'top' ? (s.items as (SideItem | SketchItem)[]).flatMap((x) => (x.k === 'callout' || x.k === 'mark' ? [x.t] : [])) : s.view === 'grip' || s.view === 'palm' ? s.notes : [];
  return (
    <figure className="tr-sketch">
      {/* the picture, and in its corner the play symbol (Sascha 17.10.2026: no separate button, a symbol in the
          picture, bottom right); green while it plays; a 3D video closes with its symbol at the top right */}
      <div className="tr-sketch-pic">
        {video && show3d ? (
          <Suspense fallback={<Side sketch={s as Extract<Sketch, { view: 'side' }>} label={props.label} />}>
            <Swing3D swing={video} onFail={() => setShow3d(false)} />
          </Suspense>
        ) : s.view === 'top' ? (
          <Top sketch={s} label={props.label} rolling={roll?.rolling} />
        ) : s.view === 'side' ? (
          <Side sketch={s} label={props.label} moving={motion?.playing ? motion.frames : undefined} flying={motion?.playing ? motion.balls : undefined} />
        ) : s.view === 'grip' ? (
          <Grip label={props.label} />
        ) : s.view === 'palm' ? (
          <Palm label={props.label} />
        ) : (
          <Face marks={s.marks} label={props.label} />
        )}
        {player && (
          <button type="button" className={`tr-motion-btn${player.on ? ' on' : ''}${player.close ? ' close' : ''}`} onClick={player.toggle} aria-pressed={player.on} aria-label={player.label} title={player.label}>
            {player.close ? (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            ) : player.on ? (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect x="3" y="2" width="3.6" height="12" rx="1" fill="currentColor" />
                <rect x="9.4" y="2" width="3.6" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M4.5 2.2v11.6c0 .6.7 1 1.2.7l9-5.8c.5-.3.5-1.1 0-1.4l-9-5.8c-.5-.3-1.2.1-1.2.7z" fill="currentColor" />
              </svg>
            )}
          </button>
        )}
      </div>
      {motion?.playing && <div className="tr-motion-phase">{motion.label ? txt(motion.label) : '\u00a0'}</div>}
      {callouts.length > 0 && (
        <ol className="tr-callouts">
          {callouts.map((t, n) => (
            <li key={n}>
              <span className="tr-callout-no" aria-hidden="true">
                {n + 1}
              </span>
              <span>{txt(t)}</span>
            </li>
          ))}
        </ol>
      )}
      {caption && <figcaption className="muted small">{caption}</figcaption>}
    </figure>
  );
}

/** The sketch as a small picture in lists (Sascha 16.10.2026: "a small thumbnail with every drill") – no labels. */
export function SketchThumb(props: { sketch?: Sketch; fallback?: ReactNode }) {
  const s = props.sketch;
  if (!s) return <span className="tr-cat-icon small">{props.fallback}</span>;
  return (
    <span className="tr-thumb" aria-hidden="true">
      {s.view === 'top' ? <Top sketch={s} thumb /> : s.view === 'side' ? <Side sketch={s} thumb /> : s.view === 'grip' ? <Grip thumb /> : s.view === 'palm' ? <Palm thumb /> : <Face marks={s.marks} />}
      {/* the picture moves: a small play mark, so the moving pictures can be found in the lists */}
      {((s.view === 'side' && s.motion) || rollPlan(s)) && (
        <span className="tr-thumb-play">
          <svg viewBox="0 0 16 16" width="8" height="8">
            <path d="M4 2.2v11.6c0 .6.7 1 1.2.7l9-5.8c.5-.3.5-1.1 0-1.4l-9-5.8C4.7 1.2 4 1.6 4 2.2z" fill="currentColor" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** places the numbered marks: beside their point, towards dir; a mark that would sit on another one or outside the
 *  picture takes the next free place around the point */
function placeBadges<T>(points: { key: T; jx: number; jy: number; dir: number }[], W: number, H: number) {
  const badges = new Map<T, { jx: number; jy: number; mx: number; my: number; no: number }>();
  points.forEach(({ key, jx, jy, dir }, n) => {
    const tries: P[] = [[16, -12], [18, 6], [8, -20], [-16, -12], [28, -4], [-18, 6], [0, -24], [30, -22], [-8, -20], [24, 18]];
    const free = (x: number, y: number) => x > 10 && x < W - 10 && y > 10 && y < H - 10 && [...badges.values()].every((o) => Math.hypot(o.mx - x, o.my - y) > 19 && Math.hypot(o.jx - x, o.jy - y) > 11);
    const pick = tries.map(([dx, dy]): P => [jx + dir * dx, jy + dy]).find(([x, y]) => free(x, y)) ?? [Math.min(W - 10, Math.max(10, jx + dir * 16)), Math.max(10, jy - 12)];
    badges.set(key, { jx, jy, mx: pick[0], my: pick[1], no: n + 1 });
  });
  return badges;
}
function Badge(props: { jx: number; jy: number; mx: number; my: number; no: number }) {
  const { jx, jy, mx, my, no } = props;
  const d = Math.hypot(mx - jx, my - jy) || 1;
  return (
    <g>
      <circle cx={jx} cy={jy} r={4} fill="none" stroke="#5e8a14" strokeWidth={2} />
      <line x1={jx + ((mx - jx) / d) * 4} y1={jy + ((my - jy) / d) * 4} x2={mx - ((mx - jx) / d) * 8.5} y2={my - ((my - jy) / d) * 8.5} stroke="#5e8a14" strokeWidth={1.6} />
      <circle cx={mx} cy={my} r={8.5} fill="#5e8a14" stroke="#ffffff" strokeWidth={1.4} />
      <MText x={mx} y={my + 4} fontSize={11} fontWeight={800} fill="#ffffff" textAnchor="middle">
        {no}
      </MText>
    </g>
  );
}

function Top(props: { sketch: Extract<Sketch, { view: 'top' }>; label?: string; thumb?: boolean; rolling?: { balls: { at: P; lift: number }[]; hide: P[] } }) {
  const { w, h, items } = props.sketch;
  // a tall sketch gets a narrower canvas so it is never higher than 360 px (the CSS limit): the texts and balls keep
  // their size instead of being scaled down
  const W = Math.min(340, Math.round((360 * w) / h));
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
  const badges = placeBadges(
    items.flatMap((it) => (it.k === 'mark' ? [{ key: it as SketchItem, jx: X(it.at[0]), jy: Y(it.at[1]), dir: X(it.at[0]) > W * 0.75 ? -1 : 1 }] : [])),
    W,
    H,
  );
  const draw = (it: SketchItem, i: number): ReactNode => {
    if (it.k === 'mark') {
      const m = badges.get(it);
      return m ? <Badge key={i} {...m} /> : null;
    }
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
        return <rect key={i} x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={3} fill="#f2f4f3" stroke="#c3c9c6" strokeWidth={1.5} />;
      case 'zone':
        return (
          <g key={i}>
            <rect x={X(it.x)} y={Y(it.y + it.h)} width={it.w * k} height={it.h * k} rx={4} fill="#ffffff22" stroke={C.line} strokeWidth={2} strokeDasharray="6 4" />
            {it.label && (
              <MText x={X(it.x + it.w / 2)} y={Math.min(Y(it.y + it.h / 2) + 4, Y(it.y + it.h) + 16)} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.text}>
                {txt(it.label)}
              </MText>
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
        if (props.rolling?.hide.some((h) => Math.hypot(h[0] - it.at[0], h[1] - it.at[1]) < 0.15)) return null;
        return (
          <g key={i} opacity={it.ghost ? 0.5 : 1}>
            <circle cx={X(it.at[0])} cy={Y(it.at[1])} r={5.5} fill="#ffffff" stroke="#55606a" strokeWidth={1} />
            {it.n != null && (
              // labels of balls near the right edge go to the left of the ball
              <MText x={X(it.at[0]) + (X(it.at[0]) > W - 70 ? -8 : 8)} y={Y(it.at[1]) - 6} fontSize={11} fontWeight={700} fill={C.text} textAnchor={X(it.at[0]) > W - 70 ? 'end' : 'start'}>
                {typeof it.n === 'object' ? txt(it.n) : it.n}
              </MText>
            )}
          </g>
        );
      case 'tee':
        return <circle key={i} cx={X(it.at[0])} cy={Y(it.at[1])} r={3.2} fill="#ffffff" stroke="#55606a" strokeWidth={1.2} />;
      case 'coin':
        return <circle key={i} cx={X(it.at[0])} cy={Y(it.at[1])} r={5} fill="#d5dade" stroke="#7d8790" strokeWidth={1.2} />;
      case 'stick':
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke={C.stick} strokeWidth={4} strokeLinecap="round" />;
      case 'string':
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke="#ffffff" strokeWidth={1.5} strokeDasharray="2 3" />;
      case 'ring':
        return (
          <g key={i}>
            <circle cx={X(it.at[0])} cy={Y(it.at[1])} r={it.r * k} fill={it.fill ? '#ffffff33' : 'none'} stroke={C.ring} strokeWidth={3} />
            {it.label && (
              <MText x={X(it.at[0])} y={Y(it.at[1]) - it.r * k - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.text}>
                {txt(it.label)}
              </MText>
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
        if (it.stance) {
          // feet to scale (about 28 × 10 cm), the stance width between their centres
          const half = (it.stance / 2) * k;
          return (
            <g key={i} transform={`translate(${x},${y}) rotate(${rot})`} aria-hidden="true">
              <ellipse cx={0} cy={-half} rx={0.14 * k} ry={0.05 * k} fill="#2b3a44" />
              <ellipse cx={0} cy={half} rx={0.14 * k} ry={0.05 * k} fill="#2b3a44" />
            </g>
          );
        }
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
        return <rect key={i} x={x - w / 2} y={y + 6} width={w} height={6} rx={2} fill="#d8dde2" stroke="#55606a" strokeWidth={1} transform={it.angle ? `rotate(${it.angle} ${x} ${y + 9})` : undefined} />;
      }
      case 'slope': {
        const [x, y] = [X(it.at[0]), Y(it.at[1])];
        const rad = (it.dir * Math.PI) / 180;
        const [cx, sy] = [Math.cos(rad), Math.sin(rad)];
        // the label beside the arrow – on the other side when it would run out of the picture
        const label = it.label ? txt(it.label) : '';
        const tw = label.length * 6.4;
        let side = cx > 0.3 ? 1 : cx < -0.3 ? -1 : 0;
        if (side === 1 && x + 14 + tw > W - 4) side = -1;
        else if (side === -1 && x - 14 - tw < 4) side = 1;
        return (
          <g key={i}>
            <g transform={`translate(${x},${y}) rotate(${it.dir})`}>
              <line x1={0} y1={16} x2={0} y2={-14} stroke="#16324a" strokeWidth={2.5} />
              <path d="M0,-18 l-6,9 l12,0 z" fill="#16324a" />
            </g>
            {label && (
              <MText x={x + 14 * side} y={y + 18 * sy + 4} fontSize={11} fill="#16324a" fontWeight={700} textAnchor={side > 0 ? 'start' : side < 0 ? 'end' : 'middle'}>
                {label}
              </MText>
            )}
          </g>
        );
      }
      case 'text':
        return (
          <MText key={i} x={X(it.at[0])} y={Y(it.at[1])} fontSize={it.size ?? 12} fontWeight={700} fill={C.text} textAnchor={it.anchor ?? 'middle'}>
            {txt(it.t)}
          </MText>
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
            <MText x={mx} y={my + 3} fontSize={11} fontWeight={700} fill="#16324a" textAnchor="middle">
              {label}
            </MText>
          </g>
        );
      }
    }
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={props.label ?? tr('Sketch of the drill', 'Skizze der Übung')} style={{ display: 'block', background: C.bg, borderRadius: 12 }}>
      <Mirror w={W}>
      <defs>
        <marker id="tr-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#16324a" />
        </marker>
      </defs>
      {(props.thumb ? items.filter((it) => it.k !== 'mark') : items).map(draw)}
      {/* the moving balls: a flying one rises above its shadow */}
      {props.rolling?.balls.map((b, n) => (
        <g key={'roll' + n}>
          {b.lift > 0 && <ellipse cx={X(b.at[0])} cy={Y(b.at[1])} rx={5} ry={2.4} fill="#00000033" />}
          <circle cx={X(b.at[0])} cy={Y(b.at[1]) - b.lift * 22} r={5.5 * (1 + 0.3 * b.lift)} fill="#ffffff" stroke="#55606a" strokeWidth={1} />
        </g>
      ))}
    </Mirror>
    </svg>
  );
}

function Side(props: { sketch: Extract<Sketch, { view: 'side' }>; label?: string; thumb?: boolean; moving?: Map<number, Frame>; flying?: Map<number, [number, number]> }) {
  const { w, h, items } = props.sketch;
  const W = 340;
  const k = W / w;
  const H = Math.round(h * k);
  const X = (x: number) => x * k;
  const Y = (y: number) => H - y * k;
  // the numbered marks of the details: beside the joint, towards the side of the text anchor; a mark that would sit on
  // another one or outside the picture takes the next free place around the joint
  const figs = items.filter((x): x is Extract<SideItem, { k: 'figure' }> => x.k === 'figure');
  const anchors = items.flatMap((it) => {
    if (it.k === 'mark') return [{ key: it as SideItem, jx: X(it.at[0]), jy: Y(it.at[1]), dir: X(it.at[0]) > W * 0.75 ? -1 : 1 }];
    if (it.k !== 'callout') return [];
    const f = figs[it.fig ?? 0];
    const jt = f && golferJoints({ ...f, pose: f.pose ?? 'address' })[it.on];
    if (!f || !jt) return [];
    const a = ((f.tilt ?? 0) * Math.PI) / 180;
    const jx = X(f.at[0]) + jt[0] * k * Math.cos(a) - jt[1] * k * Math.sin(a);
    const jy = Y(f.at[1]) - (jt[1] * k * Math.cos(a) + jt[0] * k * Math.sin(a));
    return [{ key: it as SideItem, jx, jy, dir: X(it.at[0]) < jx ? -1 : 1 }];
  });
  const badges = placeBadges(anchors, W, H);
  const draw = (it: SideItem, i: number): ReactNode => {
    switch (it.k) {
      case 'ground': {
        const pts = it.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
        return <polygon key={i} points={`${X(it.pts[0][0])},${H} ${pts} ${X(it.pts[it.pts.length - 1][0])},${H}`} fill={it.sand ? C.sand : C.ground} stroke={it.sand ? '#c9b37a' : '#3d6b22'} strokeWidth={2} />;
      }
      case 'figure': {
        // the moving figure takes the joints of the movement; the numbers wait for the still picture
        const frame = props.moving?.get(figs.indexOf(it));
        // the other figures of the picture (the steps of a sequence) step aside while one moves through them
        if (props.moving && !frame) return null;
        return <Golfer key={i} {...it} x={X(it.at[0])} y={Y(it.at[1])} k={k} tilt={it.tilt ?? 0} pose={it.pose ?? 'address'} frame={frame} />;
      }
      case 'callout':
      case 'mark': {
        if (props.moving) return null;
        const m = badges.get(it);
        return m ? <Badge key={i} {...m} /> : null;
      }
      case 'ball': {
        // after the hit the ball of the nearest moving figure leaves – rolling, low, high or out of the picture
        let d: [number, number] = [0, 0];
        if (props.flying?.size) {
          let best = -1;
          figs.forEach((f, n) => props.flying!.has(n) && Math.abs(f.at[0] - it.at[0]) < 0.9 && (best < 0 || Math.abs(f.at[0] - it.at[0]) < Math.abs(figs[best].at[0] - it.at[0])) && (best = n));
          if (best >= 0) d = props.flying.get(best)!;
        }
        return <circle key={i} cx={X(it.at[0] + d[0])} cy={Y(it.at[1] + d[1]) - 4} r={4.5} fill="#ffffff" stroke="#55606a" />;
      }
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
        return <path key={i} d={d} fill="none" stroke="#4f7a14" strokeWidth={2.4} strokeDasharray={it.dashed ? '3 4' : undefined} />;
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
        return <line key={i} x1={X(it.from[0])} y1={Y(it.from[1])} x2={X(it.to[0])} y2={Y(it.to[1])} stroke={it.stick ? '#ff9d2e' : '#16324a'} strokeWidth={it.stick ? 3 : 1.5} strokeLinecap={it.stick ? 'round' : undefined} strokeDasharray={it.dashed ? '5 4' : undefined} />;
      case 'text':
        return (
          <MText key={i} x={X(it.at[0])} y={Y(it.at[1])} fontSize={it.size ?? 12} fontWeight={700} fill="#16324a" textAnchor={it.anchor ?? 'middle'}>
            {txt(it.t)}
          </MText>
        );
    }
  };
  // as a thumbnail: a square around the figures (or everything else when there is no figure)
  let view = `0 0 ${W} ${H}`;
  if (props.thumb) {
    const figs = items.filter((it): it is Extract<SideItem, { k: 'figure' }> => it.k === 'figure');
    const pts: [number, number][] = figs.length
      ? figs.flatMap((f) => [[f.at[0] - 1.1, f.at[1]], [f.at[0] + 1.1, f.at[1] + 1.9]] as [number, number][])
      : items.flatMap((it) => ('at' in it ? [it.at] : 'from' in it ? [it.from, it.to] : 'pts' in it ? it.pts : []));
    if (pts.length) {
      const x0 = Math.min(...pts.map((p) => X(p[0])));
      const x1 = Math.max(...pts.map((p) => X(p[0])));
      const y0 = Math.min(...pts.map((p) => Y(p[1])));
      const y1 = Math.max(...pts.map((p) => Y(p[1])));
      const size = Math.min(Math.max(x1 - x0, y1 - y0) + 24, Math.max(W, H));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const vx = isLeftHanded() ? W - (cx + size / 2) : cx - size / 2;
      view = `${vx.toFixed(1)} ${(cy - size / 2).toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`;
    }
  }
  return (
    <svg viewBox={view} width="100%" role="img" aria-label={props.label ?? tr('Sketch', 'Skizze')} style={{ display: 'block', background: C.sky, borderRadius: 12 }}>
      <Mirror w={W}>
      {/* a thumbnail shows the scene only – numbered marks and texts are unreadable that small */}
      {(props.thumb ? items.filter((it) => it.k !== 'callout' && it.k !== 'mark' && it.k !== 'text') : items).map(draw)}
    </Mirror>
    </svg>
  );
}

/** The club face from the front with impact marks (x, y from -1 to 1: toe/heel, high/low). */
/** Both hands on the grip as the player sees them looking down (right-hander): the gloved lead hand on top with
 *  its knuckles, the trail hand below covering the lead thumb; both Vs point to the trail shoulder. Numbered points
 *  1–4 match the notes in the legend. */
function Grip(props: { label?: string; thumb?: boolean }) {
  const glove = '#f4f6f7';
  const gloveLine = '#b9c3cb';
  const skin = '#d9ad86';
  const skinLine = '#b88a63';
  const badge = (n: number, x: number, y: number, jx: number, jy: number) => (
    <g key={n}>
      <circle cx={jx} cy={jy} r={4} fill="none" stroke="#5e8a14" strokeWidth={2} />
      <line x1={jx} y1={jy} x2={x} y2={y} stroke="#5e8a14" strokeWidth={1.6} />
      <circle cx={x} cy={y} r={9} fill="#5e8a14" stroke="#ffffff" strokeWidth={1.4} />
      <MText x={x} y={y + 4} fontSize={11} fontWeight={800} fill="#ffffff" textAnchor="middle">
        {n}
      </MText>
    </g>
  );
  return (
    <svg viewBox="0 0 340 300" width="100%" role="img" aria-label={props.label ?? tr('The grip as you see it', 'Der Griff, wie du ihn siehst')} style={{ display: 'block', background: C.sky, borderRadius: 12 }}>
      <Mirror w={340}>
      {/* your own chest and shoulders, seen from above */}
      <path d="M20,0 L320,0 L320,22 Q300,52 250,54 L90,54 Q40,52 20,22 z" fill="#3f5f73" />
      {!props.thumb && (
        <>
          <MText x={44} y={26} fontSize={11} fontWeight={700} fill="#ffffff">
            {tr('lead shoulder', 'vordere Schulter')}
          </MText>
          <MText x={296} y={26} fontSize={11} fontWeight={700} fill="#ffffff" textAnchor="end">
            {tr('trail shoulder', 'hintere Schulter')}
          </MText>
        </>
      )}
      {/* the club: grip, then the shaft down to the ball */}
      <line x1={168} y1={70} x2={182} y2={300} stroke="#c3cbd2" strokeWidth={5} />
      <path d="M156,64 L180,62 L186,236 L170,238 z" fill="#25313a" />
      {/* the V lines to the trail shoulder */}
      <line x1={184} y1={118} x2={292} y2={34} stroke="#5e8a14" strokeWidth={2} strokeDasharray="5 4" />
      <line x1={178} y1={176} x2={286} y2={92} stroke="#5e8a14" strokeWidth={2} strokeDasharray="5 4" />
      {/* lead hand (glove): back of the hand, knuckles, thumb down the right side of the grip */}
      <path d="M118,100 Q114,84 132,80 L190,74 Q206,74 206,92 L204,132 Q202,146 186,148 L134,152 Q118,152 118,138 z" fill={glove} stroke={gloveLine} strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={'f' + i} x={104} y={86 + i * 15} width={22} height={14} rx={7} fill={glove} stroke={gloveLine} strokeWidth={1.5} />
      ))}
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={138 + i * 17} cy={89 - i * 2} rx={7} ry={5} fill="none" stroke={gloveLine} strokeWidth={1.5} />
      ))}
      <path d="M182,116 Q194,114 196,128 L194,170 Q192,180 184,180 Q176,178 177,168 z" fill={glove} stroke={gloveLine} strokeWidth={1.5} />
      {/* trail hand (skin): wraps below, its palm (life line) over the lead thumb, its thumb down the left side */}
      <path d="M140,160 Q136,146 152,144 L176,142 Q186,146 196,150 L214,154 Q228,158 226,176 L222,206 Q220,220 204,222 L158,226 Q142,226 142,210 z" fill={skin} stroke={skinLine} strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={'t' + i} x={214} y={158 + i * 15} width={22} height={14} rx={7} fill={skin} stroke={skinLine} strokeWidth={1.5} />
      ))}
      <path d="M150,170 Q170,188 196,172" fill="none" stroke={skinLine} strokeWidth={1.5} />
      <path d="M160,196 Q170,194 172,206 L170,246 Q168,256 160,256 Q152,254 153,244 z" fill={skin} stroke={skinLine} strokeWidth={1.5} />
      {!props.thumb && [badge(1, 150, 64, 138, 89), badge(2, 222, 112, 186, 118), badge(3, 122, 196, 166, 182), badge(4, 262, 132, 192, 168)]}
    </Mirror>
    </svg>
  );
}

/** The open lead hand, palm up, twice (Sascha 17.10.2026: the fault next to the right way): left the grip runs through
 *  the palm like a hammer (fault), right diagonally through the fingers – from the base of the little finger to the
 *  middle of the index finger. Numbered 1 and 2 like the legend. */
function Palm(props: { label?: string; thumb?: boolean }) {
  const skin = '#d9ad86';
  const line = '#b88a63';
  const hand = (ox: number, grip: 'palm' | 'fingers', no: number) => {
    // the hand: palm, four fingers up, the thumb to the right (lead hand of a right-hander, palm towards you)
    const fingers = [0, 1, 2, 3].map((f) => {
      const x = ox + 34 + f * 22;
      const len = [58, 66, 62, 50][3 - f];
      return <rect key={f} x={x - 9} y={92 - len} width={18} height={len + 14} rx={9} fill={skin} stroke={line} strokeWidth={1.4} />;
    });
    const club = grip === 'fingers' ? { x1: ox + 18, y1: 110, x2: ox + 130, y2: 64 } : { x1: ox + 40, y1: 186, x2: ox + 120, y2: 102 };
    const mid = { x: (club.x1 + club.x2) / 2, y: (club.y1 + club.y2) / 2 };
    return (
      <g key={grip}>
        {fingers}
        <path d={`M${ox + 24},96 L${ox + 112},96 Q${ox + 122},150 ${ox + 104},196 L${ox + 40},196 Q${ox + 20},150 ${ox + 24},96 z`} fill={skin} stroke={line} strokeWidth={1.4} />
        <path d={`M${ox + 108},120 Q${ox + 150},116 ${ox + 156},90 Q${ox + 160},76 ${ox + 148},76 Q${ox + 136},96 ${ox + 106},104 z`} fill={skin} stroke={line} strokeWidth={1.4} />
        {/* finger roots and the life line */}
        <path d={`M${ox + 28},104 Q${ox + 70},112 ${ox + 112},102`} fill="none" stroke={line} strokeWidth={1.2} />
        <path d={`M${ox + 104},112 Q${ox + 70},140 ${ox + 72},190`} fill="none" stroke={line} strokeWidth={1.2} />
        <line {...club} stroke="#25313a" strokeWidth={14} strokeLinecap="round" opacity={0.85} />
        {!props.thumb && <Badge jx={mid.x} jy={mid.y} mx={mid.x - 26} my={mid.y - 18} no={no} />}
        {!props.thumb && (
          <MText x={ox + 80} y={226} fontSize={12} fontWeight={800} fill="#16324a" textAnchor="middle">
            {no === 1 ? tr('The fault', 'Der Fehler') : tr('Right', 'Richtig')}
          </MText>
        )}
      </g>
    );
  };
  return (
    <svg viewBox="0 0 340 240" width="100%" role="img" aria-label={props.label ?? tr('Where the grip lies in the lead hand', 'Wo der Griff in der vorderen Hand liegt')} style={{ display: 'block', background: C.sky, borderRadius: 12 }}>
      <Mirror w={340}>
        {hand(4, 'palm', 1)}
        {hand(172, 'fingers', 2)}
      </Mirror>
    </svg>
  );
}

function Face(props: { marks: { x: number; y: number; n?: L | string }[]; label?: string }) {
  return (
    <svg viewBox="0 0 340 170" width="100%" role="img" aria-label={props.label ?? tr('Club face', 'Schlagfläche')} style={{ display: 'block', background: '#2a3640', borderRadius: 12 }}>
      <Mirror w={340}>
      <path d="M40,120 Q40,40 120,38 L270,34 Q312,36 306,92 Q300,130 250,134 L60,136 Q40,136 40,120 z" fill="#c9d0d6" stroke="#8b959d" strokeWidth={2} />
      {[60, 75, 90, 105, 120].map((y) => (
        <line key={y} x1={70} x2={285} y1={y} y2={y - 2} stroke="#9aa4ab" strokeWidth={1} />
      ))}
      <line x1={10} y1={30} x2={44} y2={78} stroke="#8b959d" strokeWidth={6} strokeLinecap="round" />
      <circle cx={175} cy={86} r={14} fill="none" stroke="#46c46e" strokeWidth={2} strokeDasharray="3 3" />
      {props.marks.map((m, i) => (
        <g key={i}>
          <ellipse cx={175 + m.x * 95} cy={86 - m.y * 40} rx={8} ry={6} fill="#1d5fa8" opacity={0.75} />
          {m.n && (
            <MText x={Math.min(240, Math.max(112, 175 + m.x * 95))} y={86 - m.y * 40 + 22} fontSize={11} fill="#16324a" textAnchor="middle" fontWeight={700}>
              {txt(m.n)}
            </MText>
          )}
        </g>
      ))}
      <MText x={60} y={160} fontSize={11} fill="#c9d3cc">
        {tr('heel', 'Ferse')}
      </MText>
      <MText x={290} y={160} fontSize={11} fill="#c9d3cc" textAnchor="end">
        {tr('toe', 'Spitze')}
      </MText>
    </Mirror>
    </svg>
  );
}
