import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';

// Pictures of the mobility screen that the side sketches of Training cannot show: the turn seen from above (how far
// the shoulders, hips or head turn – the angle the camera measures), where the phone goes, and the forearm and wrist
// checks. Same palette as the Training sketches (sky, ground, the golfer's shirt and skin), so they sit next to them.

const C = {
  sky: '#cfe6f5',
  ground: '#6ea545',
  shirt: '#3f5f73',
  trousers: '#25313a',
  skin: '#d9ad86',
  outline: '#16212a',
  goal: '#2f6f1c', // the target line – dark brand green on the light sky
  start: '#7d8790',
  shaft: '#5c6870',
  grip: '#1c2328',
  phone: '#16212a',
  text: '#10210c',
};

const rad = (d: number) => (d * Math.PI) / 180;

function Frame(props: { w: number; h: number; label: string; children: ReactNode; thumb?: boolean }) {
  return (
    <svg viewBox={`0 0 ${props.w} ${props.h}`} width="100%" role={props.thumb ? undefined : 'img'} aria-label={props.thumb ? undefined : props.label} aria-hidden={props.thumb ? true : undefined} style={{ display: 'block', borderRadius: 12, background: C.sky }}>
      {props.children}
    </svg>
  );
}

/** an arc from a0 to a1 (degrees, 0 = up the picture, + = clockwise) around (cx, cy) */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/**
 * The turn seen from above: the player faces down the picture, towards the phone. The moving part (shoulders, hips or
 * head) turns by `goal` degrees to each side (dashed green), the other part stays (grey).
 */
