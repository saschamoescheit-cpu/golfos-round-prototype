import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';

// Our own sketches for the Rules of Golf (Sascha 18.10.2026: "every rule with its pictures – rebuilt, no copyright
// issues"): seen from above in the app's flat look – fairway, green with flag, water, bunker, out-of-bounds stakes,
// the ball, relief areas and lines. One per rule, more for the sections that need a picture (sketchFor).

const W = 320;
const H = 190;
const C = {
  rough: '#5f9437',
  fairway: '#79b146',
  green: '#9fd36a',
  sand: '#e9d9a6', // ci-allow: bunker sand
  water: '#4f9fd8',
  red: '#e5484d',
  yellow: '#f2c230', // ci-allow: yellow penalty area stakes as on the course
  white: '#ffffff',
  ink: '#0e1418',
  relief: 'rgba(255,255,255,0.28)',
  brand: '#c6f24e',
};

function Frame(props: { children: ReactNode; label: string; bg?: string }) {
  return (
    <svg className="rule-sketch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      <rect width={W} height={H} rx="14" fill={props.bg ?? C.rough} />
      {props.children}
    </svg>
  );
}
const Ball = (p: { x: number; y: number; ghost?: boolean }) => <circle cx={p.x} cy={p.y} r="5" fill={p.ghost ? 'none' : C.white} stroke={p.ghost ? C.white : C.ink} strokeWidth={p.ghost ? 1.6 : 1.2} strokeDasharray={p.ghost ? '2 2' : undefined} />;
const Flag = (p: { x: number; y: number }) => (
  <g>
    <circle cx={p.x} cy={p.y} r="3" fill={C.ink} />
    <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 26} stroke={C.white} strokeWidth="2" />
    <path d={`M${p.x} ${p.y - 26} l14 5 -14 5z`} fill={C.red} />
  </g>
);
const Green = (p: { x: number; y: number; r?: number }) => <ellipse cx={p.x} cy={p.y} rx={(p.r ?? 34) * 1.25} ry={p.r ?? 34} fill={C.green} />;
const Label = (p: { x: number; y: number; t: string; anchor?: 'start' | 'middle' | 'end'; c?: string }) => (
  <text x={p.x} y={p.y} fill={p.c ?? C.white} fontSize="11" fontWeight="700" textAnchor={p.anchor ?? 'middle'} fontFamily="Figtree, system-ui, sans-serif" stroke={p.c === C.ink ? C.white : C.ink} strokeWidth="3" paintOrder="stroke">
    {p.t}
  </text>
);
const Arrow = (p: { x1: number; y1: number; x2: number; y2: number; dash?: boolean; c?: string }) => {
  const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
  const h = (d: number) => `${p.x2 - 8 * Math.cos(a + d)},${p.y2 - 8 * Math.sin(a + d)}`;
  return (
    <g stroke={p.c ?? C.white} strokeWidth="2" fill="none">
      <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} strokeDasharray={p.dash ? '5 4' : undefined} />
      <polyline points={`${h(0.45)} ${p.x2},${p.y2} ${h(-0.45)}`} />
    </g>
  );
};
/** A relief area: a half disc of the given radius away from the hole (hole up = away is down). */
const Relief = (p: { x: number; y: number; r: number; away?: number; mask?: string }) => {
  const a = p.away ?? Math.PI / 2; // direction away from the hole
  const x1 = p.x + p.r * Math.cos(a - Math.PI / 2);
  const y1 = p.y + p.r * Math.sin(a - Math.PI / 2);
  const x2 = p.x + p.r * Math.cos(a + Math.PI / 2);
  const y2 = p.y + p.r * Math.sin(a + Math.PI / 2);
  return <path d={`M${x1},${y1} A${p.r},${p.r} 0 0 1 ${x2},${y2} Z`} fill={C.relief} stroke={C.white} strokeWidth="1.5" strokeDasharray="4 3" mask={p.mask ? `url(#${p.mask})` : undefined} />;
};
const Stakes = (p: { x1: number; y1: number; x2: number; y2: number; c: string; n?: number }) => {
  const n = p.n ?? 6;
  return (
    <g>
      <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.c} strokeWidth="2.5" />
      {Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return <circle key={i} cx={p.x1 + (p.x2 - p.x1) * t} cy={p.y1 + (p.y2 - p.y1) * t} r="4" fill={p.c} stroke={C.ink} strokeWidth="1" />;
      })}
    </g>
  );
};
const Pond = (p: { c: string }) => <path d="M30 120 C 60 95, 130 95, 165 112 C 195 128, 180 165, 120 168 C 60 172, 15 150, 30 120 Z" fill={C.water} stroke={p.c} strokeWidth="3" />;
const Club = (p: { x1: number; y1: number; x2: number; y2: number; t: string }) => (
  <g>
    <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={C.brand} strokeWidth="3" strokeLinecap="round" />
    <Label x={(p.x1 + p.x2) / 2} y={(p.y1 + p.y2) / 2 - 6} t={p.t} c={C.brand} />
  </g>
);

