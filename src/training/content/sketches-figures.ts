import { L, type CategoryId, type P, type SideItem, type Sketch } from '../types';
import type { GolferOptions, JointName } from '../Golfer';
import { SKETCHES } from './sketches';

// The sketches with a golfer, drawn again (night run 16./17.10.2026 – Sascha: "the drawings do not show the details
// the text describes"). Every sketch shows the position the text asks for and points at the detail that matters
// (callouts on the joint: the trail heel, the hands, the lead hip …). Scenes in metres, the golfer is 1.75 m tall,
// the ground at y = 0.2. These replace the older sketches of the same drills and sections.

const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
const G0 = 0.2;
const ground = (w: number, sand = false): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]], sand });
const slope = (w: number, y0: number, y1: number, sand = false): SideItem => ({ k: 'ground', pts: [[0, y0], [w, y1]], sand });
const fig = (x: number, pose: GolferOptions['pose'], o: Omit<GolferOptions, 'pose'> & { tilt?: number; y?: number } = {}): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], pose, ...o });
const co = (on: JointName, t: L, at: P, figIndex?: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
const ball = (x: number, y = G0): SideItem => ({ k: 'ball', at: [x, y] });
const txt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });
const line = (from: P, to: P, dashed = false): SideItem => ({ k: 'line', from, to, dashed });

/** the triangle of arms and shoulders that moves as one (dashed), for a face-on figure at x */
const triangle = (x: number, sh: number, hands: [number, number]): SideItem[] => [
  line([x - 0.17, G0 + sh], [x + 0.17, G0 + sh], true),
  line([x + 0.17, G0 + sh], [x + hands[0], G0 + hands[1]], true),
  line([x - 0.17, G0 + sh], [x + hands[0], G0 + hands[1]], true),
];

