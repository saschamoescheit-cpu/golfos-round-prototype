import { L } from '../../training/types';
import type { Pose } from './rig';
import type { Clip } from './scene';
import { ARMS_CROSSED, CLIPS, golf, GOLF, k, P, stand, type J } from './clips';

// The 3D videos of the corrective drills in Agility (17./18.10.2026): the same golfer as in the tests. Drills that are
// a test done as practice reuse the test's clip (with their props); the floor drills get their own: on all fours, on
// the side, on the belly, kneeling. Signs of the angles: see rig.ts.

const with_ = (c: Clip, extra: Partial<Clip>): Clip => ({ ...c, ...extra });
/** the test clip with the first step named for the drill (its props) */
/** both hands closed (holding a band handle, a cable) */
const holding = (c: Clip): Clip => ({ ...c, keys: c.keys.map((x) => ({ ...x, pose: { ...x.pose, gripL: 1, gripR: 1 } })) });
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
  // the hands flat on the floor, fingers forward (23.10.2026: the realistic golfer's fingers hung into the mat)
  wristL: [-62, 0, 0],
  wristR: [-62, 0, 0],
};
/** the wrist stretch rocked back: the hips 15 cm back towards the heels, the shins flat, the hands where they were on the
 * floor (fitted on the realistic golfer 24.10.2026 – before, the feet rose 15 cm and the hands slid 27 cm away) */
const ROCK_BACK: J = {
  pelvis: [66, 0, 0],
  hipL: [-86, 0, 3],
  hipR: [-86, 0, -3],
  kneeL: [110, 0, 0],
  kneeR: [110, 0, 0],
  shoulderL: [-84, 0, 5],
  shoulderR: [-84, 0, -5],
  wristL: [39, 180, 0],
  wristR: [39, 180, 0],
};
/** (the hands open: flat on the floor) */
const quad = (j: J = {}, extra: Omit<Pose, 'j'> = {}): Pose => P({ ...QUAD, ...j }, { gripL: 0, gripR: 0, ...extra });

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

/** kneeling in front of a bench, elbows on it, hands behind the head … (both fitted on the realistic golfer 24.10.2026:
 * the elbows on the bench top, the shins flat and the knees in their place – before, the knees hung 5 cm in the air, the
 * elbows over the bench and, sitting back, the arms in the air in front of it while the knees slid 8 cm) */
const LAT_START = P(
  { ...CHILD, pelvis: [76, 0, 0], hipL: [-104, 0, 8], hipR: [-104, 0, -8], kneeL: [118, 0, 0], kneeR: [118, 0, 0], ankleL: [75, 0, 0], ankleR: [75, 0, 0], shoulderL: [-179, 0, 12], shoulderR: [-179, 0, -12], elbowL: [-150, 0, 0], elbowR: [-150, 0, 0] },
  { at: [0, -0.17] },
);
/** … and sitting back towards the heels, the chest sinking between the arms */
const LAT_END = P({ ...CHILD, pelvis: [92, 0, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], hipL: [-134, 0, 8], hipR: [-134, 0, -8], kneeL: [133, 0, 0], kneeR: [133, 0, 0], shoulderL: [-176, 0, 12], shoulderR: [-176, 0, -12], elbowL: [-150, 0, 0], elbowR: [-150, 0, 0] }, { at: [0, -0.225] });

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
// (the forehead and the belly on the floor – 23.10.2026: the realistic golfer lay on its face, the belly in the air)
const PRONE: J = { neck: [-7, 0, 0], head: [-8, 0, 0], shoulderL: [-170, 0, 32], shoulderR: [-170, 0, -32], ankleL: [40, 0, 0], ankleR: [40, 0, 0] };

/** half-kneeling: left foot in front, right knee on the floor */
const HALF_KNEEL: J = {
  hipL: [-82, 0, 6],
  kneeL: [88, 0, 0],
  ankleL: [-6, 0, 0],
  hipR: [-3, 0, -4],
  kneeR: [88, 0, 0],
  ankleR: [60, 0, 0],
  shoulderL: [-75, 0, 8],
  shoulderR: [-75, 0, -8],
};

