import { tr } from '../lib/i18n';
import type { ShotGraphicKind } from './types';

// Drawn overviews for the shots where a golfer figure cannot show the point (Sascha 15.11.2026: "what influence does
// the bounce have", "influence of different kinds of sand", low point training, spin control): the sole of a wedge
// seen from the toe, sand types, where the club enters the sand, spin loft, and the low point of the swing arc.
// Target to the right (right-hander). Light paper like the sketches, so it reads the same in both themes; the rows
// put the picture left and the text right so nothing runs out of a narrow phone.

const SKY = '#cfe6f5';
const INK = '#16324a';
const CLUB = '#9aa4ab';
const CLUB_DARK = '#5c6870';
const SAND = '#ecd9a6'; // ci-allow: bunker sand
const SAND_DARK = '#c9ab66'; // ci-allow: bunker sand
const GRASS = '#6ea545';
const GREEN = '#79a128';
const BALL = '#ffffff';

const Text = (p: { x: number; y: number; t: string; size?: number; bold?: boolean; anchor?: 'start' | 'middle' | 'end'; fill?: string }) => (
  <text x={p.x} y={p.y} fontSize={p.size ?? 11} fontWeight={p.bold ? 700 : 500} fill={p.fill ?? INK} textAnchor={p.anchor ?? 'middle'}>
    {p.t}
  </text>
);
const Ball = (p: { x: number; y: number; r?: number }) => <circle cx={p.x} cy={p.y} r={p.r ?? 7} fill={BALL} stroke="#55606a" strokeWidth="1.2" />;
const deg = (d: number) => (d * Math.PI) / 180;
const row = (i: number) => `translate(0,${i * 102})`;

/** a wedge seen from the toe: the trailing edge on the ground at x, the sole rising by `bounce` degrees to the leading edge */
function Wedge(p: { x: number; g: number; bounce: number; open?: number; label?: string }) {
  const sole = 46;
  const b = p.bounce * 1.7; // drawn steeper than real so the angle can be seen
  const lead: [number, number] = [p.x + sole * Math.cos(deg(b)), p.g - sole * Math.sin(deg(b))];
  const loft = 56 + (p.open ?? 0);
  const faceLen = 54;
  const top: [number, number] = [lead[0] - faceLen * Math.sin(deg(loft - 30)), lead[1] - faceLen * Math.cos(deg(loft - 30))];
  const back: [number, number] = [p.x - 4, top[1] + 12];
  const arcR = 26;
  const arcEnd: [number, number] = [p.x + arcR * Math.cos(deg(b)), p.g - arcR * Math.sin(deg(b))];
  return (
    <g>
      <line x1={top[0] + 6} y1={top[1] + 2} x2={top[0] - 10} y2={top[1] - 26} stroke={CLUB_DARK} strokeWidth="5" strokeLinecap="round" />
      <polygon points={`${p.x},${p.g} ${lead[0]},${lead[1]} ${top[0]},${top[1]} ${back[0]},${back[1]}`} fill={CLUB} stroke={CLUB_DARK} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={lead[0]} cy={lead[1]} r="2.6" fill={INK} />
      <path d={`M${p.x + arcR} ${p.g} A ${arcR} ${arcR} 0 0 0 ${arcEnd[0].toFixed(1)} ${arcEnd[1].toFixed(1)}`} fill="none" stroke={GREEN} strokeWidth="2.2" />
      {p.label && <Text x={lead[0] + 10} y={p.g - 3} t={p.label} bold size={11} anchor="start" />}
    </g>
  );
}

