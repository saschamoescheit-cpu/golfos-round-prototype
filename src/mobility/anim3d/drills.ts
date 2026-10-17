import { L } from '../../training/types';
import type { Pose } from './rig';
import type { Clip } from './scene';
import { ARMS_CROSSED, CLIPS, golf, GOLF, k, P, stand, type J } from './clips';

// The 3D videos of the corrective drills in Agility (17./18.10.2026): the same golfer as in the tests. Drills that are
// a test done as practice reuse the test's clip (with their props); the floor drills get their own: on all fours, on
// the side, on the belly, kneeling. Signs of the angles: see rig.ts.

const with_ = (c: Clip, extra: Partial<Clip>): Clip => ({ ...c, ...extra });
/** the test clip with the first step named for the drill (its props) */
const firstStep = (c: Clip, label: L): Clip => ({ ...c, keys: c.keys.map((x, i) => (i ? x : { ...x, label })) });

// ---------- floor positions ----------
/** on hands and knees: thighs and arms upright, the trunk rising 16° to the shoulders (arms are longer than thighs) */
const QUAD: J = {
  pelvis: [74, 0, 0],
  neck: [10, 0, 0],
  hipL: [-74, 0, 3],
  hipR: [-74, 0, -3],
  kneeL: [90, 0, 0],
  kneeR: [90, 0, 0],
  ankleL: [90, 0, 0],
  ankleR: [90, 0, 0],
  shoulderL: [-74, 0, 5],
  shoulderR: [-74, 0, -5],
  elbowL: [-4, 0, 0],
  elbowR: [-4, 0, 0],
};
const quad = (j: J = {}, extra: Omit<Pose, 'j'> = {}): Pose => P({ ...QUAD, ...j }, extra);

/** sitting back on the heels, chest on the thighs, forehead down (child's pose) */
const CHILD: J = {
  pelvis: [80, 0, 0],
  spine: [8, 0, 0],
  chest: [4, 0, 0],
  neck: [6, 0, 0],
  head: [10, 0, 0],
  hipL: [-148, 0, 8],
  hipR: [-148, 0, -8],
  kneeL: [158, 0, 0],
  kneeR: [158, 0, 0],
  ankleL: [60, 0, 0],
  ankleR: [60, 0, 0],
};

/** kneeling in front of a bench, elbows on it, hands behind the head: hips over the knees … */
const LAT_START = P(
  { ...CHILD, pelvis: [76, 0, 0], hipL: [-100, 0, 8], hipR: [-100, 0, -8], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [75, 0, 0], ankleR: [75, 0, 0], shoulderL: [-180, 0, 12], shoulderR: [-180, 0, -12], elbowL: [-150, 0, 0], elbowR: [-150, 0, 0] },
  { at: [0, -0.17] },
);
/** … and sitting back towards the heels, the chest sinking between the arms */
const LAT_END = P({ ...CHILD, pelvis: [84, 0, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], shoulderL: [-168, 0, 12], shoulderR: [-168, 0, -12], elbowL: [-150, 0, 0], elbowR: [-150, 0, 0] }, { at: [0, -0.3] });

/** lying on the right side, knees bent 90° in front, arms forward (seen from above or the front) */
const SIDE: J = {
  hipL: [-80, 0, 2],
  hipR: [-80, 0, -2],
  kneeL: [90, 0, 0],
  kneeR: [90, 0, 0],
  shoulderL: [-88, 0, 0],
  shoulderR: [-88, 0, 0],
};
const side = (j: J = {}): Pose => P({ ...SIDE, ...j }, { roll: 90 });

/** lying on the back, knees bent, feet flat */
const HOOK: J = { hipL: [-55, 0, 6], hipR: [-55, 0, -6], kneeL: [105, 0, 0], kneeR: [105, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0], shoulderL: [8, 0, 14], shoulderR: [8, 0, -14] };
const BRIDGE_UP: J = { neck: [22, 0, 0], hipL: [0, 0, 6], hipR: [0, 0, -6], kneeL: [112, 0, 0], kneeR: [112, 0, 0], shoulderL: [24, 0, 14], shoulderR: [24, 0, -14] };

/** lying on the belly, arms overhead in a Y */
const PRONE: J = { shoulderL: [-170, 0, 32], shoulderR: [-170, 0, -32], ankleL: [40, 0, 0], ankleR: [40, 0, 0] };