export function TopTurn(props: { part: 'shoulders' | 'hips' | 'head'; goal: number; still?: 'hips' | 'shoulders' | 'feet'; thumb?: boolean }) {
  const W = 340;
  const H = 250;
  const cx = W / 2;
  const cy = 112;
  const g = props.goal;
  const partName = props.part === 'shoulders' ? tr('chest', 'Brust') : props.part === 'hips' ? tr('hips', 'Hüfte') : tr('head', 'Kopf');
  const stillName = props.still === 'hips' ? tr('the hips stay', 'die Hüfte bleibt') : props.still === 'shoulders' ? tr('the chest stays', 'die Brust bleibt') : props.still === 'feet' ? tr('the standing foot stays', 'der Standfuß bleibt') : '';
  // a point at angle a (0 = right along the line, + = clockwise on screen) and radius r
  const at = (a: number, r: number): [number, number] => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const half = props.part === 'head' ? 30 : props.part === 'hips' ? 62 : 82;
  const bar = (a: number, color: string, width: number, dash?: string) => {
    const [x1, y1] = at(a, half);
    const [x2, y2] = at(a + 180, half);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />;
  };
  // the head: the nose points down (to the phone) and turns from there
  const nose = (a: number, color: string, width: number, dash?: string) => {
    const [x1, y1] = at(90 + a, half);
    const [x2, y2] = at(90 + a, half + 34);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />;
  };
  const arcPath = (a0: number, a1: number, r: number) => {
    const [x0, y0] = at(a0, r);
    const [x1, y1] = at(a1, r);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const base = props.part === 'head' ? 90 : 0;
  const r = props.part === 'head' ? half + 26 : half + 4;
  return (
    <Frame w={W} h={H} label={tr(`Seen from above: the ${partName} turns ${g}° to each side`, `Von oben: ${partName} dreht ${g}° zu jeder Seite`)} thumb={props.thumb}>
      <text x={12} y={22} fontSize={13} fill={C.text}>
        {tr('seen from above', 'von oben gesehen')}
      </text>
      {/* the part that stays */}
      {props.part === 'head' ? (
        <ellipse cx={cx} cy={cy} rx={86} ry={24} fill={C.shirt} opacity={0.55} />
      ) : props.still === 'hips' || props.still === 'shoulders' ? (
        <line x1={cx - (props.still === 'hips' ? 60 : 82)} y1={cy} x2={cx + (props.still === 'hips' ? 60 : 82)} y2={cy} stroke={C.start} strokeWidth={props.still === 'hips' ? 20 : 24} strokeLinecap="round" opacity={0.55} />
      ) : null}
      {/* the goal both ways */}
      {[-1, 1].map((sg) => {
        const [lx, ly] = at(base + sg * g, r + 22);
        return (
          <g key={sg}>
            {props.part === 'head' ? nose(sg * g, C.goal, 3, '6 5') : bar(sg * g, C.goal, 3, '7 5')}
            <path d={arcPath(base, base + sg * g, r)} fill="none" stroke={C.goal} strokeWidth={2.5} />
            <text x={lx} y={ly + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.goal}>
              {g}°
            </text>
          </g>
        );
      })}
      {/* the moving part, face-on */}
      {props.part === 'head' ? (
        <g>
          {nose(0, C.outline, 2, '3 4')}
          <circle cx={cx} cy={cy} r={half} fill={C.skin} stroke={C.outline} strokeWidth={2} />
          <path d={`M${cx - 8},${cy + half - 3} L${cx},${cy + half + 11} L${cx + 8},${cy + half - 3} Z`} fill={C.skin} stroke={C.outline} strokeWidth={2} />
        </g>
      ) : (
        <g>
          {bar(0, props.part === 'hips' ? C.trousers : C.shirt, props.part === 'hips' ? 18 : 22)}
          {props.part === 'shoulders' && <circle cx={cx} cy={cy} r={18} fill={C.skin} stroke={C.outline} strokeWidth={2} />}
        </g>
      )}
      <text x={12} y={H - 14} fontSize={13} fill={C.text}>
        {tr(`${partName} turns`, `${partName} dreht`)}
        {stillName ? ` · ${stillName}` : ''}
      </text>
      <Phone x={W - 40} y={H - 20} />
      <text x={W - 40} y={H - 32} textAnchor="middle" fontSize={11} fill={C.text}>
        {tr('phone', 'Handy')}
      </text>
    </Frame>
  );
}

function Phone(props: { x: number; y: number; side?: boolean }) {
  return props.side ? <rect x={props.x - 4} y={props.y - 13} width={8} height={26} rx={2} fill={C.phone} /> : <rect x={props.x - 13} y={props.y - 5} width={26} height={10} rx={2} fill={C.phone} />;
}

/**
 * Where the phone goes, seen from above: the phone on the left, the player on the right (an oval with the nose), the
 * distance between them and how high the phone stands.
 */
export function PhoneSetup(props: { view: 'front' | 'side'; height: 'floor' | 'knee' | 'hip'; thumb?: boolean }) {
  const W = 340;
  const H = 150;
  const px = 42;
  const py = 72;
  const bx = 262;
  const height = props.height === 'floor' ? tr('on the floor', 'auf dem Boden') : props.height === 'knee' ? tr('at knee height', 'auf Kniehöhe') : tr('at hip height', 'auf Hüfthöhe');
  // front: the player looks at the phone (left); side: the player looks down the picture, side-on to the phone
  const [nx, ny] = props.view === 'front' ? [bx - 22, py] : [bx, py + 22];
  return (
    <Frame w={W} h={H} label={tr(`The phone ${props.view === 'front' ? 'in front of you' : 'beside you'}, 2–3 m away, ${height}`, `Das Handy ${props.view === 'front' ? 'vor dir' : 'neben dir'}, 2–3 m entfernt, ${height}`)} thumb={props.thumb}>
      <rect x={0} y={0} width={W} height={H} fill={C.ground} opacity={0.25} />
      <text x={12} y={22} fontSize={13} fill={C.text}>
        {tr('seen from above', 'von oben gesehen')}
      </text>
      <Phone x={px} y={py} side />
      <path d={`M${px + 5},${py} L${px + 30},${py - 26} M${px + 5},${py} L${px + 30},${py + 26}`} stroke={C.phone} strokeWidth={1.5} opacity={0.5} />
      <line x1={px + 34} y1={py} x2={bx - 48} y2={py} stroke={C.text} strokeWidth={1.5} strokeDasharray="4 4" />
      <text x={(px + bx) / 2} y={py - 10} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.text}>
        2–3 m
      </text>
      <text x={(px + bx) / 2} y={py + 22} textAnchor="middle" fontSize={12} fill={C.text}>
        {tr('phone', 'Handy')} {height}
      </text>
      <ellipse cx={bx} cy={py} rx={props.view === 'front' ? 16 : 38} ry={props.view === 'front' ? 38 : 16} fill={C.shirt} />
      <circle cx={bx} cy={py} r={14} fill={C.skin} stroke={C.outline} strokeWidth={1.5} />
      <circle cx={nx} cy={ny} r={4} fill={C.skin} stroke={C.outline} strokeWidth={1.5} />
      <text x={W - 10} y={H - 12} textAnchor="end" fontSize={12} fill={C.text}>
        {props.view === 'front' ? tr('you face the phone', 'du schaust zum Handy') : tr('you stand side-on', 'du stehst seitlich')}
      </text>
    </Frame>
  );
}