function Bounce() {
  const rows: [number, string, string][] = [
    [5, tr('Little bounce · 4–6°', 'Wenig Bounce · 4–6°'), tr('hard ground, bare lies, firm sand', 'harter Boden, Kahlstellen, fester Sand')],
    [10, tr('Medium · 8–10°', 'Mittel · 8–10°'), tr('most lies – the all-rounder', 'die meisten Lagen – der Allrounder')],
    [14, tr('Much bounce · 12–14°', 'Viel Bounce · 12–14°'), tr('soft, deep sand, thick grass', 'weicher, tiefer Sand, dichtes Gras')],
  ];
  return (
    <svg viewBox="0 0 340 302" width="100%" role="img" aria-label={tr('The bounce of a wedge', 'Das Bounce eines Wedges')}>
      {rows.map(([b, name, use], i) => (
        <g key={i} transform={row(i)}>
          <rect x="0" y="0" width="340" height="98" rx="8" fill={SKY} />
          <rect x="0" y="82" width="132" height="16" fill={b > 12 ? SAND : GRASS} />
          <Wedge x={30} g={82} bounce={b} label={`${b}°`} />
          <Text x={144} y={42} t={name} bold anchor="start" size={13} />
          <Text x={144} y={62} t={use} anchor="start" size={11} />
        </g>
      ))}
    </svg>
  );
}

function BounceOpen() {
  const rows: [number, number, string, string][] = [
    [10, 0, tr('Face square', 'Fläche square'), tr('the leading edge digs in', 'die Vorderkante gräbt sich ein')],
    [16, 18, tr('Face open', 'Fläche offen'), tr('more bounce – the sole glides', 'mehr Bounce – die Sohle gleitet')],
  ];
  return (
    <svg viewBox="0 0 340 200" width="100%" role="img" aria-label={tr('Open face – more bounce', 'Offene Fläche – mehr Bounce')}>
      {rows.map(([b, open, name, what], i) => (
        <g key={i} transform={row(i)}>
          <rect x="0" y="0" width="340" height="98" rx="8" fill={SKY} />
          <rect x="0" y="82" width="132" height="16" fill={SAND} />
          <Wedge x={30} g={82} bounce={b} open={open} label={`${b}°`} />
          <Text x={144} y={42} t={name} bold anchor="start" size={13} />
          <Text x={144} y={62} t={what} anchor="start" size={11} />
        </g>
      ))}
    </svg>
  );
}

function Sand() {
  const kinds: { fill: string; sink: number; dots: string; big?: boolean; name: string; a: string; b: string }[] = [
    { fill: '#f4e6bd', sink: 7, dots: '#e0c98a', name: tr('Soft, fluffy', 'Weich, locker'), a: tr('more bounce, face more open', 'mehr Bounce, Fläche weiter offen'), b: tr('more speed, enter 4–5 cm behind', 'mehr Tempo, Eintritt 4–5 cm dahinter') }, // ci-allow: bunker sand
    { fill: '#cfae6c', sink: 0, dots: '#b8955a', name: tr('Firm, wet', 'Fest, nass'), a: tr('little bounce, face barely open', 'wenig Bounce, Fläche kaum offen'), b: tr('enter 2–3 cm behind – it runs more', 'Eintritt 2–3 cm dahinter – er rollt mehr') }, // ci-allow: bunker sand
    { fill: '#d8c8a6', sink: 3, dots: '#8f8370', big: true, name: tr('Coarse, heavy', 'Grob, schwer'), a: tr('steeper, less bounce', 'steiler, weniger Bounce'), b: tr('firm grip, through to the finish', 'fest greifen, bis ins Finish') }, // ci-allow: bunker sand
  ];
  return (
    <svg viewBox="0 0 340 302" width="100%" role="img" aria-label={tr('Kinds of sand', 'Sandarten')}>
      {kinds.map((k, i) => (
        <g key={i} transform={row(i)}>
          <rect x="0" y="0" width="340" height="98" rx="8" fill={SKY} />
          <rect x="0" y="56" width="120" height="42" fill={k.fill} />
          {[10, 26, 44, 62, 80, 98, 112].map((x, j) => (
            <circle key={j} cx={x} cy={66 + ((j * 7) % 22)} r={k.big ? 2.6 : 1.3} fill={k.dots} />
          ))}
          <Ball x={60} y={48 + k.sink} r={9} />
          {k.sink > 0 && <rect x="48" y="56" width="24" height={k.sink + 3} fill={k.fill} />}
          <Text x={134} y={34} t={k.name} bold anchor="start" size={13} />
          <Text x={134} y={54} t={k.a} anchor="start" size={11} />
          <Text x={134} y={72} t={k.b} anchor="start" size={11} />
        </g>
      ))}
    </svg>
  );
}