/** standing on the left leg, the right foot up beside the left calf, arms crossed */
const REACH_START = stand({ ...ARMS_CROSSED, kneeL: [10, 0, 0], hipR: [-30, 0, -2], kneeR: [65, 0, 0] });
/** the left hand holds a stick in front of the body (90/90 stretch) */
const STICK_L: J = { shoulderL: [-55, 0, -20], elbowL: [-25, 0, 0] };

/** hands behind the head, elbows out (the deep squat retest) */
const HANDS_HEAD: J = { shoulderL: [0, 90, 120], shoulderR: [0, -90, -120], elbowL: [-140, 0, 0], elbowR: [-140, 0, 0] };

/** The retests (TPI breakouts): the deep squat with the hands behind the head instead of the stick overhead. */
export const RETEST_CLIPS = {
  squatHands: {
    ...CLIPS['deep-squat'],
    // from the angle: the depth and the elbows out both show
    view: 'angle',
    views: ['angle', 'side', 'front'],
    props: [],
    keys: CLIPS['deep-squat'].keys.map((x, i) => ({
      ...x,
      pose: { ...x.pose, j: { ...x.pose.j, ...HANDS_HEAD } },
      label: i === 0 ? L('Hands behind the head, elbows out', 'Hände hinter den Kopf, Ellbogen nach außen') : i === 2 ? L('Squat as deep as you can – heels down', 'So tief wie möglich in die Hocke – Fersen unten') : x.label,
    })),
  } as Clip,
};

/**
 * Sitting 90/90 on the floor: the front leg's thigh forward with the shin across in front, the back leg's thigh out to
 * the side with the shin back (hip twisted about the thigh, knees 90°). Left front, the right one mirrored.
 */