/** A forearm seen end-on (elbow at the side, bent 90°): the fist and a club that turns from upright. */
export function ForearmTurn(props: { left: number; right: number; goal?: number; thumb?: boolean }) {
  const W = 340;
  const H = 200;
  const cx = W / 2;
  const cy = 130;
  const g = props.goal ?? 80;
  const club = (deg: number, color: string, width: number, dash?: string) => <line x1={cx} y1={cy} x2={cx + 110 * Math.sin(rad(deg))} y2={cy - 110 * Math.cos(rad(deg))} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />;
  return (
    <Frame w={W} h={H} label={tr(`Forearm rotation: the club turns ${props.left}° and ${props.right}° from upright`, `Unterarmdrehung: der Schläger dreht ${props.left}° und ${props.right}° aus der Senkrechten`)} thumb={props.thumb}>
      {club(-g, C.goal, 2.5, '7 5')}
      {club(g, C.goal, 2.5, '7 5')}
      <path d={arc(cx, cy, 70, -g, g)} fill="none" stroke={C.goal} strokeWidth={2} opacity={0.5} />
      {club(0, C.start, 3, '3 4')}
      {club(-props.left, C.shaft, 5)}
      {club(props.right, C.shaft, 5)}
      <circle cx={cx} cy={cy} r={22} fill={C.skin} stroke={C.outline} strokeWidth={2} />
      <text x={cx - 118} y={cy + 30} textAnchor="middle" fontSize={13} fill={C.text}>
        {tr('palm down', 'Handfläche unten')}
      </text>
      <text x={cx + 118} y={cy + 30} textAnchor="middle" fontSize={13} fill={C.text}>
        {tr('palm up', 'Handfläche oben')}
      </text>
      <text x={cx} y={H - 10} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.goal}>
        {tr(`goal: ${g}° each way`, `Ziel: ${g}° pro Seite`)}
      </text>
    </Frame>
  );
}

