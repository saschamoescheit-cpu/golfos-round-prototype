import { L, type CategoryId, type LieChart, type P, type TopicShot, type SideItem, type Sketch, type SketchItem } from '../types';
import type { GolferOptions, JointName } from '../Golfer';
import { FIGURE_SKETCHES } from './sketches-figures';

// The topics rebuilt as shots (Sascha 15.11.2026): "Chip-Pitch: standard chip/pitch, slopes uphill/downhill, ball
// below/above the feet, bad lies: bare patch (club choice, ball position), deep in the grass … How do ball position
// and club choice change with the lie and the height of the grass?" Every shot has the tabs Set-up, Motion, What to
// watch and Practise, every tab with a picture. Values are the common teaching standard – our pro checks them in
// "Review the content". Pictures: face-on = target to the right (right-hander), the golfer 1.75 m, ground at y = 0.2.

const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
const T = (w: number, h: number, items: SketchItem[], caption?: L): Sketch => ({ view: 'top', w, h, items, caption });
const G0 = 0.2;
const ground = (w: number): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]] });
/** a slope from y0 (left) to y1 (right); at(x) is the height of the ground at x */
const hill = (w: number, y0: number, y1: number) => ({ item: { k: 'ground', pts: [[0, y0], [w, y1]] } as SideItem, at: (x: number) => y0 + ((y1 - y0) * x) / w, deg: (Math.atan((y1 - y0) / w) * 180) / Math.PI });
const fig = (x: number, pose: GolferOptions['pose'], o: Omit<GolferOptions, 'pose'> & { tilt?: number; y?: number } = {}): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], pose, ...o });
const co = (on: JointName, t: L, at: P, figIndex?: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
const ball = (x: number, y = G0): SideItem => ({ k: 'ball', at: [x, y] });
const txt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });
const flight = (pts: P[]): SideItem => ({ k: 'flight', pts, dashed: true });

// ---------- chipping ----------

const up = hill(4, 0.2, 0.9); // the ground rises to the target
const down = hill(4, 0.9, 0.2); // the ground falls to the target
const aboveFeet = hill(5, 0.0, 0.55); // from the side: the ground rises to the ball
const belowFeet = hill(5, 0.6, 0.0); // from the side: the ground falls to the ball

/** the line of the ground through a flight: where it lands and how far it rolls */
const landRoll = (w: number, from: number, land: number, end: number, top: number, at: (x: number) => number, labels: [L, L]): SideItem[] => [
  ball(from, at(from)),
  flight([[from, at(from) + 0.05], [(from + land) / 2, at((from + land) / 2) + top], [land, at(land) + 0.04]]),
  arrow([land, at(land) + 0.06], [end, at(end) + 0.06]),
  txt([(from + land) / 2, at((from + land) / 2) + top + 0.22], labels[0], 11),
  txt([(land + end) / 2, at((land + end) / 2) + 0.28], labels[1], 11),
  { k: 'flag', at: [Math.min(w - 0.2, end + 0.3), at(Math.min(w - 0.2, end + 0.3))] },
];