/** half-kneeling: left foot in front, right knee on the floor */
const HALF_KNEEL: J = {
  hipL: [-82, 0, 6],
  kneeL: [88, 0, 0],
  ankleL: [-6, 0, 0],
  hipR: [12, 0, -4],
  kneeR: [96, 0, 0],
  ankleR: [60, 0, 0],
  shoulderL: [-75, 0, 8],
  shoulderR: [-75, 0, -8],
};

/** standing on the left leg, the right foot up beside the left calf, arms crossed */
const REACH_START = stand({ ...ARMS_CROSSED, kneeL: [10, 0, 0], hipR: [-30, 0, -2], kneeR: [65, 0, 0] });
/** the left hand holds a stick in front of the body (90/90 stretch) */
const STICK_L: J = { shoulderL: [-55, 0, -20], elbowL: [-25, 0, 0] };

export const DRILL_CLIPS: Record<string, Clip> = {
  // ---------- the tests as drills ----------
  'deep-squat': CLIPS['deep-squat'],
  'single-leg-balance': CLIPS['single-leg'],
  'seated-rotation': CLIPS['seated-rotation'],
  'mob-toe-touch': firstStep(with_(CLIPS['toe-touch'], { props: ['book'] }), L('Toes on a book, heels on the floor', 'Zehen auf einem Buch, Fersen am Boden')),
  'mob-pelvic-turn': firstStep(with_(CLIPS['pelvic-rotation'], { props: ['barChest'] }), L('Golf posture, a club across the chest', 'Golfhaltung, ein Schläger quer vor der Brust')),
  'mob-neck-turn': CLIPS.neck,
  'mob-forearm-turn': CLIPS.forearm,
  'mob-wrist-hinge': CLIPS['wrist-hinge'],

  // ---------- on all fours ----------
  'mob-cat-camel': {
    view: 'side',
    views: ['side', 'angle'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, quad(), L('On hands and knees', 'Im Vierfüßlerstand')),
      k(1.0, quad()),
      k(2.6, quad({ pelvis: [62, 0, 0], hipL: [-62, 0, 3], hipR: [-62, 0, -3], spine: [22, 0, 0], chest: [16, 0, 0], neck: [32, 0, 0], shoulderL: [-100, 0, 5], shoulderR: [-100, 0, -5] }), L('Round the back like a cat – from the pelvis', 'Rücken rund wie eine Katze – aus dem Becken heraus')),
      k(3.4, quad({ pelvis: [62, 0, 0], hipL: [-62, 0, 3], hipR: [-62, 0, -3], spine: [22, 0, 0], chest: [16, 0, 0], neck: [32, 0, 0], shoulderL: [-100, 0, 5], shoulderR: [-100, 0, -5] })),
      k(5.0, quad({ pelvis: [86, 0, 0], hipL: [-86, 0, 3], hipR: [-86, 0, -3], spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [-18, 0, 0], shoulderL: [-60, 0, 5], shoulderR: [-60, 0, -5] }), L('… then let it sag slowly', '… dann langsam durchhängen lassen')),
      k(5.8, quad({ pelvis: [86, 0, 0], hipL: [-86, 0, 3], hipR: [-86, 0, -3], spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [-18, 0, 0], shoulderL: [-60, 0, 5], shoulderR: [-60, 0, -5] })),
      k(7.0, quad()),
    ],
  },
  'mob-thread-needle': {
    view: 'angle',
    views: ['angle', 'front', 'side'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, quad(), L('On hands and knees', 'Im Vierfüßlerstand')),
      k(1.0, quad()),
      k(2.6, quad({ spine: [0, -18, 0], chest: [0, -26, 0], shoulderR: [-40, 0, 90], elbowR: [-4, 0, 0], neck: [10, -20, 0], shoulderL: [-80, 0, 5], elbowL: [-30, 0, 0] }), L('Slide the right arm under the body, shoulder towards the floor', 'Rechten Arm unter dem Körper durchschieben, Schulter Richtung Boden')),
      k(3.4, quad({ spine: [0, -18, 0], chest: [0, -26, 0], shoulderR: [-40, 0, 90], elbowR: [-4, 0, 0], neck: [10, -20, 0], shoulderL: [-80, 0, 5], elbowL: [-30, 0, 0] })),
      k(4.4, quad()),
      k(5.8, quad({ spine: [0, 22, 0], chest: [0, 30, 0], shoulderR: [58, 0, 66], elbowR: [0, 0, 0], neck: [10, 25, 0] }), L('… then open it up to the ceiling, eyes follow', '… dann zur Decke öffnen, der Blick folgt')),
      k(6.6, quad({ spine: [0, 22, 0], chest: [0, 30, 0], shoulderR: [58, 0, 66], elbowR: [0, 0, 0], neck: [10, 25, 0] })),
      k(8.0, quad()),
    ],
  },
  'mob-wrist-stretch': {
    view: 'side',
    views: ['side', 'angle'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, quad({ wristL: [0, 180, 0], wristR: [0, 180, 0] }), L('On hands and knees, fingers pointing to the knees', 'Im Vierfüßlerstand, die Finger zeigen zu den Knien')),
      k(1.2, quad({ wristL: [0, 180, 0], wristR: [0, 180, 0] })),
      k(2.8, quad({ pelvis: [68, 0, 0], hipL: [-46, 0, 3], hipR: [-46, 0, -3], shoulderL: [-96, 0, 5], shoulderR: [-96, 0, -5], wristL: [-20, 180, 0], wristR: [-20, 180, 0] }), L('Rock gently back – 20 s', 'Sanft nach hinten wippen – 20 s')),
      k(4.2, quad({ pelvis: [68, 0, 0], hipL: [-46, 0, 3], hipR: [-46, 0, -3], shoulderL: [-96, 0, 5], shoulderR: [-96, 0, -5], wristL: [-20, 180, 0], wristR: [-20, 180, 0] })),
      k(5.6, quad({ wristL: [0, 180, 0], wristR: [0, 180, 0] })),
    ],
  },

  // ---------- kneeling ----------
  'mob-lat-stretch': {
    view: 'side',
    views: ['side', 'angle'],
    ground: 'all',
    props: ['benchFront'],
    keys: [
      k(0, LAT_START, L('Elbows on the bench, hands together behind the head', 'Ellbogen auf der Bank, Hände hinter dem Kopf zusammen')),
      k(1.2, LAT_START),
      k(3.0, LAT_END, L('Sit the hips back to the heels, the chest sinks – hold 30 s', 'Hüfte nach hinten zu den Fersen, die Brust sinkt – 30 s halten')),
      k(5.0, LAT_END),
      k(6.4, LAT_START),
    ],
  },
  'mob-ankle-wall': {
    view: 'side',
    views: ['side', 'angle'],
    ground: 'all',
    props: ['wallFront'],
    keys: [
      k(0, P(HALF_KNEEL), L('Left foot in front of the wall, right knee down', 'Linker Fuß vor der Wand, rechtes Knie am Boden')),
      k(1.0, P(HALF_KNEEL)),
      k(2.4, P({ ...HALF_KNEEL, hipL: [-70, 0, 6], kneeL: [118, 0, 0], ankleL: [-48, 0, 0], pelvis: [0, 0, 0] }, { at: [0, 0.1] }), L('Push the knee over the toes to the wall – the heel stays down', 'Knie über die Zehen zur Wand schieben – die Ferse bleibt unten')),
      k(3.2, P({ ...HALF_KNEEL, hipL: [-70, 0, 6], kneeL: [118, 0, 0], ankleL: [-48, 0, 0], pelvis: [0, 0, 0] }, { at: [0, 0.1] })),
      k(4.6, P(HALF_KNEEL), L('Back – 10 times per side', 'Zurück – 10-mal pro Seite')),
      k(5.4, P(HALF_KNEEL)),
    ],
  },

  // ---------- on the side ----------
  'open-books': {
    view: 'above',
    views: ['above', 'front'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, side(), L('On the side, knees bent, arms forward', 'Auf der Seite, Knie gebeugt, Arme nach vorn')),
      k(1.0, side()),
      k(2.4, side({ shoulderL: [0, 0, 92], chest: [0, 35, 0], spine: [0, 15, 0], neck: [0, 20, 0] }), L('Open the top arm like a book, eyes follow', 'Den oberen Arm wie ein Buch öffnen, der Blick folgt')),
      k(3.6, side({ shoulderL: [88, 0, 0], chest: [0, 60, 0], spine: [0, 25, 0], neck: [0, 30, 0] }), L('Knees stay together – breathe out, 2 s', 'Knie bleiben zusammen – ausatmen, 2 s')),
      k(4.6, side({ shoulderL: [88, 0, 0], chest: [0, 60, 0], spine: [0, 25, 0], neck: [0, 30, 0] })),
      k(5.8, side({ shoulderL: [0, 0, 92], chest: [0, 35, 0], spine: [0, 15, 0], neck: [0, 20, 0] })),
      k(7.0, side()),
    ],
  },
  'mob-clamshell': {
    view: 'front',
    views: ['front', 'above'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, side({ hipL: [-45, 0, 2], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] }), L('On the side, knees bent, feet together', 'Auf der Seite, Knie gebeugt, Füße zusammen')),
      k(1.0, side({ hipL: [-45, 0, 2], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] })),
      k(2.2, side({ hipL: [-45, 60, 30], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] }), L('Open the top knee – the feet stay together', 'Das obere Knie öffnen – die Füße bleiben zusammen')),
      k(2.8, side({ hipL: [-45, 60, 30], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] })),
      k(4.0, side({ hipL: [-45, 0, 2], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] }), L('Close slowly – 2 × 15 per side', 'Langsam schließen – 2 × 15 pro Seite')),
      k(4.8, side({ hipL: [-45, 0, 2], hipR: [-45, 0, -2], kneeL: [95, 0, 0], kneeR: [95, 0, 0], shoulderL: [10, 0, 0], elbowL: [-60, 0, 0] })),
    ],
  },

  // ---------- on the back / on the belly ----------
  'glute-bridge': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P(HOOK, { tip: -90 }), L('On your back, knees bent, feet flat', 'Rückenlage, Knie gebeugt, Füße flach')),
      k(1.0, P(HOOK, { tip: -90 })),
      k(2.4, P(BRIDGE_UP, { tip: -112 }), L('Lift the hips, squeeze the glutes – 2 s', 'Hüfte heben, Gesäß anspannen – 2 s')),
      k(3.6, P(BRIDGE_UP, { tip: -112 })),
      k(5.0, P(HOOK, { tip: -90 }), L('Lower slowly – 3 × 12', 'Langsam senken – 3 × 12')),
      k(5.6, P(HOOK, { tip: -90 })),
    ],
  },
  'mob-single-leg-bridge': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P({ ...HOOK, hipL: [-55, 0, 6], kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -90 }), L('On your back, the left leg straight in line with the thigh', 'Rückenlage, das linke Bein gestreckt in Linie mit dem Oberschenkel')),
      k(1.0, P({ ...HOOK, hipL: [-55, 0, 6], kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -90 })),
      k(2.4, P({ ...BRIDGE_UP, kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -112 }), L('Push the hips up on one leg – 2 s at the top', 'Hüfte auf einem Bein hochdrücken – oben 2 s')),
      k(3.6, P({ ...BRIDGE_UP, kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -112 })),
      k(5.0, P({ ...HOOK, hipL: [-55, 0, 6], kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -90 }), L('Lower slowly, the pelvis stays level', 'Langsam senken, das Becken bleibt waagrecht')),
      k(5.6, P({ ...HOOK, hipL: [-55, 0, 6], kneeL: [0, 0, 0], ankleL: [-20, 0, 0] }, { tip: -90 })),
    ],
  },
  'mob-pelvic-tilt': {
    view: 'side',
    views: ['side', 'angle'],
    props: ['mat'],
    keys: [
      k(0, P(HOOK, { tip: -90 }), L('On your back, knees bent', 'Rückenlage, Knie gebeugt')),
      k(1.0, P(HOOK, { tip: -90 })),
      k(2.2, P({ ...HOOK, pelvis: [-14, 0, 0], hipL: [-41, 0, 6], hipR: [-41, 0, -6], spine: [14, 0, 0] }, { tip: -90 }), L('Press the low back into the floor', 'Unteren Rücken in den Boden drücken')),
      k(2.8, P({ ...HOOK, pelvis: [-14, 0, 0], hipL: [-41, 0, 6], hipR: [-41, 0, -6], spine: [14, 0, 0] }, { tip: -90 })),
      k(4.0, P({ ...HOOK, pelvis: [14, 0, 0], hipL: [-69, 0, 6], hipR: [-69, 0, -6], spine: [-14, 0, 0] }, { tip: -90 }), L('… then arch it – only the pelvis moves', '… dann ins Hohlkreuz – nur das Becken bewegt sich')),
      k(4.6, P({ ...HOOK, pelvis: [14, 0, 0], hipL: [-69, 0, 6], hipR: [-69, 0, -6], spine: [-14, 0, 0] }, { tip: -90 })),
      k(5.8, P(HOOK, { tip: -90 })),
    ],
  },
  'mob-prone-y': {
    view: 'side',
    views: ['side', 'angle', 'front'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, P(PRONE, { tip: 90 }), L('On your belly, arms overhead in a Y, thumbs up', 'Bauchlage, Arme über dem Kopf im Y, Daumen oben')),
      k(1.0, P(PRONE, { tip: 90 })),
      k(2.4, P({ ...PRONE, shoulderL: [-205, 0, 32], shoulderR: [-205, 0, -32], neck: [-10, 0, 0] }, { tip: 90 }), L('Shoulder blades down and back – lift the arms', 'Schulterblätter nach hinten unten – Arme anheben')),
      k(3.4, P({ ...PRONE, shoulderL: [-205, 0, 32], shoulderR: [-205, 0, -32], neck: [-10, 0, 0] }, { tip: 90 })),
      k(4.6, P(PRONE, { tip: 90 }), L('Lower – 2 × 10', 'Ablegen – 2 × 10')),
      k(5.2, P(PRONE, { tip: 90 })),
    ],
  },

  // ---------- standing ----------
  'mob-single-leg-reach': {
    view: 'angle',
    views: ['angle', 'side', 'front'],
    keys: [
      k(0, REACH_START, L('Stand on the left leg, the knee slightly bent', 'Auf dem linken Bein stehen, das Knie leicht gebeugt')),
      k(1.0, REACH_START),
      k(2.4, stand({ pelvis: [45, 0, 0], hipL: [-50, 0, 2], kneeL: [15, 0, 0], ankleL: [-10, 0, 0], hipR: [10, 0, -2], kneeR: [10, 0, 0], shoulderL: [-80, 0, 8], shoulderR: [-80, 0, -8], neck: [-10, 0, 0] }), L('Reach forward, the free leg goes back', 'Nach vorn greifen, das freie Bein geht nach hinten')),
      k(3.0, stand({ pelvis: [45, 0, 0], hipL: [-50, 0, 2], kneeL: [15, 0, 0], ankleL: [-10, 0, 0], hipR: [10, 0, -2], kneeR: [10, 0, 0], shoulderL: [-80, 0, 8], shoulderR: [-80, 0, -8], neck: [-10, 0, 0] })),
      k(4.0, REACH_START),
      k(5.2, stand({ pelvis: [25, 0, 0], spine: [0, 0, 8], chest: [0, 0, 8], hipL: [-30, 0, 6], kneeL: [25, 0, 0], ankleL: [-8, 0, 0], hipR: [20, 0, -14], kneeR: [45, 0, 0], shoulderL: [-30, 0, 80], shoulderR: [-30, 0, -80] }), L('… to the side', '… zur Seite')),
      k(5.8, stand({ pelvis: [25, 0, 0], spine: [0, 0, 8], chest: [0, 0, 8], hipL: [-30, 0, 6], kneeL: [25, 0, 0], ankleL: [-8, 0, 0], hipR: [20, 0, -14], kneeR: [45, 0, 0], shoulderL: [-30, 0, 80], shoulderR: [-30, 0, -80] })),
      k(6.8, REACH_START),
      k(8.2, stand({ pelvis: [55, 0, 0], spine: [12, 0, 0], hipL: [-80, 0, 2], kneeL: [55, 0, 0], ankleL: [-25, 0, 0], hipR: [15, 0, -2], kneeR: [30, 0, 0], shoulderL: [-45, 0, 6], shoulderR: [-45, 0, -6], neck: [10, 0, 0] }), L('… and down – 5 rounds per leg', '… und nach unten – 5 Runden pro Bein')),
      k(8.8, stand({ pelvis: [55, 0, 0], spine: [12, 0, 0], hipL: [-80, 0, 2], kneeL: [55, 0, 0], ankleL: [-25, 0, 0], hipR: [15, 0, -2], kneeR: [30, 0, 0], shoulderL: [-45, 0, 6], shoulderR: [-45, 0, -6], neck: [10, 0, 0] })),
      k(10.0, REACH_START),
    ],
  },
  'mob-wall-angels': {
    view: 'front',
    views: ['front', 'side', 'angle'],
    props: ['wall'],
    keys: [
      k(0, stand({ shoulderL: [0, 90, 75], shoulderR: [0, -90, -75], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] }), L('Back to the wall, arms in a W', 'Rücken an der Wand, Arme im W')),
      k(1.0, stand({ shoulderL: [0, 90, 75], shoulderR: [0, -90, -75], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] })),
      k(2.8, stand({ shoulderL: [0, 90, 150], shoulderR: [0, -90, -150], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] }), L('Slide up to a Y – hands and elbows stay on the wall', 'Nach oben zum Y gleiten – Hände und Ellbogen bleiben an der Wand')),
      k(3.6, stand({ shoulderL: [0, 90, 150], shoulderR: [0, -90, -150], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] })),
      k(5.2, stand({ shoulderL: [0, 90, 75], shoulderR: [0, -90, -75], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] }), L('… and back down – 2 × 10', '… und zurück – 2 × 10')),
      k(5.8, stand({ shoulderL: [0, 90, 75], shoulderR: [0, -90, -75], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] })),
    ],
  },
  'mob-band-er': {
    view: 'front',
    views: ['front', 'above', 'angle'],
    props: ['band'],
    keys: [
      k(0, stand({ shoulderL: [0, 0, 6], shoulderR: [0, 0, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] }), L('Elbows at the sides bent 90°, a band between the hands', 'Ellbogen am Körper 90° gebeugt, ein Band zwischen den Händen')),
      k(1.0, stand({ shoulderL: [0, 0, 6], shoulderR: [0, 0, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] })),
      k(2.4, stand({ shoulderL: [0, 50, 6], shoulderR: [0, -50, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] }), L('Turn the hands out against the band – elbows stay at the sides', 'Hände gegen das Band nach außen drehen – Ellbogen bleiben am Körper')),
      k(3.2, stand({ shoulderL: [0, 50, 6], shoulderR: [0, -50, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] })),
      k(4.6, stand({ shoulderL: [0, 0, 6], shoulderR: [0, 0, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] }), L('Slowly back – 2 × 15', 'Langsam zurück – 2 × 15')),
      k(5.2, stand({ shoulderL: [0, 0, 6], shoulderR: [0, 0, -6], elbowL: [-90, 0, 0], elbowR: [-90, 0, 0] })),
    ],
  },
  'mob-9090-stretch': {
    view: 'angle',
    views: ['angle', 'front', 'side'],
    props: ['barHands'],
    keys: [
      k(0, stand({ ...STICK_L, shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] }), L('Right upper arm at shoulder height, elbow 90°, a stick in the left hand', 'Rechter Oberarm auf Schulterhöhe, Ellbogen 90°, ein Stab in der linken Hand')),
      k(1.0, stand({ ...STICK_L, shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] })),
      k(2.6, stand({ ...STICK_L, shoulderR: [0, -112, -88], elbowR: [-90, 0, 0] }), L('The stick gently pushes the forearm back', 'Der Stab drückt den Unterarm sanft nach hinten')),
      k(4.6, stand({ ...STICK_L, shoulderR: [0, -112, -88], elbowR: [-90, 0, 0] }), L('Hold 20 s – no pain', '20 s halten – ohne Schmerz')),
      k(5.8, stand({ ...STICK_L, shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] })),
      k(6.6, stand({ ...STICK_L, shoulderR: [0, 0, -88], elbowR: [-90, 0, 0] })),
    ],
  },
  'pallof-press': {
    view: 'side',
    views: ['side', 'angle', 'front'],
    keys: [
      k(0, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-50, -30, -10], shoulderR: [-50, 30, 10], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], head: [0, 0, 0] }), L('Athletic posture, the band at chest height from the side', 'Golfhaltung, das Band seitlich auf Brusthöhe')),
      k(1.0, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-50, -30, -10], shoulderR: [-50, 30, 10], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], head: [0, 0, 0] })),
      k(2.4, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-85, -8, -6], shoulderR: [-85, 8, 6], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0], head: [0, 0, 0] }), L('Press straight forward – the body does not turn', 'Gerade nach vorn drücken – der Körper dreht nicht mit')),
      k(3.4, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-85, -8, -6], shoulderR: [-85, 8, 6], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0], head: [0, 0, 0] })),
      k(4.6, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-50, -30, -10], shoulderR: [-50, 30, 10], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], head: [0, 0, 0] }), L('… and back – 3 × 10 per side', '… und zurück – 3 × 10 pro Seite')),
      k(5.2, golf({ ...GOLF, pelvis: [20, 0, 0], hipL: [-35, 0, 6], hipR: [-35, 0, -6], shoulderL: [-50, -30, -10], shoulderR: [-50, 30, 10], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], head: [0, 0, 0] })),
    ],
  },
};