const one = () => tr('1 club-length', '1 Schlägerlänge');
const two = () => tr('2 club-lengths', '2 Schlägerlängen');

// ---------------- the scenes ----------------
const SCENES: Record<string, () => JSX.Element> = {
  // 1 – the game: tee to hole
  game: () => (
    <Frame label={tr('From the tee into the hole', 'Vom Abschlag ins Loch')}>
      <path d="M40 160 C 110 130, 170 80, 260 50" stroke={C.fairway} strokeWidth="46" fill="none" strokeLinecap="round" />
      <Green x={262} y={48} r={26} />
      <Flag x={265} y={50} />
      <rect x="28" y="150" width="28" height="18" rx="3" fill={C.fairway} stroke={C.white} />
      <Ball x={42} y={159} />
      <Arrow x1={50} y1={152} x2={150} y2={108} dash />
      <Arrow x1={160} y1={102} x2={250} y2={58} dash />
      <Label x={160} y={180} t={tr('as few strokes as possible', 'mit möglichst wenigen Schlägen')} />
    </Frame>
  ),
  // 2 – the course areas
  areas: () => (
    <Frame label={tr('The five areas of the course', 'Die fünf Bereiche des Platzes')}>
      <path d="M30 150 C 100 130, 190 90, 270 60" stroke={C.fairway} strokeWidth="50" fill="none" strokeLinecap="round" />
      <rect x="20" y="135" width="34" height="26" rx="4" fill={C.fairway} stroke={C.white} />
      <Green x={268} y={55} r={26} />
      <Flag x={270} y={58} />
      <ellipse cx="215" cy="100" rx="22" ry="11" fill={C.sand} />
      <path d="M95 60 C 120 40, 165 45, 160 70 C 155 90, 110 90, 95 60 Z" fill={C.water} stroke={C.red} strokeWidth="3" />
      <Stakes x1={10} y1={20} x2={150} y2={10} c={C.white} n={5} />
      <Label x={37} y={130} t={tr('Teeing area', 'Abschlag')} />
      <Label x={128} y={98} t="Penalty Area" />
      <Label x={215} y={124} t="Bunker" />
      <Label x={268} y={98} t={tr('Green', 'Grün')} />
      <Label x={135} y={150} t={tr('General area', 'Gelände')} />
      <Label x={80} y={32} t={tr('Out of bounds', 'Aus')} />
    </Frame>
  ),
  // 3 – match play vs stroke play
  competition: () => (
    <Frame label={tr('Match play and stroke play', 'Lochspiel und Zählspiel')} bg="#24333c">
      <rect x="20" y="25" width="130" height="140" rx="10" fill="#18222a" stroke={C.white} />
      <Label x={85} y={48} t={tr('Match play', 'Lochspiel')} />
      {['1 ▲', '2 ▲', '3 =', '4 ▼', '5 ▲'].map((t, i) => <Label key={t} x={85} y={74 + i * 19} t={t} c={t.includes('▲') ? C.brand : C.white} />)}
      <rect x="170" y="25" width="130" height="140" rx="10" fill="#18222a" stroke={C.white} />
      <Label x={235} y={48} t={tr('Stroke play', 'Zählspiel')} />
      {['4  5  3  4  5', '…', tr('total 83', 'Summe 83')].map((t, i) => <Label key={t} x={235} y={80 + i * 26} t={t} />)}
    </Frame>
  ),
  // 4 – 14 clubs, rangefinder
  equipment: () => (
    <Frame label={tr('At most 14 clubs', 'Höchstens 14 Schläger')} bg="#24333c">
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i}>
          <line x1={30 + i * 13} y1="40" x2={30 + i * 13} y2="140" stroke={C.white} strokeWidth="2.5" />
          <rect x={26 + i * 13} y="138" width="9" height="8" rx="2" fill={C.brand} />
        </g>
      ))}
      <Label x={115} y={170} t={tr('max. 14', 'max. 14')} c={C.brand} />
      <rect x="235" y="70" width="60" height="38" rx="8" fill="#18222a" stroke={C.white} />
      <circle cx="252" cy="89" r="9" fill="none" stroke={C.white} strokeWidth="2" />
      <Label x={278} y={93} t="m" />
      <Label x={265} y={130} t={tr('distance: allowed', 'Distanz: erlaubt')} />
    </Frame>
  ),
  // 5 – pace of play
  pace: () => (
    <Frame label={tr('40 seconds per stroke', '40 Sekunden je Schlag')} bg="#24333c">
      <circle cx="160" cy="92" r="58" fill="#18222a" stroke={C.white} strokeWidth="3" />
      <path d="M160 92 L160 40 A52 52 0 0 1 205 118 Z" fill={C.brand} opacity="0.85" />
      <Label x={160} y={175} t={tr('ready golf – ≤ 40 s', 'Ready Golf – höchstens 40 s')} />
    </Frame>
  ),
  // 6.1 – teeing area
  tee: () => (
    <Frame label={tr('The teeing area', 'Der Abschlag')}>
      <rect x="40" y="30" width="240" height="140" rx="6" fill={C.fairway} />
      <rect x="100" y="60" width="120" height="70" fill={C.relief} stroke={C.white} strokeDasharray="4 3" />
      <circle cx="100" cy="60" r="7" fill={C.yellow} stroke={C.ink} />
      <circle cx="220" cy="60" r="7" fill={C.yellow} stroke={C.ink} />
      <Club x1={240} y1={60} x2={240} y2={130} t={two()} />
      <Ball x={150} y={95} />
      <Label x={160} y={52} t={tr('tee markers', 'Abschlagmarkierungen')} />
      <Arrow x1={160} y1={30} x2={160} y2={10} />
      <Label x={60} y={22} t={tr('to the hole', 'zum Loch')} anchor="start" />
    </Frame>
  ),
  // 7 – search 3 minutes
  search: () => (
    <Frame label={tr('Three minutes to search', 'Drei Minuten zum Suchen')}>
      <path d="M0 0 H320 V60 C 240 80, 120 50, 0 70 Z" fill="#3f6d2a" />
      <Ball x={170} y={48} />
      <circle cx="245" cy="125" r="34" fill="#18222a" stroke={C.white} strokeWidth="2" />
      <path d="M245 125 L245 97 A28 28 0 1 1 221 139 Z" fill={C.brand} opacity="0.85" />
      <Label x={245} y={180} t="3 min" />
      <Label x={100} y={140} t={tr('found? identify it', 'gefunden? identifizieren')} />
    </Frame>
  ),
  // 8 – do not improve
  improve: () => (
    <Frame label={tr('Do not improve the lie', 'Lage nicht verbessern')}>
      <path d="M60 30 C 110 40, 140 80, 150 100" stroke="#3b2a1a" strokeWidth="6" fill="none" />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={95 + i * 16} cy={50 + i * 14} r="9" fill="#2f6a2a" />)}
      <Ball x={160} y={120} />
      <line x1="80" y1="40" x2="140" y2="110" stroke={C.red} strokeWidth="4" />
      <line x1="140" y1="40" x2="80" y2="110" stroke={C.red} strokeWidth="4" />
      <Label x={230} y={80} t={tr('do not bend or break', 'nicht biegen oder abbrechen')} />
      <Label x={230} y={100} t={tr('play it as it lies', 'spielen, wie er liegt')} c={C.brand} />
    </Frame>
  ),
  // 9 – ball moved
  moved: () => (
    <Frame label={tr('Ball at rest moved', 'Ball in Ruhe bewegt')}>
      <Ball x={120} y={100} ghost />
      <Ball x={170} y={100} />
      <Arrow x1={127} y1={100} x2={162} y2={100} dash />
      <Label x={145} y={80} t={tr('moved by you: replace, +1', 'von dir bewegt: zurück, +1')} />
      <Label x={145} y={140} t={tr('by wind: play it from there', 'vom Wind: von dort spielen')} c={C.brand} />
    </Frame>
  ),
  // 10 – advice, caddie
  advice: () => (
    <Frame label={tr('Advice only from caddie and partner', 'Rat nur von Caddie und Partner')} bg="#24333c">
      {[70, 160, 250].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy="75" r="16" fill={i === 2 ? '#56656e' : C.brand} />
          <rect x={x - 16} y="95" width="32" height="44" rx="12" fill={i === 2 ? '#56656e' : C.brand} />
        </g>
      ))}
      <Label x={70} y={160} t={tr('you', 'du')} />
      <Label x={160} y={160} t="Caddie ✓" c={C.brand} />
      <Label x={250} y={160} t={tr('other player ✕', 'Mitspieler ✕')} c={C.red} />
    </Frame>
  ),
  // 11 – ball hits person
  deflect: () => (
    <Frame label={tr('Ball hits a person', 'Ball trifft eine Person')}>
      <Arrow x1={40} y1={150} x2={190} y2={80} dash />
      <circle cx="210" cy="60" r="13" fill="#56656e" />
      <rect x="197" y="76" width="26" height="40" rx="10" fill="#56656e" />
      <Ball x={196} y={100} />
      <Label x={200} y={150} t={tr('by accident: no penalty', 'versehentlich: straflos')} c={C.brand} />
      <Label x={200} y={168} t={tr('play it as it lies', 'spielen, wie er liegt')} />
    </Frame>
  ),
  // 12 – bunker
  bunker: () => (
    <Frame label={tr('In the bunker', 'Im Bunker')}>
      <ellipse cx="150" cy="100" rx="110" ry="60" fill={C.sand} />
      <Ball x={140} y={100} />
      <line x1="150" y1="104" x2="190" y2="140" stroke={C.ink} strokeWidth="3" />
      <line x1="120" y1="80" x2="170" y2="125" stroke={C.red} strokeWidth="4" />
      <line x1="170" y1="80" x2="120" y2="125" stroke={C.red} strokeWidth="4" />
      <Label x={150} y={30} t={tr('do not touch the sand before the stroke', 'Sand vor dem Schlag nicht berühren')} />
      <Label x={150} y={178} t={tr('loose stones and leaves: remove ✓', 'lose Steine, Blätter: entfernen ✓')} c={C.brand} />
    </Frame>
  ),
  // 13 – green
  green: () => (
    <Frame label={tr('On the green', 'Auf dem Grün')}>
      <Green x={160} y={95} r={70} />
      <Flag x={225} y={88} />
      <Ball x={120} y={110} ghost />
      <circle cx="112" cy="118" r="3" fill={C.brand} />
      <Label x={110} y={140} t={tr('mark, lift, clean', 'markieren, aufnehmen, reinigen')} />
      <path d="M170 60 q6 -6 12 0" stroke={C.ink} strokeWidth="2" fill="none" />
      <Label x={176} y={52} t={tr('repair damage ✓', 'Schäden ausbessern ✓')} c={C.brand} />
      <Label x={225} y={128} t={tr('flag in or out', 'Fahne drin oder raus')} />
    </Frame>
  ),
  // 13.3 – overhanging
  overhang: () => (
    <Frame label={tr('Ball overhanging the hole', 'Ball am Lochrand')}>
      <Green x={160} y={95} r={80} />
      <circle cx="160" cy="95" r="26" fill={C.ink} />
      <circle cx="184" cy="88" r="12" fill={C.white} stroke={C.ink} />
      <Label x={160} y={160} t={tr('wait 10 seconds', '10 Sekunden warten')} />
    </Frame>
  ),
  // 14.1 – marking
  mark: () => (
    <Frame label={tr('Marking the ball', 'Ball markieren')}>
      <Green x={160} y={95} r={80} />
      <Ball x={160} y={95} />
      <circle cx="160" cy="111" r="6" fill={C.brand} stroke={C.ink} />
      <Arrow x1={200} y1={130} x2={170} y2={114} />
      <Label x={230} y={145} t={tr('marker right behind', 'Marker direkt dahinter')} />
      <Arrow x1={205} y1={40} x2={170} y2={84} dash />
      <Label x={240} y={34} t={tr('to the hole', 'zum Loch')} />
    </Frame>
  ),
  // 14.3 – drop from knee height
  drop: () => (
    <Frame label={tr('Drop from knee height', 'Aus Kniehöhe droppen')} bg="#9ed0f0">
      <rect x="0" y="160" width={W} height="30" fill={C.fairway} />
      <rect x="138" y="40" width="24" height="44" rx="10" fill="#33474f" />
      <rect x="140" y="84" width="9" height="76" rx="4" fill="#22272b" />
      <rect x="151" y="84" width="9" height="76" rx="4" fill="#22272b" />
      <line x1="120" y1="122" x2="200" y2="122" stroke={C.ink} strokeDasharray="4 3" />
      <Label x={250} y={118} t={tr('knee height', 'Kniehöhe')} c={C.ink} />
      <circle cx="180" cy="122" r="5" fill={C.white} stroke={C.ink} />
      <Arrow x1={180} y1={130} x2={180} y2={154} c={C.ink} />
      <Label x={80} y={60} t={tr('straight down', 'senkrecht fallen lassen')} c={C.ink} />
    </Frame>
  ),
  // 14.3 / 16.1 – one club-length from the nearest point of complete relief
  nearestPoint: () => (
    <Frame label={tr('Free relief: nearest point, one club-length', 'Straflose Erleichterung: nächster Punkt, eine Schlägerlänge')}>
      <rect x="120" y="20" width="50" height="170" fill="#b9aa8c" />
      <Label x={145} y={14} t={tr('cart path', 'Cartweg')} />
      <Ball x={150} y={100} />
      <Flag x={40} y={120} />
      <Relief x={182} y={100} r={42} away={0} />
      <circle cx="182" cy="100" r="4" fill={C.brand} />
      <Club x1={182} y1={100} x2={224} y2={100} t={one()} />
      <Label x={250} y={178} t={tr('not nearer the hole', 'nicht näher zum Loch')} />
      <Label x={183} y={84} t={tr('nearest point', 'nächster Punkt')} anchor="start" />
    </Frame>
  ),
  // 15 – loose impediments and movable obstructions
  loose: () => (
    <Frame label={tr('Remove loose things', 'Lose Dinge entfernen')}>
      <Ball x={160} y={110} />
      <path d="M120 100 q8 -12 18 0 q-8 8 -18 0" fill="#7a5a2a" />
      <circle cx="190" cy="120" r="7" fill="#9a9a9a" />
      <rect x="200" y="70" width="70" height="6" rx="3" fill="#c9c9c9" transform="rotate(-20 235 73)" />
      <Label x={110} y={150} t={tr('leaves, stones: remove', 'Blätter, Steine: entfernen')} c={C.brand} />
      <Label x={235} y={55} t={tr('rake: move it', 'Harke: wegnehmen')} c={C.brand} />
    </Frame>
  ),
  // 16.3 – embedded ball
  embedded: () => (
    <Frame label={tr('Embedded ball', 'Eingebetteter Ball')} bg="#9ed0f0">
      <rect x="0" y="100" width={W} height="90" fill={C.fairway} />
      <path d="M140 100 q20 22 40 0" fill="#4f7a2a" />
      <circle cx="160" cy="106" r="11" fill={C.white} stroke={C.ink} />
      <Label x={160} y={150} t={tr('in its own pitch mark, below the ground', 'im eigenen Einschlagloch, unter Bodenniveau')} />
      <Label x={160} y={170} t={tr('free relief: one club-length behind', 'straflos: eine Schlägerlänge dahinter')} c={C.brand} />
    </Frame>
  ),
  // 16.2 – dangerous animal
  animal: () => (
    <Frame label={tr('Dangerous animal', 'Gefährliches Tier')}>
      <Ball x={140} y={95} />
      <path d="M170 110 c15 -20 30 10 45 -8 c10 -12 25 -5 30 5" stroke="#2c3a1a" strokeWidth="7" fill="none" strokeLinecap="round" />
      <Label x={160} y={160} t={tr('free relief – away from danger', 'straflose Erleichterung – weg von der Gefahr')} c={C.brand} />
    </Frame>
  ),
  // 17 – red penalty area options
  penaltyRed: () => (
    <Frame label={tr('Red penalty area: three options', 'Rote Penalty Area: drei Möglichkeiten')}>
      <Pond c={C.red} />
      <Flag x={290} y={40} />
      <mask id="noPond">
        <rect width={W} height={H} fill="white" />
        <path d="M30 120 C 60 95, 130 95, 165 112 C 195 128, 180 165, 120 168 C 60 172, 15 150, 30 120 Z" fill="black" />
      </mask>
      <Relief x={160} y={111} r={44} away={2.64} mask="noPond" />
      <circle cx="160" cy="111" r="4" fill={C.white} stroke={C.ink} />
      <Label x={110} y={142} t={tr('ball in the water', 'Ball im Wasser')} />
      <Label x={128} y={82} t={two()} c={C.white} />
      <line x1="290" y1="40" x2="70" y2="170" stroke={C.white} strokeDasharray="5 4" />
      <Label x={80} y={182} t={tr('back on the line', 'Linie zurück')} />
      <Ball x={30} y={60} ghost />
      <Label x={60} y={50} t={tr('or from the last spot', 'oder vom letzten Schlagort')} anchor="start" />
    </Frame>
  ),
  // 17 – yellow
  penaltyYellow: () => (
    <Frame label={tr('Yellow penalty area: two options', 'Gelbe Penalty Area: zwei Möglichkeiten')}>
      <Pond c={C.yellow} />
      <Flag x={290} y={40} />
      <circle cx="160" cy="111" r="4" fill={C.white} stroke={C.ink} />
      <line x1="290" y1="40" x2="70" y2="170" stroke={C.white} strokeDasharray="5 4" />
      <Label x={90} y={182} t={tr('back on the line, + 1', 'Linie zurück, + 1')} />
      <Ball x={30} y={60} ghost />
      <Label x={60} y={50} t={tr('or from the last spot, + 1', 'oder vom letzten Schlagort, + 1')} anchor="start" />
    </Frame>
  ),
  // 18 – out of bounds, provisional
  ob: () => (
    <Frame label={tr('Out of bounds: stroke and distance', 'Aus: Schlag und Distanz')}>
      <Stakes x1={260} y1={0} x2={260} y2={190} c={C.white} n={6} />
      <rect x="262" y="0" width="58" height="190" fill="#3d5a2a" />
      <Ball x={290} y={70} />
      <Ball x={60} y={150} ghost />
      <Arrow x1={70} y1={145} x2={280} y2={75} dash />
      <Label x={290} y={100} t={tr('out', 'Aus')} />
      <Label x={130} y={178} t={tr('again from here, + 1 – play a provisional', 'von hier nochmal, + 1 – provisorisch spielen')} />
    </Frame>
  ),
  // 19 – unplayable: three options
  unplayable: () => (
    <Frame label={tr('Unplayable: three options', 'Unspielbar: drei Möglichkeiten')}>
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={150 + (i % 3) * 18} cy={70 + Math.floor(i / 3) * 18} r="16" fill="#2f6a2a" />)}
      <Ball x={168} y={80} />
      <Flag x={300} y={20} />
      <Relief x={168} y={80} r={44} away={Math.PI * 0.8} />
      <Label x={110} y={60} t={two()} />
      <line x1="300" y1="20" x2="40" y2="180" stroke={C.white} strokeDasharray="5 4" />
      <Label x={80} y={150} t={tr('back on the line', 'Linie zurück')} />
      <Ball x={250} y={170} ghost />
      <Label x={250} y={155} t={tr('last spot', 'letzter Schlagort')} />
      <Label x={250} y={185} t={tr('each + 1', 'je + 1')} c={C.brand} />
    </Frame>
  ),
  // 19.3 – unplayable in bunker
  unplayableBunker: () => (
    <Frame label={tr('Unplayable in a bunker', 'Unspielbar im Bunker')}>
      <ellipse cx="140" cy="90" rx="90" ry="50" fill={C.sand} />
      <Ball x={140} y={80} />
      <Flag x={300} y={30} />
      <line x1="300" y1="30" x2="20" y2="160" stroke={C.white} strokeDasharray="5 4" />
      <Label x={140} y={130} t={tr('in the bunker: + 1', 'im Bunker: + 1')} />
      <Label x={60} y={178} t={tr('outside, back on the line: + 2', 'außerhalb, Linie zurück: + 2')} anchor="start" c={C.brand} />
    </Frame>
  ),
  // 20 – two balls
  twoBalls: () => (
    <Frame label={tr('Unsure? Play two balls', 'Unsicher? Zwei Bälle spielen')}>
      <Ball x={140} y={110} />
      <Ball x={180} y={110} />
      <Label x={160} y={150} t={tr('stroke play: play both, then ask', 'Zählspiel: beide spielen, dann fragen')} />
    </Frame>
  ),
  // 21 – Stableford
  stableford: () => (
    <Frame label="Stableford" bg="#24333c">
      {[tr('Double bogey+', 'Doppelbogey+') + ' 0', 'Bogey 1', 'Par 2', 'Birdie 3', 'Eagle 4'].map((t, i) => (
        <g key={t}>
          <rect x={30 + i * 56} y={130 - i * 20} width="46" height={20 + i * 20} rx="6" fill={i >= 2 ? C.brand : '#56656e'} />
          <Label x={53 + i * 56} y={170} t={t.split(' ').pop()!} />
        </g>
      ))}
      <Label x={160} y={30} t={tr('points per hole', 'Punkte je Loch')} />
    </Frame>
  ),
  // 22 – foursomes
  foursomes: () => (
    <Frame label={tr('Foursomes: one ball, in turn', 'Vierer: ein Ball, abwechselnd')}>
      <Ball x={60} y={150} />
      <Arrow x1={65} y1={145} x2={150} y2={100} dash c={C.brand} />
      <Arrow x1={155} y1={96} x2={250} y2={55} dash />
      <Label x={100} y={110} t="A" c={C.brand} />
      <Label x={205} y={66} t="B" />
      <Label x={160} y={178} t={tr('A, B, A, B …', 'A, B, A, B …')} />
    </Frame>
  ),
  // 23 – four-ball
  fourball: () => (
    <Frame label={tr('Four-ball: the better score counts', 'Vierball: das bessere Ergebnis zählt')} bg="#24333c">
      <Label x={100} y={70} t={tr('Partner A: 5', 'Partner A: 5')} />
      <Label x={100} y={100} t={tr('Partner B: 4', 'Partner B: 4')} c={C.brand} />
      <Label x={230} y={86} t={tr('side: 4', 'Partei: 4')} c={C.brand} />
    </Frame>
  ),
  // 24 – team
  team: () => (
    <Frame label={tr('Team competition', 'Mannschaftswettspiel')} bg="#24333c">
      {[60, 110, 160, 210, 260].map((x) => (
        <g key={x}>
          <circle cx={x} cy="80" r="14" fill={C.brand} />
          <rect x={x - 14} y="98" width="28" height="40" rx="10" fill={C.brand} />
        </g>
      ))}
      <Label x={160} y={170} t={tr('results combined', 'Ergebnisse zusammengezählt')} />
    </Frame>
  ),
  // 25 – modifications
  disability: () => (
    <Frame label={tr('Modifications for players with disabilities', 'Anpassungen für Spieler mit Behinderungen')} bg="#24333c">
      <circle cx="160" cy="80" r="40" fill="none" stroke={C.brand} strokeWidth="6" />
      <Label x={160} y={86} t={tr('fair for all', 'fair für alle')} c={C.brand} />
      <Label x={160} y={160} t={tr('assistant, aids, adapted relief', 'Assistent, Hilfsmittel, angepasste Erleichterung')} />
    </Frame>
  ),
  // 2.1 – the boundary: the whole ball must be outside
  boundary: () => (
    <Frame label={tr('Out of bounds: the whole ball outside', 'Aus: der ganze Ball außerhalb')}>
      <rect x="200" y="0" width="120" height="190" fill="#3d5a2a" />
      <Stakes x1={200} y1={0} x2={200} y2={190} c={C.white} n={6} />
      <Ball x={204} y={56} />
      <Ball x={262} y={128} />
      <Label x={100} y={60} t={tr('touches the line: in', 'berührt die Grenze: im Spiel')} c={C.brand} />
      <Label x={262} y={156} t={tr('fully outside: out', 'ganz außerhalb: Aus')} />
      <Label x={100} y={176} t={tr('course', 'Platz')} />
      <Label x={262} y={22} t={tr('out of bounds', 'Aus')} />
    </Frame>
  ),
  // 5.7 – suspension of play and its signals
  storm: () => (
    <Frame label={tr('Suspension of play', 'Spielunterbrechung')} bg="#24333c">
      <g transform="translate(-40 0)">
        <path d="M90 70 a26 26 0 0 1 48 -16 a30 30 0 0 1 56 8 a22 22 0 0 1 4 44 H96 a22 22 0 0 1 -6 -36z" fill="#56656e" />
        <path d="M150 106 l-14 30 h14 l-10 30 l30 -40 h-14 l10 -20z" fill={C.white} />
      </g>
      <Label x={250} y={52} t={tr('1 long tone', '1 langer Ton')} />
      <Label x={250} y={68} t={tr('stop at once', 'sofort aufhören')} c={C.red} />
      <Label x={250} y={102} t={tr('3 short tones', '3 kurze Töne')} />
      <Label x={250} y={118} t={tr('finish the hole', 'Loch beenden')} />
      <Label x={250} y={152} t={tr('2 short tones', '2 kurze Töne')} />
      <Label x={250} y={168} t={tr('play on', 'weiterspielen')} c={C.brand} />
    </Frame>
  ),
  // 6.4 – order of play
  order: () => (
    <Frame label={tr('Farthest from the hole plays first', 'Wer am weitesten weg ist, spielt zuerst')}>
      <path d="M20 170 C 110 140, 200 90, 290 50" stroke={C.fairway} strokeWidth="60" fill="none" strokeLinecap="round" />
      <Green x={280} y={50} r={28} />
      <Flag x={283} y={52} />
      {[[70, 150], [140, 118], [205, 92]].map(([x, y], i) => (
        <g key={i}>
          <Ball x={x} y={y} />
          <Label x={x} y={y - 12} t={String(i + 1)} c={C.brand} />
        </g>
      ))}
      <Label x={160} y={184} t={tr('farthest first – ready golf in stroke play', 'der Weiteste zuerst – im Zählspiel Ready Golf')} />
    </Frame>
  ),
  // 13.2 – the flagstick
  flagstick: () => (
    <Frame label={tr('Ball hits the flagstick in the hole', 'Ball trifft die steckende Fahne')}>
      <Green x={160} y={100} r={78} />
      <circle cx="210" cy="100" r="7" fill={C.ink} />
      <line x1="210" y1="100" x2="210" y2="30" stroke={C.white} strokeWidth="2.5" />
      <path d="M210 30 l22 8 -22 8z" fill={C.red} />
      <Ball x={201} y={103} />
      <Arrow x1={80} y1={120} x2={190} y2={105} dash />
      <Label x={110} y={150} t={tr('flag in: no penalty', 'Fahne drin: straflos')} c={C.brand} />
      <Label x={110} y={168} t={tr('decide before the stroke', 'vor dem Schlag entscheiden')} />
    </Frame>
  ),
  // 18.3 – provisional ball
  provisional: () => (
    <Frame label={tr('Provisional ball', 'Provisorischer Ball')}>
      <path d="M30 145 C 120 125, 200 100, 300 60" stroke={C.fairway} strokeWidth="50" fill="none" strokeLinecap="round" />
      {[[230, 30], [252, 42], [272, 26], [252, 14]].map(([x, y]) => <circle key={x * 1000 + y} cx={x} cy={y} r="16" fill="#2f6a2a" />)}
      <rect x="22" y="134" width="28" height="18" rx="3" fill={C.fairway} stroke={C.white} />
      <Arrow x1={45} y1={134} x2={236} y2={40} dash />
      <Ball x={242} y={34} ghost />
      <Arrow x1={48} y1={140} x2={196} y2={116} dash c={C.brand} />
      <Ball x={202} y={113} />
      <Label x={250} y={150} t={tr('“provisional ball”', '„provisorischer Ball“')} c={C.brand} />
      <Label x={160} y={184} t={tr('first one found within 3 min: play it', 'ersten binnen 3 min gefunden: mit ihm weiter')} />
    </Frame>
  ),
  // E-5 – alternative to stroke and distance
  e5: () => (
    <Frame label={tr('Local rule E-5', 'Platzregel E-5')}>
      <path d="M0 112 C 100 104, 220 96, 320 92" stroke={C.fairway} strokeWidth="56" fill="none" />
      <rect x="0" y="0" width={W} height="28" fill="#3d5a2a" />
      <Stakes x1={0} y1={28} x2={W} y2={28} c={C.white} n={8} />
      <Flag x={300} y={96} />
      <path d="M150 30 L150 80 L108 82 L108 30 Z" fill={C.relief} stroke={C.white} strokeWidth="1.5" strokeDasharray="4 3" />
      <Ball x={150} y={20} ghost />
      <Label x={129} y={60} t="+2" c={C.brand} />
      <Label x={226} y={50} t={tr('lost or out here', 'hier verloren oder Aus')} />
      <Label x={160} y={162} t={tr('area up to the fairway + 2 club-lengths', 'Bereich bis zum Fairway + 2 Schlägerlängen')} />
      <Label x={160} y={180} t={tr('two penalty strokes, not nearer the hole', 'zwei Strafschläge, nicht näher zum Loch')} />
    </Frame>
  ),
  // E-3 – preferred lies
  e3: () => (
    <Frame label={tr('Preferred lies', 'Besserlegen')}>
      <rect x="0" y="40" width={W} height="110" fill={C.fairway} />
      <Relief x={150} y={96} r={40} away={Math.PI} />
      <Ball x={150} y={96} ghost />
      <Ball x={128} y={86} />
      <Label x={130} y={50} t={one()} />
      <Arrow x1={200} y1={96} x2={290} y2={96} />
      <Label x={250} y={86} t={tr('to the hole', 'zum Loch')} />
      <Label x={160} y={176} t={tr('lift, clean, place – not nearer the hole', 'aufnehmen, reinigen, hinlegen – nicht näher zum Loch')} />
    </Frame>
  ),
  // 2.4 – no play zone: relief is a must
  noPlay: () => (
    <Frame label={tr('No play zone', 'Spielverbotszone')}>
      <rect x="150" y="30" width="130" height="120" rx="10" fill="#3d5a2a" stroke={C.white} strokeWidth="2" strokeDasharray="6 4" />
      {[[150, 30], [280, 30], [150, 150], [280, 150]].map(([x, y]) => (
        <g key={x * 1000 + y}>
          <circle cx={x} cy={y} r="6" fill="#3f7fd6" stroke={C.ink} />
          <circle cx={x} cy={y - 3} r="3" fill={C.fairway} />
        </g>
      ))}
      <Ball x={190} y={90} ghost />
      <Label x={215} y={70} t={tr('do not play', 'nicht spielen')} c={C.red} />
      <Ball x={110} y={96} />
      <Arrow x1={182} y1={90} x2={118} y2={95} dash />
      <Label x={14} y={174} t={tr('free relief – a must', 'straflose Erleichterung – Pflicht')} c={C.brand} anchor="start" />
    </Frame>
  ),
  // E-1 – dropping zone
  dropZone: () => (
    <Frame label={tr('Dropping zone', 'Dropzone')}>
      <Pond c={C.red} />
      <Flag x={290} y={40} />
      <circle cx="240" cy="140" r="26" fill={C.relief} stroke={C.white} strokeWidth="2" strokeDasharray="4 3" />
      <Label x={240} y={144} t="DZ" />
      <Ball x={110} y={130} ghost />
      <Arrow x1={118} y1={130} x2={212} y2={140} dash />
      <Label x={240} y={182} t={tr('drop in the zone, + 1', 'in der Zone droppen, + 1')} c={C.brand} />
    </Frame>
  ),
};