function SandEntry() {
  return (
    <svg viewBox="0 0 340 150" width="100%" role="img" aria-label={tr('Where the club enters the sand', 'Wo der Schläger in den Sand geht')}>
      <rect x="0" y="0" width="340" height="150" rx="8" fill={SKY} />
      <rect x="0" y="80" width="340" height="70" fill={SAND} />
      <path d="M90 52 Q 165 118 260 64" fill="none" stroke={CLUB_DARK} strokeWidth="2" strokeDasharray="5 4" />
      <path d="M254 60 l8 3 l-6 6" fill="none" stroke={CLUB_DARK} strokeWidth="2" />
      <Ball x={200} y={73} r={8} />
      <line x1={182} y1={80} x2={182} y2={96} stroke={GREEN} strokeWidth="3" />
      <line x1={170} y1={80} x2={170} y2={110} stroke={INK} strokeWidth="3" />
      <Text x={182} y={124} t={tr('firm: 2–3 cm', 'fest: 2–3 cm')} bold />
      <Text x={160} y={140} t={tr('soft: 4–5 cm behind the ball', 'weich: 4–5 cm hinter dem Ball')} bold />
      <Text x={268} y={104} t={tr('the sand carries the ball', 'der Sand trägt den Ball')} size={10} />
      <Text x={60} y={30} t={tr('target →', 'Ziel →')} size={10} />
    </svg>
  );
}

function SpinLoft() {
  // impact from the side: the path down into the ball, the face with its loft; the angle between = spin loft
  const bx = 190;
  const by = 92;
  return (
    <svg viewBox="0 0 340 150" width="100%" role="img" aria-label={tr('Spin loft', 'Spin-Loft')}>
      <rect x="0" y="0" width="340" height="150" rx="8" fill={SKY} />
      <rect x="0" y="100" width="340" height="50" fill={GRASS} />
      <line x1={60} y1={55} x2={bx - 12} y2={by + 2} stroke={INK} strokeWidth="2.4" />
      <path d={`M${bx - 20} ${by - 2} l8 4 l-9 3`} fill="none" stroke={INK} strokeWidth="2.4" />
      <line x1={bx - 9} y1={by + 8} x2={bx - 9 + 52 * Math.sin(deg(-40))} y2={by + 8 - 52 * Math.cos(deg(-40))} stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
      <Ball x={bx} y={by} r={8} />
      <path d={`M${bx + 22} ${by - 18} q 14 -10 22 4`} fill="none" stroke={INK} strokeWidth="1.6" />
      <path d={`M${bx + 44} ${by - 14} l1 -7 l-6 3`} fill="none" stroke={INK} strokeWidth="1.6" />
      <Text x={95} y={46} t={tr('path: down into the ball', 'Weg: nach unten in den Ball')} size={10} />
      <Text x={152} y={30} t={tr('face: dynamic loft', 'Fläche: dynamischer Loft')} size={10} fill="#3d6b22" bold />
      <Text x={280} y={70} t={tr('backspin', 'Rückwärtsdrall')} size={10} />
      <Text x={170} y={124} t={tr('spin loft = loft at impact − angle of attack', 'Spin-Loft = Loft im Treffmoment − Eintreffwinkel')} bold fill="#ffffff" />
      <Text x={170} y={140} t={tr('more spin loft and a clean strike = more spin', 'mehr Spin-Loft und sauberer Treffer = mehr Spin')} size={10} fill="#ffffff" />
    </svg>
  );
}