export const CHIP_LIES: LieChart = {
  title: L('Lie and grass → ball position and club', 'Lage und Gras → Ballposition und Schläger'),
  rows: [
    { lie: 'short', name: L('Fairway or fringe – short grass', 'Fairway oder Vorgrün – kurzes Gras'), ball: -0.15, club: L('PW to 7-iron, by carry : roll', 'PW bis Eisen 7, nach Flug : Rollen'), note: L('The standard chip: short carry, long roll.', 'Der Standard-Chip: kurz fliegen, lang rollen.') },
    { lie: 'up', name: L('Rough – the ball sits up', 'Rough – der Ball sitzt oben'), ball: 0, club: L('PW or SW', 'PW oder SW'), note: L('Hover the club, do not ground it – grass between face and ball: little spin, more roll.', 'Schläger schweben lassen, nicht aufsetzen – Gras zwischen Fläche und Ball: wenig Spin, mehr Rollen.') },
    { lie: 'down', name: L('Rough – the ball sits down', 'Rough – der Ball sitzt tief'), ball: -0.3, club: L('SW or LW', 'SW oder LW'), note: L('Steeper, firmer grip, face a little open – the grass closes it.', 'Steiler, fester greifen, Fläche leicht offen – das Gras schließt sie.') },
    { lie: 'collar', name: L('Against the collar of the rough', 'An der Rough-Kante'), ball: 0, club: L('Hybrid, or the leading edge of a wedge', 'Hybrid oder Vorderkante eines Wedges'), note: L('A putting stroke: the hybrid glides through the grass, the wedge hits the ball at its equator.', 'Eine Puttbewegung: Der Hybrid gleitet durchs Gras, das Wedge trifft den Ball am Äquator.') },
    { lie: 'bare', name: L('Bare patch or hard ground', 'Kahlstelle oder harter Boden'), ball: -0.45, club: L('PW or 9-iron – little bounce', 'PW oder Eisen 9 – wenig Bounce'), note: L('Ball first, hands ahead. No lob wedge: its sole bounces off the ground.', 'Erst der Ball, Hände vorn. Kein Lobwedge: Seine Sohle springt vom Boden ab.') },
  ],
  caption: L('Right-hander: the trail foot is the right foot. The worse the lie, the further back the ball and the steeper the stroke.', 'Rechtshänder: Der hintere Fuß ist der rechte. Je schlechter die Lage, desto weiter hinten der Ball und desto steiler der Schlag.'),
};