export const FIGURE_SKETCHES: Record<string, Sketch> = {
  // ---------- putting ----------
  'chalk-line': S(3, 2.2, [
    ground(3),
    fig(1.0, 'puttSide'),
    ball(1.38),
    line([1.36, 1.43], [1.38, 0.3], true),
    { k: 'line', from: [1.345, 0.33], to: [1.415, 0.33] },
    { k: 'line', from: [1.345, 0.335], to: [1.415, 0.335] },
    txt([1.5, 0.36], L('string 10 cm above the green', 'Schnur 10 cm über dem Grün'), 10, 'start'),
    co('head', L('eyes right over the string and the ball', 'Augen genau über Schnur und Ball'), [2.2, 1.9]),
    co('hands', L('arms hang loosely', 'Arme hängen locker'), [2.2, 1.1]),
  ], L('From the side: eyes, string and ball on one line. Then watch the putter head run along the string.', 'Von der Seite: Augen, Schnur und Ball auf einer Linie. Dann beobachten, wie der Putterkopf an der Schnur entlang läuft.')),
  'one-hand': S(4, 2.3, [
    ground(4),
    fig(1.9, 'putt', { oneHand: true }),
    ball(2.0),
    co('hands', L('lead hand only – back of the hand to the target, the wrist does not bend', 'nur die Führhand – Handrücken zum Ziel, das Handgelenk knickt nicht ab'), [3.0, 1.3]),
    co('trailElbow', L('the other hand stays off the club', 'die andere Hand bleibt weg vom Schläger'), [0.8, 1.6]),
  ], L('Straight putts of 1–2 m: 10 with the lead hand, 10 with the trail hand, then 10 with both.', 'Gerade Putts aus 1–2 m: 10 mit der Führhand, 10 mit der hinteren Hand, dann 10 mit beiden.')),
  // ---------- chipping ----------
  'trail-toe': S(4, 2.4, [
    ground(4),
    fig(1.9, 'chip', { heelUp: 'trail', shift: 0.05 }),
    ball(1.86),
    co('trailHeel', L('trail heel up – only the toes touch', 'hintere Ferse hoch – nur die Zehen am Boden'), [0.95, 0.75]),
    co('pelvis', L('weight forward (about 70 %)', 'Gewicht vorn (etwa 70 %)'), [3.1, 1.35]),
    arrow([2.25, 1.75], [2.75, 1.75]),
  ], L('Face-on, target to the right: the trail foot only on the toes – the weight cannot fall back.', 'Von vorn, Ziel rechts: der hintere Fuß nur auf den Zehen – das Gewicht kann nicht nach hinten.')),
  'stick-lead-arm': S(4, 2.6, [
    ground(4),
    fig(1.9, 'chip', { gripStick: true, shift: 0.03 }),
    ball(1.86),
    co('leadHip', L('the stick passes the lead hip', 'der Stab läuft an der vorderen Hüfte vorbei'), [3.0, 1.55]),
    co('hands', L('wrists stay firm', 'Handgelenke bleiben fest'), [0.8, 1.2]),
  ], L('After impact the stick must not touch the lead side – the body turns through with the arms.', 'Nach dem Treffmoment darf der Stab die vordere Seite nicht berühren – der Körper dreht mit den Armen durch.')),
  'lead-hand-chip': S(4, 2.4, [
    ground(4),
    fig(1.9, 'chipFinish', { oneHand: true }),
    co('hands', L('lead hand only – back of the hand to the target', 'nur die vordere Hand – Handrücken zum Ziel'), [3.0, 1.45]),
    co('trailElbow', L('trail hand on the chest', 'hintere Hand auf der Brust'), [0.75, 1.6]),
  ]),
  'hold-finish-chip': S(4, 2.4, [
    ground(4),
    fig(1.9, 'chipFinish'),
    co('clubHead', L('hold 2 s – clubface to the sky', '2 s halten – Schlagfläche zum Himmel'), [3.2, 1.1]),
    txt([0.9, 0.55], L('back: short', 'zurück: kurz'), 11),
    arrow([1.3, 0.45], [1.05, 0.45]),
    txt([3.0, 0.45], L('through: twice as long', 'durch: doppelt so lang'), 11),
  ]),
  // ---------- pitching ----------
  'nine-to-three': S(5, 2.8, [
    ground(5),
    fig(1.4, 'halfBack'),
    fig(3.6, 'halfThrough'),
    co('hands', L('9 o’clock: lead arm parallel', '9 Uhr: vorderer Arm parallel'), [0.5, 2.45], 0),
    co('hands', L('3 o’clock: trail arm parallel', '3 Uhr: hinterer Arm parallel'), [4.6, 2.45], 1),
    co('pelvis', L('chest and belt buckle to the target', 'Brust und Gürtelschnalle zum Ziel'), [4.7, 0.65], 1),
  ], L('Back to 9, through to 3 – the same length both ways, the same rhythm.', 'Zurück bis 9, durch bis 3 – beide Seiten gleich lang, gleicher Rhythmus.')),
  'feet-together-pitch': S(4, 2.6, [
    ground(4),
    fig(1.9, 'halfThrough', { stance: 'together' }),
    co('leadAnkle', L('feet touching', 'Füße berühren sich'), [3.1, 0.55]),
    co('head', L('hold the finish until the ball lands', 'Finish halten, bis der Ball landet'), [0.6, 2.1]),
  ]),
  'towel-arms': S(4, 2.6, [
    ground(4),
    fig(1.9, 'halfBack', { towel: true }),
    co('leadShoulder', L('towel under both armpits – it must not fall', 'Handtuch unter beiden Achseln – darf nicht fallen'), [3.0, 2.15]),
  ], L('Arms and chest turn together – a falling towel shows arms swinging away from the body.', 'Arme und Brust drehen zusammen – fällt das Handtuch, schwingen die Arme vom Körper weg.')),
  // ---------- bunker ----------
  'sand-on-face': S(4, 2.8, [
    ground(4, true),
    fig(1.9, 'halfBack'),
    co('clubHead', L('a little sand on the open face – it stays there', 'etwas Sand auf der offenen Fläche – er bleibt liegen'), [3.0, 2.3]),
    co('trailShoulder', L('slowly back over the trail shoulder', 'langsam zurück über die hintere Schulter'), [0.6, 1.6]),
  ], L('Only when the sand stays on the face is the face open and the swing smooth.', 'Nur wenn der Sand liegen bleibt, ist die Fläche offen und der Schwung ruhig.')),
  'one-foot-bunker': S(4, 2.4, [
    ground(4, true),
    fig(1.9, 'front', { club: 'wedge', heelUp: 'trail', shift: 0.06 }),
    ball(1.88),
    co('trailHeel', L('trail foot back, on the toes', 'hinterer Fuß zurück, auf den Zehen'), [0.9, 0.8]),
    co('leadKnee', L('most weight on the lead foot', 'das meiste Gewicht vorn'), [3.1, 1.0]),
  ]),
  'bunker-slopes': S(6, 3.2, [
    slope(6, 0.2, 1.0, true),
    fig(2.0, 'front', { club: 'wedge', tilt: 7.6, y: 0.47 }),
    ball(2.0, 0.47),
    co('leadShoulder', L('uphill: shoulders parallel to the slope', 'bergauf: Schultern parallel zum Hang'), [3.6, 2.6]),
    { k: 'flight', pts: [[2.05, 0.5], [2.8, 2.4], [3.6, 1.0]], dashed: true },
    co('trailAnkle', L('weight on the lower foot', 'Gewicht auf dem tieferen Fuß'), [0.8, 1.0]),
  ], L('Uphill the ball flies high and short – swing harder. Downhill: shoulders with the slope too, the ball comes out low.', 'Bergauf fliegt der Ball hoch und kurz – kräftiger schwingen. Bergab: Schultern ebenfalls mit dem Hang, der Ball kommt flach.')),
  'fairway-bunker': S(5, 2.6, [
    ground(5, true),
    fig(1.8, 'impact', { club: 'iron' }),
    ball(1.8),
    co('trailAnkle', L('feet only slightly dug in, quiet legs', 'Füße nur leicht eingraben, ruhige Beine'), [0.7, 0.7]),
    co('clubHead', L('ball first, then a little sand', 'erst der Ball, dann etwas Sand'), [3.3, 0.6]),
    co('hands', L('grip 2 cm down', '2 cm kürzer greifen'), [3.2, 1.25]),
  ]),
  // ---------- slopes ----------
  'brush-find': S(6, 2.8, [
    slope(6, 0.2, 1.2),
    fig(2.2, 'front', { tilt: 9.5, y: 0.57 }),
    ball(2.25, 0.57),
    co('clubHead', L('the ball goes where the club brushes the grass', 'Ball dorthin, wo der Schläger das Gras streift'), [3.7, 0.55]),
    txt([4.7, 2.3], L('uphill: usually further forward', 'bergauf: meist weiter vorn'), 10),
  ]),
  'hold-finish-slope': S(6, 2.8, [
    slope(6, 0.9, 0.2),
    fig(2.2, 'frontFinish', { tilt: -6.7, y: 0.64 }),
    co('trailToe', L('no step – hold until the ball lands', 'kein Schritt – halten, bis der Ball landet'), [3.8, 1.2]),
  ]),
  'below-feet-stay': S(5, 2.8, [
    slope(5, 0.6, 0.0),
    fig(1.6, 'address', { crouch: true, tilt: -7, y: 0.42 }),
    ball(2.35, 0.32),
    co('leadKnee', L('more knee flex – like sitting on a high stool', 'mehr Kniebeuge – wie auf einem hohen Hocker'), [3.0, 1.0]),
    co('head', L('stay at this height until the ball is gone', 'diese Höhe halten, bis der Ball weg ist'), [3.2, 2.3]),
  ], L('Ball below the feet: from the side, the player looks at the ball down the slope.', 'Ball unter den Füßen: von der Seite, der Spieler schaut hangabwärts zum Ball.')),
  'slope-home-balance': S(4, 2.4, [
    ground(4),
    { k: 'line', from: [1.92, 0.2], to: [1.92, 0.32] },
    { k: 'line', from: [1.92, 0.32], to: [2.3, 0.32] },
    { k: 'line', from: [2.3, 0.32], to: [2.3, 0.2] },
    fig(1.9, 'front', { tilt: 6, y: 0.24 }),
    co('leadAnkle', L('lead foot on a thick book – a slope at home', 'vorderer Fuß auf einem dicken Buch – ein Hang zu Hause'), [3.0, 0.8]),
    txt([2.0, 2.2], L('half swings, hold each finish 3 s', 'halbe Schwünge, jedes Finish 3 s halten'), 10),
  ]),
  'slope-ball-position': S(6, 2.8, [
    slope(6, 0.2, 1.0),
    fig(2.3, 'front', { tilt: 7.6, y: 0.5 }),
    ball(2.05, 0.47),
    ball(2.3, 0.51),
    ball(2.55, 0.54),
    txt([1.75, 0.62], L('back', 'hinten'), 10, 'end'),
    txt([2.85, 0.84], L('forward', 'vorn'), 10, 'start'),
  ], L('Three balls: back, middle, forward – where does the club brush the grass? Uphill usually forward, downhill usually back.', 'Drei Bälle: hinten, Mitte, vorn – wo streift der Schläger das Gras? Bergauf meist vorn, bergab meist hinten.')),
  'feet-feel': S(5, 2.6, [
    slope(5, 0.55, 0.2),
    fig(2.5, 'stand', { tilt: -4, y: 0.37 }),
    co('trailAnkle', L('more pressure on the lower foot', 'mehr Druck auf dem tieferen Fuß'), [3.9, 0.95]),
    txt([2.5, 2.3], L('across the line, eyes closed', 'quer zur Linie, Augen zu'), 10),
  ]),
  // ---------- irons ----------
  'step-drill': S(5, 2.8, [
    ground(5),
    fig(1.9, 'halfBack', { stance: 'together', club: 'iron' }),
    co('leadAnkle', L('while swinging back: step to the target', 'beim Ausholen: Schritt zum Ziel'), [3.3, 0.75]),
    arrow([2.05, 0.35], [2.55, 0.35]),
  ], L('Feet together at address. Plant the foot first – then swing down: the weight moves forward by itself.', 'Ansprache mit geschlossenen Füßen. Erst den Fuß aufsetzen – dann abschwingen: das Gewicht kommt von selbst nach vorn.')),
  'impact-bag': S(4, 2.6, [
    ground(4),
    { k: 'line', from: [1.82, 0.2], to: [1.82, 0.5] },
    { k: 'line', from: [1.82, 0.5], to: [2.2, 0.5] },
    { k: 'line', from: [2.2, 0.5], to: [2.2, 0.2] },
    fig(1.85, 'impact'),
    co('hands', L('hands ahead of the clubhead', 'Hände vor dem Schlägerkopf'), [3.0, 1.35]),
    co('leadHip', L('belt buckle to the bag or further', 'Gürtelschnalle zum Sack oder weiter'), [3.1, 1.9]),
    co('leadAnkle', L('weight on the lead foot', 'Gewicht auf dem vorderen Fuß'), [3.0, 0.7]),
    txt([2.28, 0.3], L('bag', 'Sack'), 10, 'start'),
  ]),
  'lead-arm-only': S(4, 2.6, [
    ground(4),
    fig(1.9, 'halfThrough', { oneHand: true, club: 'iron' }),
    co('hands', L('lead arm only – wrist flat at impact', 'nur der vordere Arm – Handgelenk gerade im Treffmoment'), [3.0, 2.15]),
    co('trailElbow', L('trail hand on the chest', 'hintere Hand auf der Brust'), [0.8, 1.7]),
  ]),
  // ---------- woods / driver ----------
  'brush-five': S(5, 2.6, [
    ground(5),
    fig(2.0, 'impact', { club: 'iron' }),
    co('clubHead', L('brush the grass 5×, same spot – “swish”', '5× das Gras an derselben Stelle streifen – „Wusch“'), [3.4, 0.6]),
    ball(3.9),
    txt([3.9, 0.45], L('then the ball', 'dann der Ball'), 10),
  ]),
  'driver-80': S(4, 2.8, [
    ground(4),
    fig(1.9, 'frontFinish', { club: 'driver' }),
    co('hands', L('80 % – grip 2 cm down', '80 % – 2 cm kürzer greifen'), [0.6, 2.2]),
    co('leadAnkle', L('hold the finish on the lead foot', 'Finish auf dem vorderen Fuß halten'), [3.0, 0.7]),
  ]),
  'speed-training': S(4, 2.8, [
    ground(4),
    fig(1.9, 'frontTop', { club: 'driver' }),
    co('clubHead', L('light · medium · heavy – as fast as you can', 'leicht · mittel · schwer – so schnell du kannst'), [3.0, 2.55]),
    co('leadAnkle', L('push off the ground at the start of the downswing', 'zu Beginn des Abschwungs vom Boden abdrücken'), [3.0, 0.6]),
  ], L('Also swing from the other side – that keeps the body balanced.', 'Auch von der anderen Seite schwingen – das hält den Körper im Gleichgewicht.')),
  'driver-wide-stance': S(5, 2.8, [
    ground(5),
    fig(1.4, 'frontTop', { club: 'driver', stance: 'wide' }),
    fig(3.7, 'frontFinish', { club: 'driver' }),
    co('trailKnee', L('trail knee stays flexed', 'hinteres Knie bleibt gebeugt'), [0.5, 0.8], 0),
    co('pelvis', L('belt buckle to the target, 3 s', 'Gürtelschnalle zum Ziel, 3 s'), [4.6, 1.2], 1),
  ]),
  // ---------- basics ----------
  'posture-club-spine': S(3, 2.4, [
    ground(3),
    fig(1.1, 'address', { spineClub: true, club: 'none' }),
    co('head', L('back of the head', 'Hinterkopf'), [0.3, 2.15]),
    co('neck', L('upper back', 'oberer Rücken'), [0.25, 1.6]),
    co('pelvis', L('tailbone – all three stay on the club', 'Steißbein – alle drei bleiben am Schläger'), [0.2, 0.75]),
    co('leadKnee', L('knees slightly flexed', 'Knie leicht gebeugt'), [2.2, 0.75]),
  ], L('From the side: bend from the hips, not from the back.', 'Von der Seite: aus der Hüfte beugen, nicht aus dem Rücken.')),
  'mirror-setup-full': S(4, 2.6, [
    ground(4),
    fig(1.3, 'address'),
    ball(2.0),
    line([3.4, 0.2], [3.4, 2.4]),
    line([3.55, 0.2], [3.55, 2.4]),
    txt([3.47, 2.5], L('mirror', 'Spiegel'), 10),
    co('pelvis', L('hip bend', 'Hüftbeuge'), [0.35, 1.2]),
    co('hands', L('arms hang', 'Arme hängen'), [2.4, 1.35]),
    co('leadKnee', L('knees over the balls of the feet', 'Knie über den Fußballen'), [2.6, 0.75]),
  ]),
  'grip-pressure-ball': S(4, 2.6, [
    ground(4),
    fig(1.9, 'halfThrough', { club: 'iron' }),
    co('hands', L('grip pressure 4 of 10 – also in the finish', 'Griffdruck 4 von 10 – auch im Finish'), [3.0, 2.2]),
  ], L('Say “four” at address, at the top and in the finish – the pressure stays the same.', '„Vier“ sagen: beim Ansprechen, oben und im Finish – der Druck bleibt gleich.')),
  // ---------- swing ----------
  'tempo-321': S(5, 2.8, [
    ground(5),
    fig(1.4, 'frontTop'),
    fig(3.6, 'impact'),
    co('hands', L('“1 – 2 – 3” to the top', '„eins – zwei – drei“ bis oben'), [0.4, 2.45], 0),
    co('clubHead', L('“4” at impact', '„vier“ im Treffmoment'), [4.6, 0.6], 1),
    ball(3.6),
  ]),
  'pause-top': S(4, 2.8, [
    ground(4),
    fig(1.9, 'frontTop'),
    co('hands', L('stop 1 second at the top', '1 Sekunde oben anhalten'), [0.6, 2.45]),
    co('leadAnkle', L('start down with pressure into the lead foot', 'Abschwung mit Druck in den vorderen Fuß starten'), [3.1, 0.7]),
  ]),
  'hip-stick': S(4, 2.8, [
    ground(4),
    { k: 'line', from: [1.52, 0.2], to: [1.52, 1.3], stick: true },
    fig(1.9, 'halfBack', { club: 'iron' }),
    co('trailHip', L('the hip turns away from the stick – no touch', 'die Hüfte dreht vom Stab weg – keine Berührung'), [0.6, 0.9]),
    txt([1.47, 0.45], L('stick', 'Stab'), 10, 'end'),
  ], L('Face-on: the stick stands vertically just outside the trail hip. If the hip pushes into it, the hip sways instead of turning.', 'Von vorn: der Stab steht senkrecht knapp außerhalb der hinteren Hüfte. Drückt die Hüfte dagegen, schiebt sie seitlich statt zu drehen.')),
  'pump-drill': S(4, 2.8, [
    ground(4),
    fig(1.9, 'pump'),
    ball(1.9),
    co('hands', L('hands at hip height – twice back up', 'Hände auf Hüfthöhe – zweimal wieder hoch'), [0.6, 1.55]),
    txt([2.8, 2.3], L('the third time: through to the ball', 'beim dritten Mal durch zum Ball'), 10),
  ]),
  'feet-together-swing': S(4, 2.6, [
    ground(4),
    fig(1.9, 'frontFinish', { stance: 'together' }),
    co('leadAnkle', L('feet together – rushing makes you fall', 'Füße zusammen – wer hastet, fällt'), [3.0, 0.6]),
    co('head', L('hold the finish until the ball lands', 'Finish halten, bis der Ball landet'), [0.6, 2.15]),
  ]),
  'cross-arms-turn': S(4, 2.6, [
    ground(4),
    fig(1.9, 'stand', { crossClub: true }),
    co('leadShoulder', L('turn until the club points at the ball line (≈ 90°)', 'drehen, bis der Schläger auf die Balllinie zeigt (≈ 90°)'), [3.0, 2.2]),
    co('head', L('keep the head height', 'Kopfhöhe halten'), [0.6, 2.1]),
  ]),
  'slow-motion': S(8.2, 2.8, [
    ground(8.2),
    fig(0.6, 'front'),
    fig(2.3, 'takeaway'),
    fig(3.65, 'frontTop'),
    fig(4.95, 'pump'),
    fig(6.2, 'impact'),
    fig(7.5, 'frontFinish'),
    co('head', L('address', 'Ansprache'), [0.0, 2.4], 0),
    co('hands', L('9 o’clock up – shaft parallel', '9 Uhr auf – Schaft parallel'), [1.0, 2.4], 1),
    co('hands', L('top – flat wrist', 'Top – Handgelenk gerade'), [2.4, 2.4], 2),
    co('hands', L('9 o’clock down', '9 Uhr ab'), [3.6, 1.4], 3),
    co('hands', L('impact – hands ahead', 'Treffmoment – Hände vorn'), [6.2, 1.4], 4),
    co('head', L('finish – chest to the target', 'Finish – Brust zum Ziel'), [7.5, 2.4], 5),
  ], L('Hold each position for 3 seconds: shaft parallel at 9 o’clock, hands ahead at impact, chest to the target in the finish.', 'In jeder Position 3 Sekunden halten: Schaft parallel bei 9 Uhr, Hände vorn im Treffmoment, Brust zum Ziel im Finish.')),
  'l-to-l': S(5, 2.8, [
    ground(5),
    fig(1.4, 'halfBack'),
    fig(3.6, 'halfThrough'),
    co('clubHead', L('first “L”: lead arm and shaft', 'erstes „L“: vorderer Arm und Schaft'), [0.3, 2.55], 0),
    co('clubHead', L('second “L”: trail arm and shaft', 'zweites „L“: hinterer Arm und Schaft'), [4.7, 2.55], 1),
  ]),
  // ---------- ball flight ----------
  'split-grip': S(4, 2.8, [
    ground(4),
    fig(1.9, 'halfThrough', { club: 'iron' }),
    co('hands', L('hands 5–8 cm apart', 'Hände 5–8 cm auseinander'), [3.1, 2.2]),
    co('trailElbow', L('trail forearm crosses over the lead', 'hinterer Unterarm kreuzt über den vorderen'), [0.6, 1.85]),
    co('clubHead', L('toe points up at 3 o’clock', 'Spitze zeigt bei 3 Uhr nach oben'), [3.3, 2.6]),
  ]),
  'hold-finish': S(4, 2.8, [
    ground(4),
    fig(1.9, 'frontFinish'),
    co('pelvis', L('chest and belt buckle to the target', 'Brust und Gürtelschnalle zum Ziel'), [3.1, 1.35]),
    co('trailToe', L('trail foot on the toe', 'hinterer Fuß auf der Spitze'), [0.7, 0.6]),
    txt([2.0, 2.55], L('hold 3 s – until the ball lands', '3 s halten – bis der Ball landet'), 11),
  ]),
  // ---------- mental ----------
  'visualise': S(8, 3.2, [
    ground(8),
    fig(0.8, 'stand', { club: 'none' }),
    { k: 'flight', pts: [[1.4, 0.3], [4.2, 2.8], [7.0, 0.3]], dashed: true },
    { k: 'flag', at: [7.2, 0.2] },
    co('head', L('behind the ball, eyes closed: see start, height, curve, landing', 'hinter dem Ball, Augen zu: Start, Höhe, Kurve, Landung sehen'), [2.0, 2.95]),
  ]),
  // ---------- fitness ----------
  'warmup-10': S(6.4, 2.6, [
    ground(6.4),
    fig(0.75, 'turn'),
    fig(2.3, 'turn', { crossClub: true }),
    fig(3.95, 'lunge'),
    fig(5.5, 'halfThrough', { club: 'iron' }),
    co('hands', L('arm circles – 10 forward, 10 back', 'Armkreisen – je 10 vor- und rückwärts'), [1.4, 2.4], 0),
    co('head', L('club behind the shoulders – 10 turns each way', 'Schläger hinter den Schultern – je 10 Drehungen'), [2.0, 2.4], 1),
    co('leadKnee', L('5 lunges per leg, turning to the front leg', '5 Ausfallschritte pro Bein, mit Drehung'), [4.6, 1.0], 2),
    co('hands', L('10 half swings, then 10 fast ones', '10 halbe Schwünge, dann 10 schnelle'), [6.3, 2.0], 3),
  ], L('Moving, not static stretching – 10 minutes.', 'Bewegen statt dehnen – 10 Minuten.')),
  'open-books': S(4, 1.6, [
    ground(4),
    fig(2.0, 'sidelying'),
    co('hands', L('open the top arm like a book, eyes follow', 'oberen Arm wie ein Buch öffnen, Blick folgt'), [3.0, 1.45]),
    co('leadKnee', L('knees stay together', 'Knie bleiben zusammen'), [3.4, 0.75]),
  ]),
  'seated-rotation': S(4, 2.6, [
    ground(4),
    { k: 'line', from: [1.55, 0.2], to: [1.55, 0.98] },
    { k: 'line', from: [1.55, 0.98], to: [2.2, 0.98] },
    { k: 'line', from: [2.2, 0.98], to: [2.2, 0.2] },
    fig(1.6, 'sit', { crossClub: true }),
    co('leadShoulder', L('turn the chest: 45° or more per side is good', 'Brust drehen: 45° oder mehr pro Seite ist gut'), [2.9, 2.2]),
    co('leadKnee', L('knees stay still', 'Knie bleiben ruhig'), [3.2, 1.3]),
  ]),
  'hip-9090': S(4, 1.8, [
    ground(4),
    fig(1.8, 'floorsit'),
    co('leadKnee', L('both knees 90°, swap sides without hands', 'beide Knie 90°, ohne Hände die Seite wechseln'), [3.0, 1.2]),
    co('head', L('sit tall', 'aufrecht sitzen'), [0.6, 1.55]),
  ]),
  'glute-bridge': S(4, 1.6, [
    ground(4),
    fig(2.0, 'bridge'),
    co('pelvis', L('lift until knees, hips and shoulders are one line', 'heben, bis Knie, Hüfte und Schultern eine Linie sind'), [2.0, 1.45]),
  ]),
  'pallof-press': S(5, 2.6, [
    ground(5),
    line([4.6, 0.2], [4.6, 2.3]),
    fig(2.0, 'stand'),
    line([2.15, 1.25], [4.6, 1.25], true),
    txt([3.6, 1.35], L('band', 'Band'), 10),
    co('hands', L('press forward and back – the body does not turn', 'nach vorn und zurück drücken – der Körper dreht nicht mit'), [3.4, 2.2]),
  ]),
  'med-ball-throw': S(5, 2.6, [
    ground(5),
    line([4.6, 0.2], [4.6, 2.4]),
    txt([4.6, 2.5], L('wall', 'Wand'), 10),
    fig(2.0, 'halfThrough', { club: 'none' }),
    { k: 'ball', at: [2.6, 1.3] },
    arrow([2.8, 1.3], [4.4, 1.3]),
    co('pelvis', L('hips first, push off the ground', 'Hüfte voran, vom Boden abdrücken'), [0.7, 1.0]),
  ]),
  'single-leg-balance': S(3, 2.6, [
    ground(3),
    fig(1.5, 'oneleg'),
    co('leadKnee', L('30 s eyes open · 10 s eyes closed', '30 s Augen offen · 10 s Augen zu'), [2.3, 1.4]),
  ]),
  'deep-squat': S(3, 2.4, [
    ground(3),
    fig(1.5, 'squat'),
    { k: 'line', from: [1.15, 1.71], to: [1.85, 1.71] },
    co('hands', L('club above the feet', 'Schläger über den Füßen'), [2.4, 2.1]),
    co('leadHeel', L('heels stay down', 'Fersen bleiben unten'), [2.5, 0.6]),
  ]),
  'wrist-forearm': S(4, 2.4, [
    ground(4),
    { k: 'line', from: [1.55, 0.2], to: [1.55, 0.98] },
    { k: 'line', from: [1.55, 0.98], to: [2.2, 0.98] },
    { k: 'line', from: [2.2, 0.98], to: [2.2, 0.2] },
    fig(1.6, 'sit', { club: 'none' }),
    co('hands', L('forearm on the thigh: weight 15× up, 15× down', 'Unterarm auf dem Oberschenkel: Gewicht 15× heben, 15× senken'), [2.9, 1.9]),
  ]),
};