/** the swing arc from the side, its lowest point and the ball; low = cm after (+) or before (−) the ball, 1 cm = 5 px */
function LowPoint(p: { low: number; tee?: boolean; sand?: boolean; title: string; lowText: string; note: string }) {
  const g = 96;
  const bx = 170;
  const lx = bx + p.low * 5;
  const depth = p.tee ? -12 : p.sand ? 12 : 3;
  const R = 150;
  const cy = g + depth - R;
  const x0 = lx - 120;
  const x1 = lx + 120;
  const y = (x: number) => cy + Math.sqrt(R * R - (x - lx) * (x - lx));
  const ballY = p.tee ? g - 20 : g - 7;
  return (
    <svg viewBox="0 0 340 150" width="100%" role="img" aria-label={p.title}>
      <rect x="0" y="0" width="340" height="150" rx="8" fill={SKY} />
      <rect x="0" y={g} width="340" height={150 - g} fill={p.sand ? SAND : GRASS} />
      {p.tee && <rect x={bx - 1.5} y={g - 13} width="3" height="13" fill="#f2f2f2" stroke="#8a8a8a" strokeWidth="0.6" />}
      {!p.tee && !p.sand && p.low > 0 && <path d={`M${bx + 4} ${g} Q ${(bx + lx) / 2 + 8} ${g + 9} ${lx + 30} ${g}`} fill={SAND_DARK} />}
      <path d={`M${x0} ${y(x0).toFixed(1)} A ${R} ${R} 0 0 0 ${x1} ${y(x1).toFixed(1)}`} fill="none" stroke={CLUB_DARK} strokeWidth="2" strokeDasharray="6 4" />
      <path d={`M${x1 - 9} ${y(x1) + 2} l9 -2 l-4 8`} fill="none" stroke={CLUB_DARK} strokeWidth="2" />
      <Ball x={bx} y={ballY} r={7} />
      <circle cx={lx} cy={g + depth} r="5.5" fill={GREEN} stroke="#ffffff" strokeWidth="1.5" />
      <line x1={lx} y1={g + depth + 8} x2={lx} y2={g + 26} stroke={GREEN} strokeWidth="1.6" />
      <Text x={lx} y={g + 38} t={p.lowText} bold fill={p.sand ? INK : '#ffffff'} />
      <Text x={170} y={22} t={p.title} bold />
      <Text x={170} y={38} t={p.note} size={10} />
      <Text x={312} y={60} t={tr('target →', 'Ziel →')} size={10} anchor="end" />
    </svg>
  );
}

export function ShotGraphic(p: { kind: ShotGraphicKind }) {
  let g: JSX.Element;
  switch (p.kind) {
    case 'bounce':
      g = <Bounce />;
      break;
    case 'bounceOpen':
      g = <BounceOpen />;
      break;
    case 'sand':
      g = <Sand />;
      break;
    case 'sandEntry':
      g = <SandEntry />;
      break;
    case 'spinLoft':
      g = <SpinLoft />;
      break;
    case 'lowIron':
      g = <LowPoint low={7} title={tr('Iron: ball first, then the ground', 'Eisen: erst der Ball, dann der Boden')} lowText={tr('low point 5–10 cm after the ball', 'tiefster Punkt 5–10 cm nach dem Ball')} note={tr('the divot starts at the ball and goes forward', 'das Divot beginnt am Ball und geht nach vorn')} />;
      break;
    case 'lowChip':
      g = <LowPoint low={3} title={tr('Chip and pitch: brush the grass under the ball', 'Chip und Pitch: das Gras unter dem Ball streifen')} lowText={tr('low point just after the ball', 'tiefster Punkt knapp nach dem Ball')} note={tr('weight and hands forward keep it there', 'Gewicht und Hände vorn halten ihn dort')} />;
      break;
    case 'lowBunker':
      g = <LowPoint low={0} sand title={tr('Bunker: the club enters the sand behind the ball', 'Bunker: Der Schläger geht hinter dem Ball in den Sand')} lowText={tr('low point under the ball, in the sand', 'tiefster Punkt unter dem Ball, im Sand')} note={tr('entry 3–5 cm behind – the ball is never touched', 'Eintritt 3–5 cm dahinter – der Ball wird nie berührt')} />;
      break;
    default:
      g = <LowPoint low={-8} tee title={tr('Driver: hit up on the ball', 'Driver: den Ball aufwärts treffen')} lowText={tr('low point before the ball', 'tiefster Punkt vor dem Ball')} note={tr('ball at the lead heel, teed up high', 'Ball an der vorderen Ferse, hoch aufgeteet')} />;
  }
  return <figure className="tr-sketch tr-graphic">{g}</figure>;
}