const CHIP_SHOTS: TopicShot[] = [
  {
    id: 'chip-standard',
    name: L('The standard chip', 'Der Standard-Chip'),
    short: L('From the fringe or short grass next to the green: a short carry, a long roll.', 'Vom Vorgrün oder kurzen Gras neben dem Grün: kurz fliegen, lang rollen.'),
    setup: {
      section: 'The set-up',
      rows: [
        { k: 'ball', v: L('Middle or slightly back (towards the trail foot)', 'Mitte oder leicht zurück (Richtung hinterer Fuß)') },
        { k: 'stance', v: L('Narrow (a hand width), slightly open, close to the ball', 'Schmal (eine Handbreite), leicht offen, nah am Ball') },
        { k: 'weight', v: L('60–70 % on the lead foot – and it stays there', '60–70 % auf dem vorderen Fuß – und es bleibt dort') },
        { k: 'grip', v: L('A little down the grip, hands slightly ahead of the ball', 'Etwas kürzer greifen, Hände leicht vor dem Ball') },
        { k: 'club', v: L('By carry : roll – SW 1:1, PW 1:2, 9-iron 1:3, 7-iron 1:5', 'Nach Flug : Rollen – SW 1:1, PW 1:2, Eisen 9 1:3, Eisen 7 1:5') },
      ],
    },
    move: {
      section: 'The stroke',
      text: [
        L(
          'A putting stroke with a lofted club: the shoulders rock, arms and club move together, the wrists stay quiet. The club brushes the grass under the ball – the loft lifts the ball, you never help it up. Back and through about the same length, accelerating gently.',
          'Eine Puttbewegung mit einem Schläger mit Loft: Die Schultern schaukeln, Arme und Schläger bewegen sich zusammen, die Handgelenke bleiben ruhig. Der Schläger streift das Gras unter dem Ball – der Loft hebt den Ball, du hilfst nie nach. Zurück und durch etwa gleich lang, sanft beschleunigen.',
        ),
      ],
    },
    watch: {
      section: 'Landing spot and club choice',
      points: [
        L('Pick the landing spot first – about 1 m onto the green, where it is even – then the club whose roll fits.', 'Erst den Landepunkt wählen – etwa 1 m aufs Grün, wo es eben ist –, dann den Schläger, dessen Rollen passt.'),
        L('One motion, several clubs: the length comes from the club, not from a harder stroke.', 'Eine Bewegung, mehrere Schläger: Die Länge kommt vom Schläger, nicht von einem härteren Schlag.'),
        L('The grip leads, the lead wrist stays flat – no scooping.', 'Der Griff führt, das vordere Handgelenk bleibt gerade – nicht schaufeln.'),
      ],
    },
    drills: ['landing-ring', 'trail-toe', 'stick-lead-arm', 'chip-line', 'three-clubs-one-spot', 'chip-ladder'],
    videos: ['glV5Y8ZR4XY', 'nQ3FtVyBfCI'],
  },
  {
    id: 'chip-uphill',
    name: L('Chip uphill', 'Chip bergauf'),
    short: L('The ball lies on a slope that rises to the green.', 'Der Ball liegt am Hang, der zum Grün ansteigt.'),
    setup: {
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope, stance a little wider', 'Schultern parallel zum Hang, Stand etwas breiter') },
        { k: 'weight', v: L('More on the lower trail foot – go with the slope', 'Mehr auf dem tieferen hinteren Fuß – mit dem Hang') },
        { k: 'ball', v: L('Middle to slightly forward', 'Mitte bis leicht vorn') },
        { k: 'club', v: L('Less loft (e.g. 9-iron instead of PW) – the slope adds loft', 'Weniger Loft (z. B. Eisen 9 statt PW) – der Hang gibt Loft dazu') },
      ],
      sketch: S(4, 2.9, [
        up.item,
        fig(1.9, 'chip', { tilt: up.deg, y: up.at(1.9), shift: -0.05 }),
        ball(1.88, up.at(1.88)),
        co('leadShoulder', L('shoulders parallel to the slope', 'Schultern parallel zum Hang'), [3.1, 2.25]),
        co('trailAnkle', L('weight more on the lower foot', 'Gewicht mehr auf dem tieferen Fuß'), [0.75, 1.0]),
        co('clubHead', L('one club less loft', 'einen Schläger weniger Loft'), [3.2, 0.95]),
      ], L('Face-on, target to the right: the ground rises to the green.', 'Von vorn, Ziel rechts: Der Boden steigt zum Grün an.')),
    },
    move: {
      text: [
        L(
          'Swing along the slope: back low along the ground, through up the hill. Do not chop into the slope – the club sticks and the ball stays short. Let the arms and the body go up the hill to a short, held finish.',
          'Schwinge am Hang entlang: zurück flach am Boden, durch den Hang hinauf. Nicht in den Hang hacken – sonst bleibt der Schläger stecken und der Ball kurz. Arme und Körper gehen mit den Hang hinauf in ein kurzes, gehaltenes Finish.',
        ),
      ],
      sketch: S(5, 3.0, [
        hill(5, 0.2, 1.08).item,
        fig(1.4, 'chip', { tilt: hill(5, 0.2, 1.08).deg, y: hill(5, 0.2, 1.08).at(1.4), shift: -0.05 }),
        fig(3.6, 'chipFinish', { tilt: hill(5, 0.2, 1.08).deg, y: hill(5, 0.2, 1.08).at(3.6) }),
        co('clubHead', L('back: low along the slope', 'zurück: flach am Hang'), [0.4, 1.2], 0),
        co('hands', L('through: up the hill, hold the finish', 'durch: den Hang hinauf, Finish halten'), [4.4, 2.3], 1),
      ]),
    },
    watch: {
      points: [
        L('The ball flies higher and shorter and rolls less – land it further, closer to the hole.', 'Der Ball fliegt höher und kürzer und rollt weniger – weiter landen, näher zur Fahne.'),
        L('Do not force the weight forward against the slope – you fall into the hill and hit it fat.', 'Das Gewicht nicht gegen den Hang nach vorn zwingen – du fällst in den Hang und triffst fett.'),
        L('Make the stroke a little longer than on the flat.', 'Die Bewegung etwas länger machen als in der Ebene.'),
      ],
      sketch: S(6, 2.2, [hill(6, 0.2, 0.62).item, ...landRoll(6, 0.6, 3.4, 4.6, 0.95, hill(6, 0.2, 0.62).at, [L('higher, shorter', 'höher, kürzer'), L('little roll', 'wenig Rollen')])], L('Uphill: land it closer to the hole.', 'Bergauf: näher zur Fahne landen.')),
    },
    drills: ['slope-chips', 'slope-ball-position', 'slope-home-balance'],
  },
  {
    id: 'chip-downhill',
    name: L('Chip downhill', 'Chip bergab'),
    short: L('The ball lies on a slope that falls to the green.', 'Der Ball liegt am Hang, der zum Grün abfällt.'),
    setup: {
      rows: [
        { k: 'stance', v: L('Shoulders parallel to the slope', 'Schultern parallel zum Hang') },
        { k: 'weight', v: L('More on the lower lead foot', 'Mehr auf dem tieferen vorderen Fuß') },
        { k: 'ball', v: L('Back of centre (towards the higher trail foot)', 'Hinter der Mitte (Richtung höherer hinterer Fuß)') },
        { k: 'club', v: L('More loft (SW or LW) – the slope takes loft away', 'Mehr Loft (SW oder LW) – der Hang nimmt Loft weg') },
      ],
      sketch: S(4, 2.9, [
        down.item,
        fig(1.9, 'chip', { tilt: down.deg, y: down.at(1.9), shift: 0.03 }),
        ball(1.8, down.at(1.8)),
        co('leadShoulder', L('shoulders parallel to the slope', 'Schultern parallel zum Hang'), [3.1, 2.1]),
        co('leadAnkle', L('weight on the lower lead foot', 'Gewicht auf dem tieferen vorderen Fuß'), [3.2, 0.55]),
        co('trailAnkle', L('ball back, near the higher foot', 'Ball hinten, nah am höheren Fuß'), [0.7, 1.15]),
      ], L('Face-on, target to the right: the ground falls to the green.', 'Von vorn, Ziel rechts: Der Boden fällt zum Grün ab.')),
    },
    move: {
      text: [
        L(
          'Swing down the slope: the club stays low after the ball and follows the ground. Keep the body tilted with the hill – standing up tops the ball. A short stroke, the hands lead.',
          'Schwinge den Hang hinunter: Der Schläger bleibt nach dem Ball tief und folgt dem Boden. Den Körper mit dem Hang geneigt lassen – Aufrichten toppt den Ball. Eine kurze Bewegung, die Hände führen.',
        ),
      ],
      sketch: S(5, 3.0, [
        hill(5, 1.08, 0.2).item,
        fig(1.4, 'chip', { tilt: hill(5, 1.08, 0.2).deg, y: hill(5, 1.08, 0.2).at(1.4), shift: 0.03 }),
        fig(3.6, 'chipFinish', { tilt: hill(5, 1.08, 0.2).deg, y: hill(5, 1.08, 0.2).at(3.6) }),
        co('clubHead', L('the club follows the ground down the hill', 'der Schläger folgt dem Boden hangabwärts'), [4.3, 0.5], 1),
        co('head', L('stay tilted with the slope', 'mit dem Hang geneigt bleiben'), [0.5, 2.4], 0),
      ]),
    },
    watch: {
      points: [
        L('The ball comes out lower and rolls a lot – land it short, just onto the green.', 'Der Ball kommt flacher und rollt weit – kurz landen, gerade aufs Grün.'),
        L('The higher trail foot brings the ground closer behind the ball – that is why the ball goes back.', 'Durch den höheren hinteren Fuß ist der Boden hinter dem Ball näher – deshalb kommt der Ball nach hinten.'),
        L('Do not try to lift it: trust the loft.', 'Nicht versuchen, den Ball zu heben: dem Loft vertrauen.'),
      ],
      sketch: S(6, 2.2, [hill(6, 0.75, 0.2).item, ...landRoll(6, 0.6, 2.0, 4.6, 0.55, hill(6, 0.75, 0.2).at, [L('lower', 'flacher'), L('long roll', 'langes Rollen')])], L('Downhill: land it short.', 'Bergab: kurz landen.')),
    },
    drills: ['slope-chips', 'slope-ball-position', 'slope-home-balance'],
  },
  {
    id: 'chip-above-feet',
    name: L('Ball above the feet', 'Ball über den Füßen'),
    short: L('The ball lies higher than your feet – it goes left.', 'Der Ball liegt höher als deine Füße – er geht nach links.'),
    setup: {
      rows: [
        { k: 'grip', v: L('2–4 cm down the grip – the steeper, the shorter', '2–4 cm kürzer greifen – je steiler, desto kürzer') },
        { k: 'stance', v: L('Stand more upright, weight towards the toes', 'Aufrechter stehen, Gewicht Richtung Fußballen') },
        { k: 'aim', v: L('Aim right of the target – the ball starts left', 'Rechts vom Ziel zielen – der Ball startet nach links') },
        { k: 'ball', v: L('Middle', 'Mitte') },
        { k: 'club', v: L('The more loft, the more it goes left – aim further right with a wedge', 'Je mehr Loft, desto mehr links – mit dem Wedge weiter rechts zielen') },
      ],
      sketch: S(5, 2.6, [
        aboveFeet.item,
        fig(1.6, 'address', { club: 'wedge', y: aboveFeet.at(1.5) }),
        ball(2.3, aboveFeet.at(2.3)),
        co('hands', L('grip down', 'kürzer greifen'), [3.1, 1.55]),
        co('head', L('stand taller', 'aufrechter stehen'), [3.0, 2.35]),
        co('leadToe', L('weight towards the toes – you would fall back', 'Gewicht zu den Ballen – sonst fällst du nach hinten'), [3.4, 0.25]),
      ], L('From the side: the ground rises to the ball.', 'Von der Seite: Der Boden steigt zum Ball an.')),
    },
    move: {
      text: [
        L(
          'The swing gets flatter, more around the body – let it. Arms and shoulders, a quiet lower body, no big weight shift. Hold the balance until the ball lands.',
          'Der Schwung wird flacher, mehr um den Körper – lass das zu. Arme und Schultern, ein ruhiger Unterkörper, keine große Gewichtsverlagerung. Das Gleichgewicht halten, bis der Ball landet.',
        ),
      ],
      sketch: S(5, 2.6, [
        aboveFeet.item,
        fig(1.6, 'address', { club: 'wedge', y: aboveFeet.at(1.5) }),
        ball(2.3, aboveFeet.at(2.3)),
        { k: 'arrow', from: [2.6, 1.0], to: [2.9, 1.25] },
        co('pelvis', L('quiet lower body', 'ruhiger Unterkörper'), [0.5, 1.2]),
        co('leadShoulder', L('a flatter swing around the body', 'ein flacherer Schwung um den Körper'), [3.2, 2.0]),
      ]),
    },
    watch: {
      points: [
        L('The face points left of where the leading edge points – the more loft, the more.', 'Die Schlagfläche zeigt weiter links als die Vorderkante – je mehr Loft, desto mehr.'),
        L('Fat shots come from standing too close or too low – grip down instead.', 'Fette Schläge kommen davon, zu nah oder zu tief zu stehen – stattdessen kürzer greifen.'),
      ],
      sketch: T(4, 7, [
        { k: 'fringe', x: 0, y: 0, w: 4, h: 4.2 },
        { k: 'green', x: 0.3, y: 0.3, w: 3.4, h: 3.6, round: true },
        { k: 'hole', at: [1.8, 1.0], flag: true },
        { k: 'ball', at: [1.8, 5.9] },
        { k: 'player', at: [1.2, 5.9], face: 'up' },
        { k: 'path', pts: [[1.8, 5.9], [2.8, 1.0]], style: 'aim' },
        { k: 'path', pts: [[1.8, 5.9], [2.3, 3.4], [1.85, 1.15]], style: 'flight', arrow: true },
        { k: 'text', at: [3.1, 1.6], t: L('aim here', 'hierhin zielen'), size: 0.26 },
      ], L('From above: aim right, the ball comes back left.', 'Von oben: rechts zielen, der Ball kommt nach links zurück.')),
    },
    drills: ['slope-chips', 'aim-for-slope', 'slope-home-balance'],
  },
  {
    id: 'chip-below-feet',
    name: L('Ball below the feet', 'Ball unter den Füßen'),
    short: L('The ball lies lower than your feet – it goes right.', 'Der Ball liegt tiefer als deine Füße – er geht nach rechts.'),
    setup: {
      rows: [
        { k: 'stance', v: L('Wider, more knee flex – like sitting on a high stool', 'Breiter, mehr Kniebeuge – wie auf einem hohen Hocker') },
        { k: 'weight', v: L('Towards the heels, so you do not fall to the ball', 'Richtung Fersen, damit du nicht zum Ball fällst') },
        { k: 'grip', v: L('Full length of the grip', 'Volle Länge greifen') },
        { k: 'aim', v: L('Aim left of the target – the ball goes right', 'Links vom Ziel zielen – der Ball geht nach rechts') },
        { k: 'ball', v: L('Middle', 'Mitte') },
      ],
      sketch: S(5, 2.8, [
        belowFeet.item,
        fig(1.6, 'address', { club: 'wedge', crouch: true, tilt: -7, y: belowFeet.at(1.6) }),
        ball(2.35, belowFeet.at(2.35)),
        co('leadKnee', L('more knee flex, wider stance', 'mehr Kniebeuge, breiterer Stand'), [3.1, 1.0]),
        co('head', L('stay at this height until the ball is gone', 'diese Höhe halten, bis der Ball weg ist'), [3.2, 2.4]),
        co('hands', L('full length of the grip', 'volle Länge greifen'), [3.3, 1.6]),
      ], L('From the side: the ground falls to the ball.', 'Von der Seite: Der Boden fällt zum Ball ab.')),
    },
    move: {
      text: [
        L(
          'A shorter, quieter stroke with the arms; the legs stay flexed. The danger is coming up out of the shot – stay at your height until the ball is gone.',
          'Eine kürzere, ruhigere Bewegung mit den Armen; die Beine bleiben gebeugt. Die Gefahr ist, aus dem Schlag hochzukommen – bleib auf deiner Höhe, bis der Ball weg ist.',
        ),
      ],
      sketch: FIGURE_SKETCHES['below-feet-stay'],
    },
    watch: {
      points: [
        L('The ball starts right and stays right – aim left.', 'Der Ball startet rechts und bleibt rechts – links zielen.'),
        L('Thin and right: you stood up. Fat: too much weight on the toes.', 'Dünn und rechts: Du hast dich aufgerichtet. Fett: zu viel Gewicht auf den Zehen.'),
      ],
      sketch: T(4, 7, [
        { k: 'fringe', x: 0, y: 0, w: 4, h: 4.2 },
        { k: 'green', x: 0.3, y: 0.3, w: 3.4, h: 3.6, round: true },
        { k: 'hole', at: [2.2, 1.0], flag: true },
        { k: 'ball', at: [2.2, 5.9] },
        { k: 'player', at: [1.6, 5.9], face: 'up' },
        { k: 'path', pts: [[2.2, 5.9], [1.2, 1.0]], style: 'aim' },
        { k: 'path', pts: [[2.2, 5.9], [1.7, 3.4], [2.15, 1.15]], style: 'flight', arrow: true },
        { k: 'text', at: [0.9, 1.6], t: L('aim here', 'hierhin zielen'), size: 0.26 },
      ], L('From above: aim left, the ball comes back right.', 'Von oben: links zielen, der Ball kommt nach rechts zurück.')),
    },
    drills: ['below-feet-stay', 'slope-chips', 'slope-home-balance'],
  },
  {
    id: 'chip-bare',
    name: L('Bare patch or hard ground', 'Kahlstelle oder harter Boden'),
    short: L('No grass under the ball – the club must not bounce.', 'Kein Gras unter dem Ball – der Schläger darf nicht springen.'),
    setup: {
      rows: [
        { k: 'club', v: L('PW or 9-iron – little bounce. No lob wedge: its rounded sole bounces off and blades the ball', 'PW oder Eisen 9 – wenig Bounce. Kein Lobwedge: Seine gerundete Sohle springt ab und trifft den Ball in der Mitte') },
        { k: 'ball', v: L('Back of centre', 'Hinter der Mitte') },
        { k: 'weight', v: L('About 70 % on the lead foot', 'Etwa 70 % auf dem vorderen Fuß') },
        { k: 'grip', v: L('Hands ahead, the shaft leans to the target', 'Hände vorn, der Schaft neigt sich zum Ziel') },
      ],
      sketch: FIGURE_SKETCHES['bare-lie'],
    },
    move: {
      text: [
        L(
          'A putting stroke with loft, short and without wrist action: ball first, then at most a touch of the ground. The hands stay ahead through the ball. If nothing is in the way, putt it – the safest shot from a bare lie.',
          'Eine Puttbewegung mit Loft, kurz und ohne Handgelenk: erst der Ball, dann höchstens ein Hauch Boden. Die Hände bleiben durch den Ball vorn. Ist nichts im Weg, putte – der sicherste Schlag von einer Kahlstelle.',
        ),
      ],
      sketch: S(5, 2.4, [
        ground(5),
        fig(1.4, 'chip', { club: 'iron', shift: 0.05 }),
        ball(1.32),
        fig(3.6, 'chipFinish', { club: 'iron' }),
        co('hands', L('hands ahead, wrists quiet', 'Hände vorn, Handgelenke ruhig'), [0.4, 1.6], 0),
        co('clubHead', L('low and short – no scooping', 'tief und kurz – nicht schaufeln'), [4.5, 0.6], 1),
      ]),
    },
    watch: {
      points: [
        L('From hard ground the ball runs further – land it shorter.', 'Von hartem Boden rollt der Ball weiter – kürzer landen.'),
        L('Thin shots come from trying to get under the ball. Hit down, the loft does the rest.', 'Getoppte Bälle kommen vom Versuch, unter den Ball zu kommen. Nach unten treffen, der Loft macht den Rest.'),
        L('Putter or hybrid first, if the grass in front allows it.', 'Zuerst an Putter oder Hybrid denken, wenn das Gras davor es zulässt.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.5, 2.2, 4.9, 0.45, () => G0, [L('low', 'flach'), L('runs far', 'rollt weit')])], L('Low flight, long roll.', 'Flacher Flug, langes Rollen.')),
    },
    drills: ['bare-lie', 'chip-line', 'hybrid-chip'],
  },
  {
    id: 'chip-deep-grass',
    name: L('Deep in the grass', 'Tief im Gras'),
    short: L('The ball sits down in the rough next to the green.', 'Der Ball sitzt tief im Rough neben dem Grün.'),
    setup: {
      rows: [
        { k: 'club', v: L('SW or LW – enough loft, the leading edge must get under the ball', 'SW oder LW – genug Loft, die Vorderkante muss unter den Ball') },
        { k: 'ball', v: L('Middle to slightly back', 'Mitte bis leicht hinten') },
        { k: 'face', v: L('A little open – the grass closes it', 'Leicht geöffnet – das Gras schließt sie') },
        { k: 'grip', v: L('Firmer than usual – the grass twists the club', 'Fester als sonst – das Gras verdreht den Schläger') },
        { k: 'weight', v: L('About 60 % on the lead foot', 'Etwa 60 % auf dem vorderen Fuß') },
      ],
      sketch: S(4, 2.5, [
        ground(4),
        { k: 'line', from: [1.55, 0.2], to: [1.6, 0.31] }, { k: 'line', from: [1.68, 0.2], to: [1.66, 0.33] }, { k: 'line', from: [1.92, 0.2], to: [1.95, 0.32] }, { k: 'line', from: [2.02, 0.2], to: [2.0, 0.3] },
        fig(1.9, 'chip', { shift: 0.03 }),
        ball(1.82, 0.22),
        co('hands', L('firm grip', 'fester Griff'), [3.1, 1.3]),
        co('clubHead', L('SW or LW, face a little open', 'SW oder LW, Fläche leicht offen'), [3.2, 0.6]),
        co('trailAnkle', L('ball middle to slightly back', 'Ball Mitte bis leicht hinten'), [0.7, 0.85]),
      ], L('Face-on, target to the right: the ball sits deep in the grass.', 'Von vorn, Ziel rechts: Der Ball sitzt tief im Gras.')),
    },
    move: {
      text: [
        L(
          'Steeper and longer than from the fringe: the wrists hinge a little more on the way back, then down into the grass behind the ball and through. Do not stop – the grass brakes the club.',
          'Steiler und länger als vom Vorgrün: Die Handgelenke winkeln beim Ausholen etwas mehr an, dann nach unten ins Gras hinter dem Ball und durch. Nicht abbremsen – das Gras bremst den Schläger.',
        ),
      ],
      sketch: S(5, 2.8, [
        ground(5),
        fig(1.4, 'halfBack'),
        fig(3.6, 'halfThrough'),
        co('hands', L('more wrist hinge – a steeper way down', 'mehr Handgelenkwinkel – steiler nach unten'), [0.4, 2.3], 0),
        co('clubHead', L('through the grass to a full finish', 'durch das Gras ins volle Finish'), [4.6, 2.3], 1),
      ]),
    },
    watch: {
      points: [
        L('Grass between face and ball: almost no spin, the ball rolls further than from the fringe – land it shorter.', 'Gras zwischen Fläche und Ball: kaum Spin, der Ball rollt weiter als vom Vorgrün – kürzer landen.'),
        L('If the ball sits up on the grass, do not ground the club – hover it, or you slide under the ball.', 'Sitzt der Ball oben auf dem Gras, den Schläger nicht aufsetzen – schweben lassen, sonst rutschst du unter den Ball.'),
        L('Against the collar: hit the equator with the leading edge, or chip it with a hybrid.', 'An der Rough-Kante: mit der Vorderkante den Äquator treffen oder mit dem Hybrid chippen.'),
      ],
      sketch: S(6, 2.0, [ground(6), ...landRoll(6, 0.5, 2.6, 4.9, 0.85, () => G0, [L('higher', 'höher'), L('no spin – more roll', 'ohne Spin – mehr Rollen')])], L('Out of the rough the ball checks less.', 'Aus dem Rough bremst der Ball weniger.')),
    },
    drills: ['rough-chip', 'hybrid-chip'],
    videos: ['CW-QqKjLXBQ'],
  },
];

export interface TopicShots {
  shots: TopicShot[];
  lie?: LieChart;
  /** sections (English titles) whose content moved into the shots – they leave the basics */
  absorbs?: string[];
}

export const SHOTS: Partial<Record<CategoryId, TopicShots>> = {
  chipping: { shots: CHIP_SHOTS, lie: CHIP_LIES, absorbs: ['The set-up', 'The stroke', 'Landing spot and club choice', 'Special chips'] },
};
