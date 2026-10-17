import { L, type CategoryId, type P, type SideItem, type Sketch, type SketchItem } from '../types';
import type { GolferOptions, JointName } from '../Golfer';

// A picture for every fault (Sascha 17.10.2026: "Das sieht schon deutlich besser aus, bitte alles so umsetzen"):
// the fault itself next to the right way, with numbered details from "what you see" and "why".
// Side views: face-on, target to the right, the fault left and the right way on the right. Top views: target up.
// Keyed by topic and the English name of the fault.

const FAULT = L('The fault', 'Der Fehler');
const RIGHT = L('Right', 'Richtig');
const FACE_ON = L('Face-on, target to the right.', 'Von vorn, Ziel rechts.');
const FROM_ABOVE = L('From above, target up.', 'Von oben, Ziel oben.');

// ---------- side views ----------
const G0 = 0.2;
const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
const ground = (w: number, sand = false): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]], sand });
const slope = (w: number, y0: number, y1: number, sand = false): SideItem => ({ k: 'ground', pts: [[0, y0], [w, y1]], sand });
const fig = (x: number, pose: GolferOptions['pose'], o: Omit<GolferOptions, 'pose'> & { tilt?: number; y?: number } = {}): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], pose, ...o });
const co = (on: JointName, t: L, at: P, figIndex: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
const mk = (at: P, t: L): SideItem => ({ k: 'mark', at, t });
const ball = (x: number, y = G0): SideItem => ({ k: 'ball', at: [x, y] });
const stxt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });
const line = (from: P, to: P, dashed = false): SideItem => ({ k: 'line', from, to, dashed });
const flight = (pts: P[], dashed = true): SideItem => ({ k: 'flight', pts, dashed });
/** the two headings over a side-view pair: the fault left (x 1.0), the right way right (x 2.8) */
const heads = (h: number, a = 1.0, b = 2.8): SideItem[] => [stxt([a, h - 0.2], FAULT, 12), stxt([b, h - 0.2], RIGHT, 12)];
/** a face-on pair on flat ground: fault figure at 1.0, right figure at 2.8 */
const pair = (h: number, items: SideItem[], sand = false, caption: L = FACE_ON): Sketch => S(3.8, h, [ground(3.8, sand), ...heads(h), ...items], caption);

// ---------- top views ----------
const T = (w: number, h: number, items: SketchItem[], caption?: L): Sketch => ({ view: 'top', w, h, items, caption });
const tt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SketchItem => ({ k: 'text', at, t, size, anchor });
const tm = (at: P, t: L): SketchItem => ({ k: 'mark', at, t });
const tball = (x: number, y: number, n?: string | number | L): SketchItem => ({ k: 'ball', at: [x, y], n });
const hole = (x: number, y: number): SketchItem => ({ k: 'hole', at: [x, y], flag: true });
const roll = (pts: P[], arrowHead = true): SketchItem => ({ k: 'path', pts, style: 'roll', arrow: arrowHead });
const fly = (pts: P[], arrowHead = true): SketchItem => ({ k: 'path', pts, style: 'flight', arrow: arrowHead });
const aim = (pts: P[], arrowHead = false): SketchItem => ({ k: 'path', pts, style: 'aim', arrow: arrowHead });
/** headings of a top-view pair: the fault left, the right way right */
const theads = (w: number, h: number): SketchItem[] => [tt([w / 4, h - 0.3], FAULT, 12), tt([(3 * w) / 4, h - 0.3], RIGHT, 12)];