/** The arm straight forward, seen from the side: the club hinges up (thumb side) and down. */
export function WristHinge(props: { up: number; down: number; thumb?: boolean }) {
  const W = 340;
  const H = 210;
  const wx = 190;
  const wy = 110;
  const club = (deg: number, color: string, width: number, dash?: string, l = 120) => <line x1={wx} y1={wy} x2={wx + l * Math.cos(rad(deg))} y2={wy - l * Math.sin(rad(deg))} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />;
  // the shaft in line with the forearm points forward (0°); up = + (radial), down = − (ulnar)
  return (
    <Frame w={W} h={H} label={tr(`Wrist hinge: the club goes ${props.up}° up and ${props.down}° down`, `Handgelenk anwinkeln: der Schläger geht ${props.up}° nach oben und ${props.down}° nach unten`)} thumb={props.thumb}>
      <path d={`M20,${wy - 12} L${wx},${wy - 10} L${wx},${wy + 10} L20,${wy + 12} Z`} fill={C.skin} stroke={C.outline} strokeWidth={1.5} />
      <path d={`M20,${wy - 15} L80,${wy - 14} L80,${wy + 14} L20,${wy + 15} Z`} fill={C.shirt} />
      {club(0, C.start, 3, '3 4', 120)}
      {club(props.up, C.shaft, 5)}
      {club(-props.down, C.shaft, 5)}
      <circle cx={wx} cy={wy} r={15} fill={C.skin} stroke={C.outline} strokeWidth={2} />
      <text x={wx + 120} y={wy - 120 * Math.sin(rad(props.up)) - 6} textAnchor="end" fontSize={14} fontWeight={700} fill={C.text}>
        {props.up}°
      </text>
      <text x={wx + 120} y={wy + 120 * Math.sin(rad(props.down)) + 16} textAnchor="end" fontSize={14} fontWeight={700} fill={C.text}>
        {props.down}°
      </text>
      <text x={20} y={H - 10} fontSize={13} fill={C.text}>
        {tr('arm straight, thumb up', 'Arm gestreckt, Daumen oben')}
      </text>
    </Frame>
  );
}

/** The hand bends down (flexion, bowed) and up (extension, cupped) from the forearm. */
export function WristFlex(props: { flex: number; ext: number; thumb?: boolean }) {
  const W = 340;
  const H = 210;
  const wx = 170;
  const wy = 105;
  const hand = (deg: number, color: string, dash?: string) => {
    const l = 70;
    const x = wx + l * Math.cos(rad(deg));
    const y = wy - l * Math.sin(rad(deg));
    return <line x1={wx} y1={wy} x2={x} y2={y} stroke={color} strokeWidth={dash ? 3 : 18} strokeLinecap="round" strokeDasharray={dash} />;
  };
  return (
    <Frame w={W} h={H} label={tr(`Wrist bend: ${props.flex}° down, ${props.ext}° up`, `Handgelenk beugen: ${props.flex}° nach unten, ${props.ext}° nach oben`)} thumb={props.thumb}>
      <path d={`M20,${wy - 12} L${wx},${wy - 10} L${wx},${wy + 10} L20,${wy + 12} Z`} fill={C.skin} stroke={C.outline} strokeWidth={1.5} />
      <path d={`M20,${wy - 15} L80,${wy - 14} L80,${wy + 14} L20,${wy + 15} Z`} fill={C.shirt} />
      {hand(0, C.start, '3 4')}
      {hand(props.ext, C.skin)}
      {hand(-props.flex, C.skin)}
      {[props.ext, -props.flex].map((d) => (
        <line key={d} x1={wx} y1={wy} x2={wx + 70 * Math.cos(rad(d))} y2={wy - 70 * Math.sin(rad(d))} stroke={C.outline} strokeWidth={1.2} />
      ))}
      <circle cx={wx} cy={wy} r={9} fill={C.skin} stroke={C.outline} strokeWidth={1.5} />
      <text x={wx + 86 * Math.cos(rad(props.ext))} y={wy - 86 * Math.sin(rad(props.ext))} textAnchor="middle" fontSize={14} fontWeight={700} fill={C.text}>
        {props.ext}°
      </text>
      <text x={wx + 86 * Math.cos(rad(-props.flex))} y={wy - 86 * Math.sin(rad(-props.flex)) + 10} textAnchor="middle" fontSize={14} fontWeight={700} fill={C.text}>
        {props.flex}°
      </text>
      <text x={20} y={H - 10} fontSize={13} fill={C.text}>
        {tr('back of the hand up · fingers relaxed', 'Handrücken oben · Finger locker')}
      </text>
    </Frame>
  );
}