const SIT_9090_L: J = { hipL: [-90, 90, 0], kneeL: [90, 0, 0], hipR: [0, 0, -90], kneeR: [90, 0, 0] };
const SIT_9090_R: J = { hipR: [-90, -90, 0], kneeR: [90, 0, 0], hipL: [0, 0, 90], kneeL: [90, 0, 0] };
/** sitting with both knees up, feet flat apart (between the two sides of the switch) */
const SIT_KNEES_UP: J = { hipL: [-135, 0, 22], hipR: [-135, 0, -22], kneeL: [89, 0, 0], kneeR: [89, 0, 0], ankleL: [35, 0, 0], ankleR: [35, 0, 0] };
/** halfway between two positions (each angle) – a key between them, fitted so the body stays where it should */
const mid = (a: J, b: J, extra: J = {}): J => {
  const out: J = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof J>) {
    const x = a[id] ?? [0, 0, 0];
    const y = b[id] ?? [0, 0, 0];
    out[id] = [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2];
  }
  return { ...out, ...extra };
};
/** open hands (flat on the floor) */
const OPEN = { gripL: 0, gripR: 0 };
/** the hands behind on the floor, fingers back, leaning back a little */
const HANDS_BACK: J = { pelvis: [-6, 0, 0], shoulderL: [35, 0, 15], shoulderR: [35, 0, -15], elbowL: [0, 0, 0], elbowR: [0, 0, 0], wristL: [62, 0, 0], wristR: [62, 0, 0] };

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
      k(2.6, quad({ pelvis: [62, 0, 0], hipL: [-62, 0, 3], hipR: [-62, 0, -3], spine: [22, 0, 0], chest: [16, 0, 0], neck: [32, 0, 0], shoulderL: [-119, 0, 5], shoulderR: [-119, 0, -5] }), L('Round the back like a cat – from the pelvis', 'Rücken rund wie eine Katze – aus dem Becken heraus')),
      k(3.4, quad({ pelvis: [62, 0, 0], hipL: [-62, 0, 3], hipR: [-62, 0, -3], spine: [22, 0, 0], chest: [16, 0, 0], neck: [32, 0, 0], shoulderL: [-119, 0, 5], shoulderR: [-119, 0, -5] })),
      k(5.0, quad({ pelvis: [86, 0, 0], hipL: [-86, 0, 3], hipR: [-86, 0, -3], spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [-18, 0, 0], shoulderL: [-45, 0, 5], shoulderR: [-45, 0, -5] }), L('… then let it sag slowly', '… dann langsam durchhängen lassen')),
      k(5.8, quad({ pelvis: [86, 0, 0], hipL: [-86, 0, 3], hipR: [-86, 0, -3], spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [-18, 0, 0], shoulderL: [-45, 0, 5], shoulderR: [-45, 0, -5] })),
      k(7.0, quad()),
    ],
  },
  'mob-thread-needle': {
    view: 'angle',
    plant: ['kneeL', 'kneeR', 'ankleL', 'ankleR'],
    views: ['angle', 'front', 'side'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, quad(), L('On hands and knees', 'Im Vierfüßlerstand')),
      k(1.0, quad()),
      k(2.6, quad({ spine: [0, -18, 0], chest: [0, -26, 0], shoulderR: [-36, 0, 70], elbowR: [-4, 0, 0], wristR: [0, 0, 0], neck: [10, -20, 0], shoulderL: [-40, 0, 5], elbowL: [-30, 0, 0] }), L('Slide the right arm under the body, shoulder towards the floor', 'Rechten Arm unter dem Körper durchschieben, Schulter Richtung Boden')),
      k(3.4, quad({ spine: [0, -18, 0], chest: [0, -26, 0], shoulderR: [-36, 0, 70], elbowR: [-4, 0, 0], wristR: [0, 0, 0], neck: [10, -20, 0], shoulderL: [-40, 0, 5], elbowL: [-30, 0, 0] })),
      k(4.4, quad()),
      k(5.8, quad({ spine: [0, 6, 0], chest: [0, 14, 0], shoulderR: [58, 0, 66], elbowR: [0, 0, 0], wristR: [0, 0, 0], neck: [10, 25, 0], shoulderL: [-69, 0, 4], elbowL: [4, 0, 0] }, { roll: -17 }), L('… then open it up to the ceiling, eyes follow', '… dann zur Decke öffnen, der Blick folgt')),
      k(6.6, quad({ spine: [0, 6, 0], chest: [0, 14, 0], shoulderR: [58, 0, 66], elbowR: [0, 0, 0], wristR: [0, 0, 0], neck: [10, 25, 0], shoulderL: [-69, 0, 4], elbowL: [4, 0, 0] }, { roll: -17 })),
      k(8.0, quad()),
    ],
  },
  'mob-wrist-stretch': {
    view: 'side',
    plant: ['kneeL', 'kneeR', 'wristL', 'wristR'],
    views: ['side', 'angle'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, quad({ wristL: [66, 180, 0], wristR: [66, 180, 0] }), L('On hands and knees, fingers pointing to the knees', 'Im Vierfüßlerstand, die Finger zeigen zu den Knien')),
      k(1.2, quad({ wristL: [66, 180, 0], wristR: [66, 180, 0] })),
      k(2.8, quad(ROCK_BACK), L('Rock gently back – 20 s', 'Sanft nach hinten wippen – 20 s')),
      k(4.2, quad(ROCK_BACK)),
      k(5.6, quad({ wristL: [66, 180, 0], wristR: [66, 180, 0] })),
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

  // ---------- sitting 90/90 on the floor ----------
  'hip-9090': {
    view: 'angle',
    views: ['angle', 'front', 'above'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, P({ ...SIT_9090_L, ...ARMS_CROSSED }), L('Sit 90/90: the left leg in front, the right one to the side', 'Sitz 90/90: das linke Bein vorn, das rechte seitlich')),
      k(1.2, P({ ...SIT_9090_L, ...ARMS_CROSSED })),
      // (the seat stays on the floor through the switch: the legs turn in the hips – keys between, fitted)
      k(1.9, P({ ...mid(SIT_9090_L, SIT_KNEES_UP, { hipL: [-148, 34, 11], hipR: [-103, 24, -56], kneeL: [80, 0, 0], kneeR: [80, 0, 0] }), ...ARMS_CROSSED })),
      k(2.6, P({ ...SIT_KNEES_UP, ...ARMS_CROSSED }), L('Turn both knees to the other side without the hands – sit tall', 'Beide Knie ohne Hände zur anderen Seite drehen – aufrecht sitzen')),
      k(3.3, P({ ...mid(SIT_KNEES_UP, SIT_9090_R, { hipL: [-101, -24, 56], hipR: [-146, -29, -11], kneeL: [73, 0, 0], kneeR: [73, 0, 0] }), ...ARMS_CROSSED })),
      k(4.0, P({ ...SIT_9090_R, ...ARMS_CROSSED })),
      k(5.0, P({ ...SIT_9090_R, ...ARMS_CROSSED }), L('… and back – 10 switches, slowly', '… und zurück – 10 Wechsel, langsam')),
      k(5.7, P({ ...mid(SIT_9090_R, SIT_KNEES_UP, { hipL: [-101, -24, 56], hipR: [-146, -29, -11], kneeL: [73, 0, 0], kneeR: [73, 0, 0] }), ...ARMS_CROSSED })),
      k(6.4, P({ ...SIT_KNEES_UP, ...ARMS_CROSSED })),
      k(7.1, P({ ...mid(SIT_KNEES_UP, SIT_9090_L, { hipL: [-148, 34, 11], hipR: [-103, 24, -56], kneeL: [80, 0, 0], kneeR: [80, 0, 0] }), ...ARMS_CROSSED })),
      k(7.8, P({ ...SIT_9090_L, ...ARMS_CROSSED })),
    ],
  },
  'mob-hip-ir': {
    view: 'front',
    views: ['front', 'angle', 'side'],
    ground: 'all',
    props: ['mat'],
    keys: [
      k(0, P({ ...SIT_9090_L, ...HANDS_BACK }, OPEN), L('Sit 90/90, the hands behind you on the floor', 'Sitz 90/90, die Hände hinter dir am Boden')),
      k(1.0, P({ ...SIT_9090_L, ...HANDS_BACK }, OPEN)),
      k(2.2, P({ ...SIT_9090_L, ...HANDS_BACK, shoulderL: [17, 0, 15], shoulderR: [17, 0, -15], hipR: [0, 50, -76] }, OPEN), L('Lift the back knee and foot off the floor – hold 2 s', 'Das hintere Knie mit dem Fuß vom Boden heben – 2 s halten')),
      k(3.4, P({ ...SIT_9090_L, ...HANDS_BACK, shoulderL: [17, 0, 15], shoulderR: [17, 0, -15], hipR: [0, 50, -76] }, OPEN)),
      k(4.6, P({ ...SIT_9090_L, ...HANDS_BACK }, OPEN), L('Lower – 2 × 8 per side', 'Senken – 2 × 8 pro Seite')),
      k(5.4, P({ ...SIT_9090_L, ...HANDS_BACK }, OPEN)),
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
      k(3.6, side({ shoulderL: [72, 0, 21], chest: [0, 36, 0], spine: [0, 1, 0], neck: [0, 30, 0] }), L('Knees stay together – breathe out, 2 s', 'Knie bleiben zusammen – ausatmen, 2 s')),
      k(4.6, side({ shoulderL: [72, 0, 21], chest: [0, 36, 0], spine: [0, 1, 0], neck: [0, 30, 0] })),
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
      k(2.4, P({ ...PRONE, shoulderL: [-205, 0, 32], shoulderR: [-205, 0, -32], neck: [-16, 0, 0], head: [7, 0, 0] }, { tip: 90 }), L('Shoulder blades down and back – lift the arms', 'Schulterblätter nach hinten unten – Arme anheben')),
      k(3.4, P({ ...PRONE, shoulderL: [-205, 0, 32], shoulderR: [-205, 0, -32], neck: [-16, 0, 0], head: [7, 0, 0] }, { tip: 90 })),
      k(4.6, P(PRONE, { tip: 90 }), L('Lower – 2 × 10', 'Ablegen – 2 × 10')),
      k(5.2, P(PRONE, { tip: 90 })),
    ],
  },

  // ---------- standing ----------
  'mob-single-leg-reach': {
    view: 'angle',
    plant: ['ankleL', 'ankleR'],
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
  'pallof-press': holding({
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
  }),
};