export const FAULT_SKETCHES: Partial<Record<CategoryId, Record<string, Sketch>>> = {
  // ================= putting =================
  putting: {
    'Ball starts right of the line': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      hole(1, 3.6), aim([[1, 0.8], [1, 3.5]]), roll([[1, 0.8], [1.5, 3.7]]), tball(1, 0.8), { k: 'putter', at: [1, 0.8], angle: 14 },
      tm([1, 0.62], L('the face is open at impact – often a hit on the toe', 'die Fläche ist im Treffmoment offen – oft ein Treffer an der Spitze')),
      tm([1.42, 3.3], L('the ball starts right – even straight putts miss', 'der Ball startet rechts – auch gerade Putts gehen vorbei')),
      hole(3, 3.6), roll([[3, 0.8], [3, 3.55]]), tball(3, 0.8), { k: 'putter', at: [3, 0.8] },
      tm([3, 0.62], L('face square to the line, eyes over the ball', 'Fläche square zur Linie, Augen über dem Ball')),
    ], FROM_ABOVE),
    'Ball starts left of the line': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      hole(1, 3.6), aim([[1, 0.8], [1, 3.5]]), roll([[1, 0.8], [0.5, 3.7]]), tball(1, 0.8), { k: 'putter', at: [1, 0.8], angle: -14 },
      tm([1, 0.62], L('the face closes through impact – the hands turn over', 'die Fläche schließt sich – die Hände drehen durch den Treffmoment')),
      tm([0.58, 3.3], L('pulled putts, above all under pressure', 'gezogene Putts, vor allem unter Druck')),
      hole(3, 3.6), roll([[3, 0.8], [3, 3.55]]), tball(3, 0.8), { k: 'putter', at: [3, 0.8] },
      tm([3, 0.62], L('lead wrist stays flat – hold the finish', 'vorderes Handgelenk bleibt gerade – Finish halten')),
    ], FROM_ABOVE),
    'Always short': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      hole(1, 3.6), roll([[1, 0.8], [1, 2.95]], false), tball(1, 0.8), tball(1, 3.0),
      tm([1.02, 3.02], L('the ball dies before the hole – short backswing, then pushed', 'der Ball stirbt vor dem Loch – kurz ausgeholt, dann geschoben')),
      { k: 'zone', x: 2.75, y: 3.6, w: 0.5, h: 0.45 },
      hole(3, 3.6), roll([[3, 0.8], [3, 3.95]]), tball(3, 0.8),
      tm([3.25, 3.85], L('aim for the 45 cm zone behind the hole', 'Ziel: die 45-cm-Zone hinter dem Loch')),
    ], FROM_ABOVE),
    'Three-putts from distance': T(4, 5, [
      { k: 'green', x: 0, y: 0, w: 4, h: 5 },
      ...theads(4, 5),
      hole(1, 4.0), roll([[1, 0.4], [1, 2.6]], false), tball(1, 0.4), tball(1, 2.65),
      tm([1.02, 2.68], L('2 m short (or 2 m past) – only the line was read', '2 m zu kurz (oder 2 m zu weit) – nur auf die Linie geschaut')),
      { k: 'ring', at: [3, 4.0], r: 0.45 },
      hole(3, 4.0), roll([[3, 0.4], [3.12, 3.78]], false), tball(3, 0.4), tball(3.12, 3.8),
      tm([3.47, 4.0], L('the length decides: inside the 1 m circle, then one putt', 'die Länge entscheidet: in den 1-m-Kreis, dann ein Putt')),
    ], FROM_ABOVE),
    'Missing the short ones': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      hole(1, 3.6), roll([[1, 0.8], [1.06, 3.1], [1.16, 3.62]]), tball(1, 0.8),
      tm([1.2, 3.4], L('slowing down – the ball falls off at the edge', 'abgebremst – der Ball fällt an der Kante weg')),
      tm([1, 0.62], L('the head moves with the ball', 'der Kopf geht mit zum Ball')),
      hole(3, 3.6), roll([[3, 0.8], [3, 3.78]]), tball(3, 0.8),
      tm([3, 3.85], L('firm pace to the back of the cup – listen for it to drop', 'festes Tempo an die hintere Lochwand – den Ball fallen hören')),
    ], FROM_ABOVE),
  },

  // ================= green reading =================
  greenreading: {
    'Missing low (amateur side)': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      { k: 'slope', at: [0.35, 2.2], dir: -90 },
      hole(1, 3.6), roll([[1.4, 0.8], [1.35, 2.6], [0.72, 3.35]]), tball(1.4, 0.8),
      tm([0.75, 3.3], L('too little break read – the putt misses low', 'zu wenig Break gelesen – der Putt geht unten vorbei')),
      { k: 'slope', at: [2.35, 2.2], dir: -90 },
      hole(3, 3.6), { k: 'tee', at: [3.55, 2.55] }, roll([[3.4, 0.8], [3.7, 2.7], [3.02, 3.58]]), tball(3.4, 0.8),
      tm([3.56, 2.58], L('aim higher – a tee as the apex – and trust it', 'höher zielen – ein Tee als Scheitelpunkt – und dazu stehen')),
    ], L('From above: the green falls to the left (arrow).', 'Von oben: das Grün fällt nach links (Pfeil).')),
    'Right line, wrong speed': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      { k: 'slope', at: [0.3, 2.2], dir: -90 },
      hole(1, 3.6), tball(1.4, 0.8),
      roll([[1.4, 0.8], [1.45, 2.3], [0.85, 2.9]], false),
      roll([[1.4, 0.8], [1.58, 2.8], [1.45, 4.1]], false),
      tm([0.85, 2.9], L('too slow: it breaks early and stays short', 'zu langsam: bricht früh und bleibt kurz')),
      tm([1.45, 4.05], L('too fast: it runs through the break', 'zu schnell: läuft durch den Break')),
      { k: 'slope', at: [2.3, 2.2], dir: -90 },
      hole(3, 3.6), tball(3.4, 0.8), roll([[3.4, 0.8], [3.62, 2.7], [3.02, 3.58]]),
      tm([3.6, 2.6], L('choose the speed first, then the line', 'zuerst das Tempo wählen, dann die Linie')),
    ], L('Line and speed belong together: the same line works only at one speed.', 'Linie und Tempo gehören zusammen: dieselbe Linie passt nur zu einem Tempo.')),
    'Not seeing the slope': T(4, 4.6, [
      { k: 'green', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      hole(1, 3.4), tball(1, 1.2), { k: 'player', at: [1, 0.55], face: 'up' },
      tm([1, 0.4], L('read only from behind the ball, only with the eyes', 'nur von hinter dem Ball gelesen, nur mit den Augen')),
      hole(3, 3.4), tball(3, 1.2), { k: 'player', at: [3, 0.55], face: 'up' },
      { k: 'string', from: [3, 3.4], to: [3.75, 3.4] },
      { k: 'slope', at: [3.55, 2.6], dir: 90 },
      { k: 'player', at: [3.75, 2.3], face: 'left' },
      tm([3.75, 2.1], L('from the low side and with the feet: find the fall line', 'von der tiefen Seite und mit den Füßen lesen: die Falllinie finden')),
    ], L('From above: the green falls to the right (arrow).', 'Von oben: das Grün fällt nach rechts (Pfeil).')),
  },

  // ================= chipping =================
  chipping: {
    'Fat chip (chunk)': pair(2.3, [
      fig(1.0, 'chip', { shift: -0.08, scoop: true }), ball(1.1), line([0.86, 0.2], [0.96, 0.25]), line([0.9, 0.2], [0.99, 0.27]),
      fig(2.8, 'chip', { shift: 0.06 }), ball(2.76),
      co('pelvis', L('the weight moves back', 'das Gewicht geht nach hinten'), [0.2, 1.3], 0),
      co('hands', L('the wrists flip – the hands fall behind the clubhead', 'die Handgelenke klappen – die Hände fallen hinter den Schlägerkopf'), [0.2, 0.9], 0),
      co('clubHead', L('the club hits the ground before the ball', 'der Schläger trifft vor dem Ball den Boden'), [1.8, 0.5], 0),
      co('hands', L('handle ahead, wrists firm', 'Griff vorn, Handgelenke fest'), [3.6, 1.0], 1),
      co('pelvis', L('weight on the lead foot', 'Gewicht vorn'), [3.6, 1.5], 1),
    ]),
    'Thin or bladed chip': pair(2.3, [
      fig(1.0, 'chip', { standUp: true, scoop: true }), ball(1.12), arrow([1.2, 0.27], [1.75, 0.38]),
      fig(2.8, 'chip', { shift: 0.05 }), ball(2.76),
      co('neck', L('the body comes up', 'der Körper richtet sich auf'), [0.2, 1.4], 0),
      mk([1.12, 0.27], L('the leading edge hits the middle of the ball – it shoots flat and long', 'die Vorderkante trifft die Ballmitte – der Ball schießt flach und weit')),
      co('clubHead', L('stay down, brush the grass, accelerate', 'unten bleiben, Gras streifen, beschleunigen'), [3.6, 0.6], 1),
    ]),
    'Wrong length': T(4, 5, [
      { k: 'green', x: 0, y: 1.0, w: 4, h: 4 }, { k: 'fringe', x: 0, y: 0, w: 4, h: 1.0 },
      ...theads(4, 5),
      hole(1, 3.6), tball(1, 0.35), tball(0.75, 2.5), tball(1.25, 4.3), tball(0.9, 3.0),
      tm([0.75, 2.5], L('no landing spot – sometimes short, sometimes long', 'kein Landepunkt – mal zu kurz, mal zu lang')),
      hole(3, 3.6), tball(3, 0.35), { k: 'ring', at: [3, 1.8], r: 0.3 },
      fly([[3, 0.35], [3, 1.75]], false), roll([[3, 1.8], [3, 3.5]]),
      tm([3.3, 1.8], L('pick the landing spot, then the club whose roll fits', 'Landepunkt wählen, dann den Schläger, dessen Rollen passt')),
    ], FROM_ABOVE),
    'Slowing down': pair(2.3, [
      fig(1.0, 'chip'), ball(0.96),
      arrow([0.92, 0.45], [0.35, 0.45]), arrow([1.06, 0.45], [1.24, 0.45]),
      mk([0.4, 0.45], L('a long backswing …', 'ein langes Ausholen …')),
      mk([1.24, 0.45], L('… then a short, jerky through-swing', '… dann ein kurzes, ruckartiges Durchschwingen')),
      fig(2.8, 'chipFinish'),
      arrow([2.74, 0.45], [2.5, 0.45]), arrow([2.86, 0.45], [3.5, 0.45]),
      co('clubHead', L('short back, long through – hold the finish 2 s', 'kurz zurück, lang durch – das Finish 2 s halten'), [3.6, 1.0], 1),
    ]),
  },

  // ================= pitching =================
  pitching: {
    'Every pitch a different length': T(4, 5.4, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 5.4 },
      ...theads(4, 5.4),
      tball(1, 0.3), tball(0.9, 1.6), tball(1.15, 3.7), tball(0.85, 2.5), tball(1.05, 4.6),
      tm([1.15, 3.7], L('speed changed instead of swing length – the length is random', 'Tempo statt Schwunglänge verändert – die Länge ist Zufall')),
      tball(3, 0.3),
      { k: 'ring', at: [3, 1.7], r: 0.3, label: '7:30' }, { k: 'ring', at: [3, 3.0], r: 0.3, label: '9:00' }, { k: 'ring', at: [3, 4.3], r: 0.3, label: '10:30' },
      tball(3.08, 1.66), tball(2.94, 3.04), tball(3.05, 4.26),
      tm([3.3, 3.0], L('three swing lengths, one rhythm – your wedge table', 'drei Schwunglängen, ein Rhythmus – deine Wedge-Tabelle')),
    ], FROM_ABOVE),
    'Fat or thin pitches': pair(2.3, [
      fig(1.0, 'impact', { club: 'wedge', shift: -0.08, scoop: true }), ball(1.1),
      fig(2.8, 'impact', { club: 'wedge', shift: 0.05 }), ball(2.8),
      co('pelvis', L('weight back, a pure arm swing', 'Gewicht hinten, reiner Armschwung'), [0.2, 1.3], 0),
      co('hands', L('the wrists snap to the ball – ground before the ball or the edge into the ball', 'die Handgelenke schnappen zum Ball – Boden vor dem Ball oder die Kante in den Ball'), [0.2, 0.8], 0),
      co('pelvis', L('the body turns the club, the arms stay in front of the chest', 'der Körper dreht den Schläger, die Arme bleiben vor der Brust'), [3.6, 1.4], 1),
    ]),
    'Slowing down at the ball': pair(2.6, [
      fig(1.0, 'frontTop', { club: 'wedge' }),
      fig(2.8, 'halfBack'),
      co('hands', L('backswing too long for the distance – the brain brakes', 'Ausholen zu lang für die Distanz – das Gehirn bremst'), [0.2, 2.2], 0),
      co('hands', L('shorter back (9 o’clock), then a full finish', 'kürzer ausholen (9 Uhr), dann volles Finish'), [3.6, 2.2], 1),
    ]),
  },

  // ================= bunker =================
  bunker: {
    'Ball stays in the bunker': pair(2.6, [
      fig(1.0, 'impact', { club: 'wedge', shift: -0.04 }), ball(1.25),
      flight([[1.25, 0.25], [1.4, 1.4], [1.55, 0.22]]),
      mk([0.98, 0.22], L('entered far behind the ball – too much sand', 'weit hinter dem Ball eingetreten – zu viel Sand')),
      co('hands', L('square face that digs, slowing down', 'square Fläche, die gräbt, und Abbremsen'), [0.2, 1.2], 0),
      fig(2.8, 'frontFinish', { club: 'wedge' }), ball(2.86),
      flight([[2.86, 0.25], [3.3, 1.9], [3.7, 1.0]]),
      co('pelvis', L('open face, full finish with pace', 'offene Fläche, volles Finish mit Tempo'), [3.6, 0.8], 1),
    ], true),
    'Thin over the green': pair(2.3, [
      fig(1.0, 'impact', { club: 'wedge', standUp: true, shift: -0.05 }), ball(1.04), arrow([1.12, 0.3], [1.8, 0.42]),
      co('neck', L('looking at the ball, the body comes up, weight back', 'auf den Ball geschaut, der Körper richtet sich auf, Gewicht hinten'), [0.2, 1.5], 0),
      mk([1.04, 0.3], L('the club hits the ball first – it flies over the green', 'der Schläger trifft zuerst den Ball – er fliegt übers Grün')),
      fig(2.8, 'impact', { club: 'wedge', shift: 0.04 }), ball(2.88),
      mk([2.8, 0.2], L('look at the spot 3–5 cm behind the ball, weight forward', 'auf den Punkt 3–5 cm hinter dem Ball schauen, Gewicht vorn')),
    ], true),
    'Never the right length': T(4, 6, [
      { k: 'fringe', x: 0, y: 0, w: 4, h: 6 }, { k: 'green', x: 0.1, y: 1.6, w: 3.8, h: 4.3 },
      { k: 'sand', x: 0.2, y: 0.1, w: 1.6, h: 1.2, round: true }, { k: 'sand', x: 2.2, y: 0.1, w: 1.6, h: 1.2, round: true },
      ...theads(4, 6),
      tball(1, 0.6), hole(1, 3.4), tball(1.15, 2.0), tball(0.8, 5.3),
      tm([1.15, 2.0], L('out, but 2 m or 15 m from the hole – length through pace', 'raus, aber 2 m oder 15 m vom Loch – Länge über das Tempo')),
      tball(3, 0.6), { k: 'ring', at: [3, 2.2], r: 0.25, label: '5 m' }, { k: 'ring', at: [3, 3.4], r: 0.25, label: '10 m' }, { k: 'ring', at: [3, 4.6], r: 0.25, label: '15 m' },
      tm([3.25, 3.4], L('three swing lengths – the pace stays the same', 'drei Schwunglängen – das Tempo bleibt gleich')),
    ], FROM_ABOVE),
  },

  // ================= slopes =================
  slopes: {
    'Losing balance': S(3.8, 2.6, [
      slope(3.8, 0.9, 0.2),
      ...heads(2.6),
      fig(1.0, 'frontFinish', { tilt: -16, y: 0.716 }), arrow([1.3, 0.95], [1.75, 0.75]),
      co('pelvis', L('a 100 % swing – you fall down the slope', '100 % geschwungen – du fällst den Hang hinunter'), [0.2, 1.5], 0),
      fig(2.8, 'frontFinish', { tilt: -6, y: 0.384, stance: 'wide' }),
      co('pelvis', L('80 % swing, wider stance, hold the finish 3 s', '80 % Schwung, breiterer Stand, Finish 3 s halten'), [3.6, 1.5], 1),
    ], L('Downhill lie, face-on.', 'Hanglage bergab, von vorn.')),
    'Fat shots on uphill lies and above the feet': S(3.8, 2.6, [
      slope(3.8, 0.2, 0.9),
      ...heads(2.6),
      fig(1.0, 'front', { tilt: 10.4, y: 0.384, shift: -0.08 }), ball(1.12, 0.41),
      mk([1.0, 0.37], L('the weight falls back – the club digs into the slope', 'das Gewicht fällt zurück – der Schläger gräbt sich in den Hang')),
      fig(2.8, 'front', { tilt: 10.4, y: 0.716, shift: 0.03 }), ball(2.86, 0.73),
      co('hands', L('grip down, find the low point with a practice swing', 'kürzer greifen, den tiefsten Punkt mit einem Probeschwung finden'), [3.6, 1.8], 1),
    ], L('Uphill lie, face-on.', 'Hanglage bergauf, von vorn.')),
    'Thin and right from below the feet': S(3.8, 2.6, [
      slope(3.8, 0.6, 0.0),
      ...heads(2.6, 1.0, 2.7),
      fig(0.9, 'address', { standUp: true, tilt: -9, y: 0.458 }), ball(1.6, 0.347),
      co('head', L('standing up during the swing – topped or a weak slice', 'während des Schwungs aufgerichtet – getoppt oder ein schwacher Slice'), [0.2, 2.1], 0),
      fig(2.6, 'address', { crouch: true, tilt: -9, y: 0.19 }), ball(3.3, 0.078),
      co('leadKnee', L('more knee flex, stay down, aim left', 'mehr Kniebeuge, unten bleiben, links zielen'), [3.6, 1.2], 1),
    ], L('Ball below the feet, from the side.', 'Ball unter den Füßen, von der Seite.')),
  },

  // ================= trouble =================
  trouble: {
    'Punch shot goes up into the branches': pair(2.6, [
      line([0.3, 2.0], [1.8, 2.0]), line([2.1, 2.0], [3.6, 2.0]), stxt([3.6, 2.08], L('branches', 'Äste'), 10, 'end'),
      fig(1.0, 'impact', { scoop: true }), ball(1.16), flight([[1.16, 0.25], [1.2, 1.6], [1.6, 1.98]], false),
      mk([1.6, 1.98], L('too high – into the branches', 'zu hoch – in die Äste')),
      co('hands', L('ball too far forward, the hands flip, too much loft', 'Ball zu weit vorn, die Hände klappen, zu viel Loft'), [0.2, 1.0], 0),
      fig(2.8, 'impact', { shift: 0.06 }), ball(2.72), flight([[2.72, 0.25], [3.2, 0.55], [3.7, 0.4]], false),
      co('hands', L('ball back, hands ahead, short finish with low hands', 'Ball zurück, Hände vorn, kurzes Finish mit tiefen Händen'), [3.6, 1.4], 1),
    ]),
    'Hero shot fails': T(6, 6, [
      { k: 'rough', x: 0, y: 0, w: 6, h: 6 },
      { k: 'fairway', x: 1.8, y: 0, w: 1.2, h: 6 }, { k: 'fairway', x: 4.8, y: 0, w: 1.2, h: 6 },
      ...theads(6, 6),
      { k: 'ring', at: [1.0, 2.6], r: 0.45, fill: true }, { k: 'ring', at: [1.7, 3.0], r: 0.45, fill: true }, { k: 'water', x: 0.2, y: 4.1, w: 1.2, h: 0.8, round: true },
      tball(0.9, 1.0), fly([[0.9, 1.0], [1.35, 2.75], [0.9, 4.4]]),
      tm([0.95, 4.4], L('the gap overrated – straight into the next trouble', 'die Lücke überschätzt – direkt in die nächste Gefahr')),
      { k: 'ring', at: [4.0, 2.6], r: 0.45, fill: true }, { k: 'ring', at: [4.7, 3.0], r: 0.45, fill: true },
      tball(3.9, 1.0), roll([[3.9, 1.0], [5.3, 1.6]]), fly([[5.3, 1.6], [5.4, 4.9]]), hole(5.4, 5.0),
      tm([5.3, 1.6], L('out sideways onto the fairway – a bogey instead of a triple', 'seitlich raus aufs Fairway – Bogey statt Triple')),
    ], FROM_ABOVE),
    'Flyer over the green': S(3.8, 2.2, [
      { k: 'ground', pts: [[0, G0], [3.8, G0]] },
      line([2.55, 0.22], [3.25, 0.22]), stxt([2.9, 0.05], L('green', 'Grün'), 10),
      { k: 'flag', at: [2.9, G0] },
      line([0.22, 0.2], [0.24, 0.32]), line([0.32, 0.2], [0.3, 0.33]), ball(0.28),
      flight([[0.28, 0.25], [2.0, 1.9], [3.6, 0.2]]),
      mk([3.6, 0.22], L('from the light rough: 10–15 m too long – less spin', 'aus dem leichten Rough: 10–15 m zu weit – weniger Spin')),
      flight([[0.28, 0.25], [1.5, 1.4], [2.7, 0.2]], false),
      mk([2.6, 0.24], L('one club less, or aim short of the flag', 'einen Schläger weniger oder vor die Fahne zielen')),
    ], L('The same club as from the fairway flies too far: grass between face and ball takes the spin.', 'Derselbe Schläger wie vom Fairway fliegt zu weit: Gras zwischen Fläche und Ball nimmt den Spin.')),
  },

  // ================= irons =================
  irons: {
    'Fat shots': pair(2.3, [
      fig(1.0, 'impact', { shift: -0.08, scoop: true }), ball(1.12), line([0.86, 0.2], [0.98, 0.26]), line([0.9, 0.2], [1.0, 0.28]),
      co('pelvis', L('the weight stays back', 'das Gewicht bleibt hinten'), [0.2, 1.3], 0),
      mk([0.92, 0.24], L('the club hits the ground before the ball – short and heavy', 'der Schläger trifft vor dem Ball den Boden – kurz und schwer')),
      fig(2.8, 'impact', { shift: 0.06 }), ball(2.74),
      line([2.8, 0.2], [2.95, 0.2]),
      co('hands', L('hands ahead of the ball', 'Hände vor dem Ball'), [3.6, 1.2], 1),
      mk([2.92, 0.2], L('ball first, then the divot', 'erst der Ball, dann das Divot')),
    ]),
    'Thin shots': pair(2.3, [
      fig(1.0, 'impact', { standUp: true }), ball(1.0), arrow([1.08, 0.3], [1.7, 0.36]),
      co('neck', L('the chest lifts – trying to help the ball up', 'der Brustkorb hebt sich – dem Ball nach oben helfen wollen'), [0.2, 1.6], 0),
      mk([1.0, 0.28], L('hit in the middle of the ball – flat and hard', 'in der Mitte des Balls getroffen – flach und hart')),
      fig(2.8, 'impact', { shift: 0.04 }), ball(2.78),
      co('leadShoulder', L('keep the posture, hit down, hands ahead', 'Haltung halten, nach unten schlagen, Hände vorn'), [3.6, 1.5], 1),
    ]),
    'Always short': T(4, 5, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 5 },
      { k: 'green', x: 0.4, y: 3.2, w: 1.2, h: 1.4, round: true }, { k: 'green', x: 2.4, y: 3.2, w: 1.2, h: 1.4, round: true },
      ...theads(4, 5),
      tball(1, 0.3), hole(1, 3.9), tball(0.9, 2.7), tball(1.1, 2.85), tball(1.0, 3.05),
      tm([1.1, 2.75], L('good shots land short of the green – the lengths are overrated', 'gute Schläge landen vor dem Grün – die Längen sind überschätzt')),
      tball(3, 0.3, L('+1 club', '+1 Schläger')), hole(3, 3.9), tball(2.9, 3.75), tball(3.1, 4.0), tball(3.0, 3.6),
      tm([3.15, 3.9], L('measure your carry, take one club more', 'Carry messen, einen Schläger mehr nehmen')),
    ], FROM_ABOVE),
  },

  // ================= woods =================
  woods: {
    Topping: pair(2.3, [
      fig(1.0, 'impact', { club: 'driver', standUp: true }), ball(1.12), arrow([1.2, 0.26], [1.8, 0.26]),
      co('neck', L('trying to lift the ball – the body comes up', 'den Ball heben wollen – der Körper richtet sich auf'), [0.2, 1.5], 0),
      mk([1.12, 0.26], L('the ball runs along the ground', 'der Ball rollt am Boden entlang')),
      fig(2.8, 'impact', { club: 'driver' }), ball(2.94),
      co('leadShoulder', L('chest over the ball', 'Brust über dem Ball'), [3.6, 1.5], 1),
      co('clubHead', L('the club brushes the grass like a broom', 'der Schläger streift das Gras wie ein Besen'), [3.6, 0.7], 1),
    ]),
    'Fat (chunked) woods': pair(2.3, [
      fig(1.0, 'impact', { club: 'driver', shift: -0.08 }), ball(1.18), line([0.88, 0.2], [1.06, 0.27]), line([0.93, 0.2], [1.09, 0.29]),
      co('pelvis', L('weight back, too steep – like an iron', 'Gewicht hinten, zu steil – wie mit dem Eisen'), [0.2, 1.3], 0),
      mk([0.98, 0.25], L('a big divot, the ball goes short', 'großes Divot, der Ball bleibt kurz')),
      fig(2.8, 'impact', { club: 'driver' }), ball(2.94),
      co('clubHead', L('a wide, flat takeaway – sweep, don’t dig', 'weit und flach ausholen – fegen, nicht graben'), [3.6, 0.8], 1),
    ]),
  },

  // ================= driver =================
  driver: {
    'Slice off the tee': T(4, 6, [
      { k: 'rough', x: 0, y: 0, w: 4, h: 6 },
      { k: 'fairway', x: 0.45, y: 0, w: 1.1, h: 6 }, { k: 'fairway', x: 2.45, y: 0, w: 1.1, h: 6 },
      ...theads(4, 6),
      { k: 'player', at: [0.75, 0.6], face: 'right' }, tball(1, 0.6), fly([[1, 0.6], [0.85, 3.8], [1.85, 5.2]]),
      tm([1.8, 5.1], L('the ball curves hard to the right – off the fairway', 'der Ball dreht stark nach rechts – vom Fairway')),
      tm([1, 0.45], L('open face to an out-to-in path, often a weak grip', 'offene Fläche zu einer Bahn von außen, oft ein schwacher Griff')),
      { k: 'player', at: [2.75, 0.6], face: 'right' }, tball(3, 0.6), fly([[3, 0.6], [3.15, 3.5], [2.95, 5.2]]),
      tm([2.95, 5.15], L('face square to the path – the gate drill from the inside', 'Fläche square zur Bahn – die Tor-Übung von innen')),
    ], FROM_ABOVE),
    'Sky ball (pop-up)': S(3.8, 2.4, [
      { k: 'ground', pts: [[0, G0], [3.8, G0]] },
      line([0.3, 0.2], [0.3, 0.3]), ball(0.3, 0.3),
      flight([[0.3, 0.32], [0.85, 2.2], [1.4, 0.2]]),
      mk([0.85, 1.65], L('very high and short – a mark on the top of the club', 'sehr hoch und kurz – ein Abdruck oben auf dem Schläger')),
      flight([[0.3, 0.32], [1.9, 1.4], [3.6, 0.2]], false),
      mk([2.6, 1.25], L('hit up with the ball forward: high and long', 'mit dem Ball vorn aufwärts treffen: hoch und weit')),
    ], L('Too steep down, the tee too high for the swing or the ball too far back.', 'Zu steil nach unten, das Tee zu hoch für den Schwung oder der Ball zu weit hinten.')),
    'Toe or heel hits': {
      view: 'face',
      marks: [
        { x: 0.8, y: 0.1, n: L('toe', 'Spitze') },
        { x: -0.8, y: -0.1, n: L('heel', 'Ferse') },
      ],
      caption: L('Short drives that curve: the hits sit on the toe or the heel. The aim is the circle in the middle – impact spray shows where you hit.', 'Kurze Drives, die drehen: die Treffer sitzen an der Spitze oder Ferse. Ziel ist der Kreis in der Mitte – Treffspray zeigt, wo du triffst.'),
    },
  },

  // ================= basics =================
  basics: {
    'Aiming right without knowing it': T(4, 5, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 5 },
      ...theads(4, 5),
      hole(1, 4.0),
      { k: 'stick', from: [0.55, 0.5], to: [0.9, 3.8] },
      { k: 'player', at: [0.62, 0.95], face: 'up' }, tball(0.95, 0.95),
      fly([[0.95, 0.95], [1.32, 4.1]]),
      tm([0.62, 2.5], L('the body is aimed at the target …', 'der Körper ist aufs Ziel gerichtet …')),
      tm([1.32, 4.0], L('… so the ball goes right of it', '… also geht der Ball rechts vorbei')),
      hole(3, 4.0),
      { k: 'stick', from: [2.6, 0.5], to: [2.6, 4.0] },
      { k: 'player', at: [2.68, 0.95], face: 'up' }, tball(3, 0.95),
      fly([[3, 0.95], [3, 3.9]]),
      tm([2.6, 2.5], L('feet parallel left of the target line – railway tracks', 'Füße parallel links der Ziellinie – Bahngleise')),
    ], FROM_ABOVE),
    'Grip in the palm': {
      view: 'palm',
      notes: [
        L('through the palm like a hammer – no speed, the wrists cannot hinge', 'quer durch die Handfläche wie ein Hammer – keine Geschwindigkeit, die Handgelenke winkeln nicht ab'),
        L('diagonally through the fingers: from the base of the little finger to the middle of the index finger', 'schräg durch die Finger: vom Ansatz des kleinen Fingers bis zur Mitte des Zeigefingers'),
      ],
      caption: L('The lead hand, palm towards you.', 'Die vordere Hand, Handfläche zu dir.'),
    },
  },

  // ================= swing =================
  swing: {
    'Over the top': T(4, 2.6, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 2.6 },
      ...theads(4, 2.6),
      { k: 'player', at: [0.45, 1.0], face: 'right' }, tball(1, 1.0),
      { k: 'path', pts: [[1.55, 0.2], [0.55, 1.95]], style: 'club', arrow: true },
      tm([1.5, 0.3], L('the shoulders start down – the club comes from outside across the ball', 'die Schultern starten den Abschwung – der Schläger kommt von außen quer über den Ball')),
      tm([0.6, 1.9], L('pulls and slices, divots point left', 'Pulls und Slices, Divots zeigen nach links')),
      { k: 'player', at: [2.45, 1.0], face: 'right' }, tball(3, 1.0),
      { k: 'path', pts: [[2.75, 0.2], [3.25, 1.95]], style: 'club', arrow: true },
      tm([3.25, 1.9], L('from the inside to the ball – the pump drill', 'von innen an den Ball – die Pump-Übung')),
    ], L('From above, target up: the path of the clubhead through the ball.', 'Von oben, Ziel oben: die Bahn des Schlägerkopfs durch den Ball.')),
    'Rushing the swing': T(4, 2.8, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 2.8 },
      tt([0.2, 2.45], FAULT, 12, 'start'), tt([0.2, 1.15], RIGHT, 12, 'start'),
      { k: 'zone', x: 0.2, y: 1.6, w: 1.0, h: 0.5, label: L('back', 'zurück') }, { k: 'zone', x: 1.3, y: 1.6, w: 1.0, h: 0.5, label: L('down', 'runter') },
      tm([2.3, 1.85], L('back as fast as down – a jerk from the top', 'zurück so schnell wie runter – ein Reißen von oben')),
      { k: 'zone', x: 0.2, y: 0.3, w: 2.4, h: 0.5, label: L('back 1 – 2 – 3', 'zurück 1 – 2 – 3') }, { k: 'zone', x: 2.7, y: 0.3, w: 0.8, h: 0.5, label: '4' },
      tm([3.5, 0.55], L('3 : 1 – a short pause at the top', '3 : 1 – oben kurz anhalten')),
    ], L('The timing of the swing: back three counts, down one.', 'Der Takt des Schwungs: zurück drei Zählzeiten, runter eine.')),
    'Sway instead of turn': pair(2.7, [
      fig(1.0, 'frontTop', { shift: -0.12 }),
      { k: 'line', from: [0.72, 0.2], to: [0.72, 1.3], stick: true },
      co('trailHip', L('the hip slides away from the target – into the stick', 'die Hüfte gleitet vom Ziel weg – gegen den Stab'), [0.2, 0.9], 0),
      co('head', L('the head moves a lot – fat and thin', 'der Kopf bewegt sich stark – fett und dünn'), [0.2, 2.2], 0),
      fig(2.8, 'frontTop'),
      { k: 'line', from: [2.52, 0.2], to: [2.52, 1.3], stick: true },
      co('trailHip', L('the hip turns away from the stick', 'die Hüfte dreht vom Stab weg'), [3.6, 0.9], 1),
    ]),
  },

  // ================= ball flight =================
  ballflight: {
    Slice: T(4, 4.6, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      tball(1, 0.9), { k: 'path', pts: [[1.4, 0.3], [0.65, 1.45]], style: 'club', arrow: true }, { k: 'putter', at: [1, 0.9], angle: 16 },
      fly([[1, 0.9], [0.8, 3.0], [1.6, 4.2]]),
      tm([1.3, 0.55], L('the face open to an out-to-in path', 'die Fläche offen zu einer Bahn von außen nach innen')),
      tm([1.6, 4.1], L('a strong curve right, a weak flight', 'starke Kurve nach rechts, schwacher Flug')),
      tball(3, 0.9), { k: 'path', pts: [[3, 0.3], [3, 1.5]], style: 'club', arrow: true }, { k: 'putter', at: [3, 0.9] },
      fly([[3, 0.9], [3, 4.1]]),
      tm([3.25, 0.7], L('face square to the path – check the grip, swing from the inside', 'Fläche square zur Bahn – Griff prüfen, von innen schwingen')),
    ], L('From above, target up: the path of the club (grey arrow) and the face at impact.', 'Von oben, Ziel oben: die Bahn des Schlägers (grauer Pfeil) und die Fläche im Treffmoment.')),
    Hook: T(4, 4.6, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      tball(1, 0.9), { k: 'path', pts: [[0.65, 0.3], [1.35, 1.5]], style: 'club', arrow: true }, { k: 'putter', at: [1, 0.9], angle: -16 },
      fly([[1, 0.9], [1.25, 2.9], [0.45, 3.8]]),
      tm([0.7, 0.55], L('the face closed to the path – the hands turn over', 'die Fläche geschlossen zur Bahn – die Hände klappen über')),
      tm([0.45, 3.75], L('a strong curve left, often low', 'starke Kurve nach links, oft flach')),
      tball(3, 0.9), { k: 'path', pts: [[3, 0.3], [3, 1.5]], style: 'club', arrow: true }, { k: 'putter', at: [3, 0.9] },
      fly([[3, 0.9], [3, 4.1]]),
      tm([3.25, 0.7], L('a weaker grip, keep turning, hold the finish', 'schwächerer Griff, weiter drehen, Finish halten')),
    ], L('From above, target up: the path of the club (grey arrow) and the face at impact.', 'Von oben, Ziel oben: die Bahn des Schlägers (grauer Pfeil) und die Fläche im Treffmoment.')),
    Shank: {
      view: 'face',
      marks: [{ x: -1.08, y: -0.2, n: L('shank: off the hosel', 'Shank: am Hals') }],
      caption: L('The ball shoots off the hosel sharply right: at impact the club is closer to the ball than at address (weight on the toes). The aim is the circle in the middle – a tee outside the ball helps.', 'Der Ball schießt vom Hals scharf nach rechts: im Treffmoment ist der Schläger näher am Ball als beim Ansprechen (Gewicht auf den Zehen). Ziel ist der Kreis in der Mitte – ein Tee außerhalb des Balls hilft.'),
    },
    'Topped shots': pair(2.3, [
      fig(1.0, 'impact', { standUp: true }), ball(1.1), arrow([1.18, 0.26], [1.8, 0.26]),
      co('neck', L('standing up, the arms pull in – trying to lift the ball', 'aufgerichtet, die Arme ziehen ein – den Ball heben wollen'), [0.2, 1.6], 0),
      mk([1.1, 0.26], L('the ball runs along the ground', 'der Ball rollt am Boden')),
      fig(2.8, 'impact', { shift: 0.04 }), ball(2.78), line([2.84, 0.2], [2.98, 0.2]),
      co('leadShoulder', L('keep the posture', 'Haltung halten'), [3.6, 1.5], 1),
      mk([2.95, 0.2], L('brush the grass after the ball', 'das Gras nach dem Ball streifen')),
    ]),
  },

  // ================= strategy =================
  strategy: {
    'Attacking every flag': T(6, 4.6, [
      { k: 'fairway', x: 0, y: 0, w: 6, h: 4.6 },
      ...theads(6, 4.6),
      { k: 'green', x: 0.3, y: 2.3, w: 2.0, h: 1.6, round: true }, { k: 'water', x: 2.2, y: 2.3, w: 0.7, h: 1.6, round: true },
      hole(1.95, 3.1), tball(1.5, 0.3), aim([[1.5, 0.3], [1.95, 3.0]]), { k: 'ring', at: [1.95, 3.1], r: 0.6 },
      tm([2.5, 3.0], L('aimed at the flag – the spread reaches the water', 'auf die Fahne gezielt – die Streuung reicht ins Wasser')),
      { k: 'green', x: 3.3, y: 2.3, w: 2.0, h: 1.6, round: true }, { k: 'water', x: 5.2, y: 2.3, w: 0.7, h: 1.6, round: true },
      hole(4.95, 3.1), tball(4.5, 0.3), aim([[4.5, 0.3], [4.3, 3.0]]), { k: 'ring', at: [4.3, 3.1], r: 0.6 },
      tm([3.7, 3.1], L('the middle of the green – the whole spread stays dry', 'Grünmitte – die ganze Streuung bleibt trocken')),
    ], L('From above: the ring is your spread with this club.', 'Von oben: der Ring ist deine Streuung mit diesem Schläger.')),
    'Doubling the trouble': T(6, 6, [
      { k: 'rough', x: 0, y: 0, w: 6, h: 6 },
      { k: 'fairway', x: 0.6, y: 0, w: 1.2, h: 5 }, { k: 'fairway', x: 3.6, y: 0, w: 1.2, h: 5 },
      { k: 'green', x: 0.7, y: 4.6, w: 1.0, h: 0.9, round: true }, { k: 'green', x: 3.7, y: 4.6, w: 1.0, h: 0.9, round: true },
      ...theads(6, 6),
      { k: 'ring', at: [2.4, 2.2], r: 0.5, fill: true, label: L('trees', 'Bäume') }, { k: 'water', x: 1.9, y: 3.6, w: 0.9, h: 0.7, round: true },
      tball(1.2, 0.3), fly([[1.2, 0.3], [2.3, 2.1]]), tball(2.3, 2.1, 1), fly([[2.3, 2.1], [2.3, 3.85]]),
      tm([2.6, 3.95], L('after the bad shot the hero shot – a bogey becomes a triple', 'nach dem Fehler der Heldenschlag – aus Bogey wird Triple')),
      { k: 'ring', at: [5.4, 2.2], r: 0.5, fill: true, label: L('trees', 'Bäume') },
      tball(4.2, 0.3), fly([[4.2, 0.3], [5.3, 2.1]]), tball(5.3, 2.1, 1), roll([[5.3, 2.1], [4.3, 2.6]]), tball(4.3, 2.6, 2), fly([[4.3, 2.6], [4.2, 4.9]]),
      tm([4.3, 2.6], L('back onto the fairway – a bogey is fine', 'zurück aufs Fairway – ein Bogey ist in Ordnung')),
    ], FROM_ABOVE),
  },

  // ================= mental =================
  mental: {
    'Doubt over the ball': T(4, 4.6, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 4.6 },
      ...theads(4, 4.6),
      { k: 'zone', x: 0.2, y: 2.3, w: 1.6, h: 1.6, label: L('play box', 'Spielbox') }, { k: 'zone', x: 0.2, y: 0.2, w: 1.6, h: 1.6, label: L('think box', 'Denkbox') },
      { k: 'stick', from: [0.2, 2.05], to: [1.8, 2.05] },
      { k: 'player', at: [0.8, 3.0], face: 'right' }, tball(1.3, 3.0),
      tm([0.8, 2.75], L('a new thought at address – a hesitant swing', 'ein neuer Gedanke beim Ansprechen – ein zögerlicher Schwung')),
      { k: 'zone', x: 2.2, y: 2.3, w: 1.6, h: 1.6, label: L('play box', 'Spielbox') }, { k: 'zone', x: 2.2, y: 0.2, w: 1.6, h: 1.6, label: L('think box', 'Denkbox') },
      { k: 'stick', from: [2.2, 2.05], to: [3.8, 2.05] },
      { k: 'player', at: [2.8, 1.0], face: 'up' }, roll([[2.9, 2.8], [2.9, 1.3]]), tball(3.3, 3.0),
      tm([2.9, 2.7], L('in doubt: step back over the line and start again', 'bei Zweifel zurück über die Linie und neu beginnen')),
    ], L('Decide behind the line (the stick), then only target and feel.', 'Hinter der Linie (dem Stab) entscheiden, davor nur Ziel und Gefühl.')),
    'One bad hole ruins the round': T(4, 3.2, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 3.2 },
      ...theads(4, 3.2),
      tt([1, 2.3], L('hole 7: 7', 'Loch 7: 7'), 13), tt([1, 1.6], L('hole 8: 6', 'Loch 8: 6'), 13), tt([1, 0.9], L('hole 9: 6', 'Loch 9: 6'), 13),
      tm([1.6, 1.65], L('anger, trying to win the shots back – two more doubles', 'Ärger, die Schläge zurückholen wollen – zwei weitere Doppel')),
      tt([3, 2.3], L('hole 7: 7', 'Loch 7: 7'), 13), tt([3, 1.6], L('hole 8: 4', 'Loch 8: 4'), 13), tt([3, 0.9], L('hole 9: 5', 'Loch 9: 5'), 13),
      tm([3.6, 2.3], L('10 seconds of anger, then a neutral sentence – done', '10 Sekunden ärgern, dann ein neutraler Satz – abgehakt')),
    ], L('The scores after a triple bogey on hole 7.', 'Die Scores nach einem Triple-Bogey an Loch 7.')),
  },

  // ================= fitness =================
  fitness: {
    'Short, armsy backswing': pair(2.6, [
      fig(1.0, 'halfBack', { club: 'iron' }),
      co('leadShoulder', L('the arms swing past the body, the shoulders hardly turn', 'die Arme schwingen am Körper vorbei, die Schultern drehen kaum'), [0.2, 2.2], 0),
      fig(2.8, 'frontTop'),
      co('leadShoulder', L('the upper back turns: open books and seated rotation every day', 'der obere Rücken dreht: jeden Tag offene Bücher und Rotation im Sitzen'), [3.6, 2.2], 1),
    ]),
    'Early extension (standing up)': S(3.8, 2.4, [
      ground(3.8),
      ...heads(2.4, 0.9, 2.7),
      fig(0.7, 'address', { standUp: true }), ball(1.35),
      co('pelvis', L('the hips move towards the ball – you stand up: thin and shanks', 'die Hüfte geht zum Ball – du richtest dich auf: dünn und Shank'), [0.15, 1.3], 0),
      fig(2.5, 'address'), ball(3.15),
      co('pelvis', L('the hips stay back, the angles hold – strong glutes help', 'die Hüfte bleibt hinten, die Winkel halten – ein starkes Gesäß hilft'), [3.6, 1.6], 1),
    ], L('From the side, the ball to the right.', 'Von der Seite, der Ball rechts.')),
  },

  // ================= practice =================
  practice: {
    'Machine-gunning range balls': T(4, 5, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 5 },
      ...theads(4, 5),
      hole(1, 4.0),
      ...([[0.85, 0.5], [0.95, 0.6], [1.05, 0.5], [0.9, 0.4], [1.0, 0.42], [1.1, 0.6], [0.8, 0.62]] as P[]).map(([x, y]) => tball(x, y)),
      { k: 'player', at: [0.55, 0.5], face: 'right' }, fly([[1, 0.6], [1, 3.9]]),
      tm([1.25, 0.52], L('100 balls in 30 minutes, always the same club, no target', '100 Bälle in 30 Minuten, immer derselbe Schläger, kein Ziel')),
      hole(2.5, 3.3), hole(3.2, 3.95), hole(3.6, 2.7),
      { k: 'ring', at: [3, 0.25], r: 0.2, label: L('basket', 'Korb') },
      { k: 'player', at: [3, 0.85], face: 'up' }, tball(3, 1.25), aim([[3, 1.25], [3.2, 3.85]]),
      tm([2.75, 0.95], L('every ball with your routine, change target and club, count', 'jeder Ball mit Routine, Ziel und Schläger wechseln, zählen')),
    ], FROM_ABOVE),
    'Only practising strengths': T(4, 4, [
      { k: 'fairway', x: 0, y: 0, w: 4, h: 4 },
      tt([0.2, 3.65], FAULT, 12, 'start'), tt([0.2, 1.8], RIGHT, 12, 'start'),
      { k: 'zone', x: 0.2, y: 2.85, w: 2.45, h: 0.45, label: L('driver 70 %', 'Driver 70 %') },
      { k: 'zone', x: 2.7, y: 2.85, w: 0.7, h: 0.45, label: L('irons', 'Eisen') },
      { k: 'zone', x: 3.45, y: 2.85, w: 0.35, h: 0.45 },
      tm([3.62, 2.65], L('every time the driver, never putting – it is more fun', 'jedes Mal Driver, nie Putten – es macht mehr Spaß')),
      { k: 'zone', x: 0.2, y: 0.9, w: 1.3, h: 0.45, label: L('putting', 'Putten') },
      { k: 'zone', x: 1.55, y: 0.9, w: 1.1, h: 0.45, label: L('short game', 'Kurzes Spiel') },
      { k: 'zone', x: 2.7, y: 0.9, w: 0.65, h: 0.45, label: L('irons', 'Eisen') },
      { k: 'zone', x: 3.4, y: 0.9, w: 0.4, h: 0.45, label: 'D' },
      tm([0.85, 0.7], L('time split by your statistics – the plan from your rounds', 'die Zeit nach deiner Statistik aufteilen – der Plan aus deinen Runden')),
    ], L('How the practice time is split.', 'Wie die Übungszeit aufgeteilt ist.')),
  },
};