/** Sections with a golfer, by topic and the English section title. */
export const SECTION_FIGURE_SKETCHES: Partial<Record<CategoryId, Record<string, Sketch>>> = {
  chipping: {
    'The stroke': S(5, 2.4, [
      ground(5),
      fig(1.4, 'chip', { shift: 0.04 }),
      ball(1.36),
      fig(3.6, 'chipFinish'),
      co('clubHead', L('the club brushes the grass under the ball – no scooping', 'der Schlägerkopf streift das Gras unter dem Ball – nicht schaufeln'), [0.4, 0.8], 0),
      co('hands', L('the grip leads, lead wrist flat', 'der Griff führt, vorderes Handgelenk gerade'), [4.6, 1.5], 1),
    ], L('A putting stroke with loft: the shoulders rock, back and through about the same length.', 'Eine Puttbewegung mit Loft: die Schultern schaukeln, zurück und durch etwa gleich lang.')),
    'The set-up': S(4, 2.4, [
      ground(4),
      fig(1.9, 'chip', { shift: 0.04 }),
      ball(1.86),
      co('trailAnkle', L('narrow stance, ball back of centre', 'schmaler Stand, Ball hinter der Mitte'), [0.7, 0.75]),
      co('hands', L('hands ahead of the ball', 'Hände vor dem Ball'), [3.1, 1.15]),
      co('pelvis', L('60–70 % weight on the lead foot', '60–70 % Gewicht vorn'), [3.1, 1.75]),
    ], L('Face-on, target to the right.', 'Von vorn, Ziel rechts.')),
  },
  putting: {
    'Set-up': S(3, 2.2, [
      ground(3),
      fig(1.0, 'puttSide'),
      ball(1.37),
      line([1.36, 1.43], [1.37, 0.3], true),
      co('head', L('eyes over the ball or slightly inside', 'Augen über dem Ball oder leicht innerhalb'), [2.2, 1.9]),
      co('hands', L('light grip pressure, about 3–4 of 10', 'leichter Griffdruck, etwa 3–4 von 10'), [2.2, 1.0]),
    ], L('From the side. Ball slightly ahead of centre, shoulders parallel to the start line; aim the face first, then build the stance.', 'Von der Seite. Ball etwas vor der Mitte, Schultern parallel zur Startlinie; erst die Fläche ausrichten, dann den Stand aufbauen.')),
    'The stroke': S(4, 2.3, [
      ground(4),
      fig(2.0, 'putt'),
      ...triangle(2.0, 1.32, [0, 0.8]),
      arrow([1.92, 0.36], [1.6, 0.36]),
      arrow([2.08, 0.36], [2.45, 0.36]),
      co('leadShoulder', L('the shoulders move the putter – arms and shoulders as one triangle', 'die Schultern bewegen den Putter – Arme und Schultern als ein Dreieck'), [3.2, 1.8]),
      co('hands', L('hands stay passive', 'Hände bleiben passiv'), [0.8, 1.0]),
    ], L('A pendulum: a gentle arc, square at impact – and through the ball it accelerates gently, never slowing down.', 'Ein Pendel: ein sanfter Bogen, square im Treffmoment – und durch den Ball sanft beschleunigen, nie abbremsen.')),
    'Short putts (under 2 m)': S(5, 2.3, [
      ground(5),
      fig(1.6, 'putt'),
      ball(1.62),
      arrow([1.85, 0.27], [3.75, 0.27]),
      { k: 'flag', at: [4.0, 0.2] },
      co('head', L('head and eyes still until the ball is gone – listen for it to drop', 'Kopf und Augen ruhig, bis der Ball weg ist – „hör“ ihn fallen'), [0.5, 2.0]),
    ], L('A firm pace and little break: aim inside the edge, the ball should hit the back of the cup.', 'Festes Tempo, wenig Break: innerhalb der Lochkante zielen, der Ball soll an die hintere Lochwand.')),
  },
  pitching: {
    'The motion': S(5, 2.8, [
      ground(5),
      fig(1.4, 'halfBack'),
      fig(3.6, 'halfThrough'),
      co('hands', L('the wrists hinge naturally', 'die Handgelenke winkeln natürlich an'), [0.4, 2.0], 0),
      co('pelvis', L('chest to the target, weight forward – hold', 'Brust zum Ziel, Gewicht vorn – halten'), [4.7, 0.9], 1),
    ], L('The body turns back and through, the arms stay in front of the chest. Ball first, then a shallow divot.', 'Der Körper dreht zurück und durch, die Arme bleiben vor der Brust. Erst der Ball, dann ein flaches Divot.')),
    'Lob and flop': S(4, 2.6, [
      ground(4),
      fig(1.9, 'front', { club: 'wedge', stance: 'wide' }),
      ball(2.08),
      co('clubHead', L('open the face first, then take your grip', 'erst die Fläche öffnen, dann greifen'), [3.1, 0.75]),
      co('trailAnkle', L('wider stance, ball forward', 'breiterer Stand, Ball vorn'), [0.7, 0.8]),
    ], L('Swing with pace along your body line – the bounce (the rounded sole) slides under the ball.', 'Mit Tempo entlang der Körperlinie schwingen – das Bounce (die gerundete Sohle) gleitet unter den Ball.')),
    'The clock system': S(4, 2.8, [
      ground(4),
      fig(1.9, 'halfBack'),
      co('hands', L('lead arm as the hour hand: 9:00 = parallel', 'vorderer Arm als Stundenzeiger: 9:00 = parallel'), [3.0, 2.45]),
      txt([0.6, 2.0], '10:30', 11),
      txt([0.3, 1.25], '9:00', 11),
      txt([0.55, 0.55], '7:30', 11),
    ], L('Three swing lengths per wedge, the same rhythm.', 'Drei Schwunglängen je Wedge, gleicher Rhythmus.')),
  },
  swing: {
    'Takeaway and backswing': S(5, 2.8, [
      ground(5),
      fig(1.6, 'takeaway'),
      fig(3.8, 'frontTop'),
      co('clubHead', L('9 o’clock: shaft parallel, toe up', '9 Uhr: Schaft parallel, Spitze zeigt nach oben'), [0.3, 2.0], 0),
      co('hands', L('top: lead wrist flat', 'oben: vorderes Handgelenk gerade'), [2.6, 2.5], 1),
      co('trailKnee', L('weight on the inside of the trail foot', 'Gewicht auf der Innenseite des hinteren Fußes'), [2.6, 0.8], 1),
    ], L('Club, hands, arms and chest start away together – in one piece.', 'Schläger, Hände, Arme und Brust starten gemeinsam – „aus einem Guss“.')),
    'Impact and finish': S(5, 2.8, [
      ground(5),
      fig(1.4, 'impact'),
      ball(1.4),
      fig(3.6, 'frontFinish'),
      co('hands', L('impact: hands lead the clubhead, hips open', 'Treffmoment: Hände führen den Schlägerkopf, Hüfte geöffnet'), [2.4, 1.3], 0),
      co('leadAnkle', L('weight mostly on the lead foot', 'Gewicht überwiegend vorn'), [2.4, 0.6], 0),
      co('pelvis', L('finish: chest to the target', 'Finish: Brust zum Ziel'), [4.7, 1.3], 1),
      co('trailToe', L('trail foot on the toe – hold 3 s', 'hinterer Fuß auf der Spitze – 3 s halten'), [2.8, 0.5], 1),
    ]),
  },
  driver: {
    'Set-up for the driver': S(4, 2.6, [
      ground(4),
      fig(1.9, 'front', { club: 'driver', stance: 'wide' }),
      { k: 'line', from: [2.04, 0.2], to: [2.04, 0.25] },
      ball(2.04, 0.25),
      co('clubHead', L('ball opposite the lead heel, teed up', 'Ball gegenüber der vorderen Ferse, aufgeteet'), [3.2, 0.75]),
      co('trailShoulder', L('trail shoulder lower – spine tilted away from the target', 'hintere Schulter tiefer – Wirbelsäule vom Ziel weg geneigt'), [0.45, 2.2]),
      co('trailAnkle', L('stance wider than the shoulders', 'Stand breiter als die Schultern'), [0.6, 0.8]),
    ]),
  },
  basics: {
    'Ball position': SKETCHES['ball-position-ladder'],
    Posture: S(3, 2.4, [
      ground(3),
      fig(1.1, 'address'),
      ball(1.8),
      co('pelvis', L('bend from the hips, back straight', 'aus der Hüfte beugen, Rücken gerade'), [0.2, 1.25]),
      co('hands', L('arms hang loosely', 'Arme hängen locker'), [2.3, 1.35]),
      co('leadKnee', L('knees slightly flexed', 'Knie leicht gebeugt'), [2.3, 0.7]),
    ], L('From the side, the ball to the right.', 'Von der Seite, der Ball rechts.')),
  },
};