const BY_RULE: Record<number, string> = {
  1: 'game', 2: 'areas', 3: 'competition', 4: 'equipment', 5: 'pace', 6: 'tee', 7: 'search', 8: 'improve', 9: 'moved', 10: 'advice', 11: 'deflect',
  12: 'bunker', 13: 'green', 14: 'drop', 15: 'loose', 16: 'nearestPoint', 17: 'penaltyRed', 18: 'ob', 19: 'unplayable', 20: 'twoBalls', 21: 'stableford',
  22: 'foursomes', 23: 'fourball', 24: 'team', 25: 'disability', 26: 'ob',
};
const BY_SECTION: Record<string, string> = {
  '6.1': 'tee', '13.3': 'overhang', '14.1': 'mark', '14.3': 'drop', '16.1': 'nearestPoint', '16.2': 'animal', '16.3': 'embedded',
  '17.1': 'penaltyYellow', '18.2': 'ob', '19.2': 'unplayable', '19.3': 'unplayableBunker', '15.1': 'loose', '12.2': 'bunker', '13.1': 'green',
  '2.1': 'boundary', '5.7': 'storm', '6.4': 'order', '13.2': 'flagstick', '18.3': 'provisional', 'E-5': 'e5', 'E-3': 'e3',
  '2.4': 'noPlay', 'E-1': 'dropZone', '12.3': 'unplayableBunker',
};

/** The sketch of a rule (always one) or of a section (where a picture helps and it is not the rule's own), or null. */
export function RuleSketch(props: { rule?: number; section?: string }) {
  const own = props.section ? BY_RULE[Number(props.section.split('.')[0])] : undefined;
  const key = props.section ? (BY_SECTION[props.section] !== own ? BY_SECTION[props.section] : undefined) : props.rule != null ? BY_RULE[props.rule] : undefined;
  if (!key || !SCENES[key]) return null;
  return SCENES[key]();
}

/** For tests: every rule has its own sketch. */
export const sketchKeys = () => ({ rules: Object.keys(BY_RULE).length, scenes: Object.keys(SCENES).length });
