import { L } from '../types';
import type { Swing, SwingKey } from './golf3d';

// The swings of the 3D videos. Trunk angles in degrees (pelvis, spine, chest – x forward, y + towards the target,
// z + leaning to the player's right); the lead hand in the chest's frame (x to the player's left, y up the spine, z
// forward); the club as a world direction (x towards the target, y up, z towards the ball) or 'ball'.
// Times in seconds as shown: slowed so the eye can follow, back three times as long as down (Tour Tempo 3:1).

const k = (t: number, x: Omit<SwingKey, 't'>): SwingKey => ({ t, ...x });

const ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [32, 0, 2], spine: [6, 0, 0], chest: [6, 0, 5], neck: [-8, 0, 0], head: [16, 0, 0] },
  hands: [0.06, -0.2, 0.42],
  club: 'ball',
};

/** the full swing, face-on: address, takeaway, 9 o'clock, top, down, impact, 3 o'clock, finish */
export const FULL_SWING: Swing = {
  club: 'iron',
  stance: 0.38,
  ball: [0.02, 0.6],
  keys: [
    k(0, { ...ADDRESS, label: L('Set-up', 'Ansprache') }),
    k(0.5, ADDRESS),
    k(1.0, {
      body: { pelvis: [32, -14, 2], spine: [6, -6, 0], chest: [6, -22, 5], neck: [-8, 18, 0], head: [22, 8, 0] },
      hands: [-0.02, -0.24, 0.44],
      club: [-1, 0.08, 0.05],
      label: L('Back in one piece – one', 'Aus einem Guss zurück – eins'),
    }),
    k(1.45, {
      body: { pelvis: [32, -28, 2], spine: [6, -10, 0], chest: [6, -34, 6], neck: [-8, 32, 0], head: [22, 12, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.15, 1, -0.1],
      label: L('Wrists hinge – two', 'Handgelenke winkeln an – zwei'),
    }),
    k(2.0, {
      body: { pelvis: [32, -42, 0], spine: [6, -12, 0], chest: [6, -36, 8], neck: [-8, 44, 0], head: [22, 14, 0] },
      hands: [-0.22, 0.44, 0.16],
      club: [0.9, -0.05, -0.42],
      label: L('The top – three', 'Oben – drei'),
    }),
    k(2.3, {
      body: { pelvis: [32, -42, 0], spine: [6, -12, 0], chest: [6, -36, 8], neck: [-8, 44, 0], head: [22, 14, 0] },
      hands: [-0.22, 0.44, 0.16],
      club: [0.9, -0.05, -0.42],
    }),
    k(2.6, {
      body: { pelvis: [32, -8, 5], spine: [6, -10, 2], chest: [6, -30, 8], neck: [-8, 30, 0], head: [22, 10, 0] },
      hands: [-0.12, -0.08, 0.42],
      club: [-0.45, 0.75, -0.45],
      shift: 0.04,
      label: L('Down from the ground', 'Abschwung vom Boden'),
    }),
    k(2.8, {
      body: { pelvis: [30, 30, 6], spine: [6, 2, 2], chest: [6, -10, 7], neck: [-8, -12, 0], head: [22, -6, 0] },
      hands: [0.1, -0.21, 0.42],
      club: 'ball',
      shift: 0.07,
      label: L('Impact: hands ahead – four', 'Treffmoment: Hände vorn – vier'),
    }),
    k(3.05, {
      body: { pelvis: [24, 55, 4], spine: [4, 8, 0], chest: [4, 18, 2], neck: [-6, -30, 0], head: [18, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.2, 1, 0.15],
      shift: 0.1,
      label: L('Through', 'Durch'),
      free: true,
    }),
    k(3.5, {
      body: { pelvis: [8, 85, 0], spine: [-4, 10, -2], chest: [-6, 14, -6], neck: [-4, -20, 0], head: [6, -8, 0] },
      hands: [0.12, 0.34, 0.3],
      club: [-0.75, -0.25, -0.6],
      shift: 0.12,
      drop: 0.02,
      heel: 1,
      free: true,
      label: L('Hold the finish', 'Finish halten'),
    }),
    k(4.7, {
      body: { pelvis: [8, 85, 0], spine: [-4, 10, -2], chest: [-6, 14, -6], neck: [-4, -20, 0], head: [6, -8, 0] },
      hands: [0.12, 0.34, 0.3],
      club: [-0.75, -0.25, -0.6],
      shift: 0.12,
      drop: 0.02,
      heel: 1,
      free: true,
    }),
  ],
};

FULL_SWING.hit = { at: 2.8, fly: true };

/** the driver: wider stance, the ball forward on a tee, hit on the way up */
export const DRIVER_SWING: Swing = { ...FULL_SWING, club: 'driver', stance: 0.5, ball: [0.16, 0.72], tee: true };

/** the wedge swing from 9 to 3 o'clock (L to L, pitch) */
export const HALF_SWING: Swing = {
  club: 'wedge',
  stance: 0.3,
  ball: [0, 0.56],
  hit: { at: 2.1, fly: true },
  keys: [
    k(0, { ...ADDRESS, label: L('Set-up', 'Ansprache') }),
    k(0.5, ADDRESS),
    k(1.0, {
      body: { pelvis: [32, -12, 2], spine: [6, -6, 0], chest: [6, -18, 5], neck: [-8, 16, 0], head: [22, 6, 0] },
      hands: [-0.02, -0.24, 0.44],
      club: [-1, 0.1, 0.05],
      label: L('The body turns back', 'Der Körper dreht zurück'),
    }),
    k(1.5, {
      body: { pelvis: [32, -24, 2], spine: [6, -8, 0], chest: [6, -30, 6], neck: [-8, 28, 0], head: [22, 10, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.15, 1, -0.1],
      label: L('9 o’clock: lead arm level, shaft up', '9 Uhr: vorderer Arm waagrecht, Schaft nach oben'),
    }),
    k(1.85, {
      body: { pelvis: [32, -24, 2], spine: [6, -8, 0], chest: [6, -30, 6], neck: [-8, 28, 0], head: [22, 10, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.15, 1, -0.1],
    }),
    k(2.1, {
      body: { pelvis: [30, 26, 5], spine: [6, 2, 2], chest: [6, -8, 6], neck: [-8, -10, 0], head: [22, -5, 0] },
      hands: [0.1, -0.21, 0.42],
      club: 'ball',
      shift: 0.05,
      label: L('Ball first, then the grass', 'Erst der Ball, dann das Gras'),
    }),
    k(2.5, {
      body: { pelvis: [24, 50, 4], spine: [4, 8, 0], chest: [4, 16, 2], neck: [-6, -28, 0], head: [18, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.2, 1, 0.15],
      shift: 0.08,
      label: L('3 o’clock: chest to the target', '3 Uhr: Brust zum Ziel'),
      free: true,
    }),
    k(3.5, {
      body: { pelvis: [24, 50, 4], spine: [4, 8, 0], chest: [4, 16, 2], neck: [-6, -28, 0], head: [18, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.2, 1, 0.15],
      shift: 0.08,
      free: true,
    }),
  ],
};

const CHIP_ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [30, 6, 0], spine: [6, 0, -2], chest: [8, 0, -2], neck: [-8, 0, 0], head: [20, 0, 0] },
  hands: [0.1, -0.2, 0.42],
  club: 'ball',
  shift: 0.04,
};

/** the chip: narrow stance, weight and hands forward, the shoulders rock, the wrists stay firm, the finish held */
export const CHIP_STROKE: Swing = {
  club: 'wedge',
  stance: 0.2,
  ball: [-0.03, 0.5],
  hit: { at: 1.55, roll: 2.4 },
  keys: [
    k(0, { ...CHIP_ADDRESS, label: L('Narrow stance, weight and hands forward', 'Schmaler Stand, Gewicht und Hände vorn') }),
    k(0.6, CHIP_ADDRESS),
    k(1.25, {
      ...CHIP_ADDRESS,
      body: { pelvis: [30, 0, 0], spine: [6, -4, -2], chest: [8, -12, -2], neck: [-8, 12, 0], head: [20, 4, 0] },
      hands: [0.04, -0.21, 0.43],
      club: [-0.42, -0.88, 0.2],
      label: L('The shoulders rock, the wrists stay firm', 'Die Schultern schaukeln, die Handgelenke bleiben fest'),
    }),
    k(1.55, { ...CHIP_ADDRESS, label: L('The club brushes the grass', 'Der Schläger streift das Gras') }),
    k(1.9, {
      ...CHIP_ADDRESS,
      body: { pelvis: [28, 20, 0], spine: [6, 6, -2], chest: [8, 12, -2], neck: [-8, -14, 0], head: [20, -6, 0] },
      hands: [0.17, -0.2, 0.43],
      club: [0.45, -0.85, 0.25],
      label: L('The grip leads – hold the finish', 'Der Griff führt – Finish halten'),
    }),
    k(3.0, {
      ...CHIP_ADDRESS,
      body: { pelvis: [28, 20, 0], spine: [6, 6, -2], chest: [8, 12, -2], neck: [-8, -14, 0], head: [20, -6, 0] },
      hands: [0.17, -0.2, 0.43],
      club: [0.45, -0.85, 0.25],
    }),
  ],
};

const PUTT_ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [36, 0, 0], spine: [8, 0, 0], chest: [10, 0, 0], neck: [-10, 0, 0], head: [28, 0, 0] },
  hands: [0.0, -0.24, 0.38],
  club: 'ball',
};

/** the putt: a pendulum from the shoulders, back twice as long as through, the head still */
export const PUTT_STROKE: Swing = {
  club: 'putter',
  stance: 0.3,
  ball: [0.03, 0.46],
  hit: { at: 1.7, roll: 3 },
  keys: [
    k(0, { ...PUTT_ADDRESS, label: L('Eyes over the ball, arms hanging', 'Augen über dem Ball, die Arme hängen') }),
    k(0.6, PUTT_ADDRESS),
    k(1.35, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [10, -9, 0], neck: [-10, 9, 0] },
      hands: [-0.05, -0.24, 0.38],
      club: [-0.3, -0.93, 0.15],
      label: L('The shoulders rock back – tick', 'Die Schultern schaukeln zurück – Tick'),
    }),
    k(1.7, { ...PUTT_ADDRESS, label: L('Through the ball – tock', 'Durch den Ball – Tack') }),
    k(2.05, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [10, 9, 0], neck: [-10, -9, 0] },
      hands: [0.06, -0.24, 0.38],
      club: [0.3, -0.93, 0.15],
      label: L('The head stays still', 'Der Kopf bleibt ruhig'),
    }),
    k(3.2, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [10, 9, 0], neck: [-10, -9, 0] },
      hands: [0.06, -0.24, 0.38],
      club: [0.3, -0.93, 0.15],
    }),
  ],
};

/** a fairway wood from the grass: the driver's swing without a tee */
export const WOOD_SWING: Swing = { ...DRIVER_SWING, tee: false, stance: 0.44, ball: [0.1, 0.68] };
/** from a fairway bunker: the full swing from the sand, ball first */
export const SAND_SWING: Swing = { ...FULL_SWING, sand: true };

/** a swing that stays longer at one key (pause at the top): every later key moves on */
const holdAt = (sw: Swing, at: number, extra: number, label: SwingKey['label']): Swing => ({
  ...sw,
  hit: sw.hit && { ...sw.hit, at: sw.hit.at + (sw.hit.at > at ? extra : 0) },
  keys: sw.keys.flatMap((x) => (x.t === at ? [{ ...x, label: label ?? x.label }, { ...x, t: at + extra, label: undefined }] : x.t > at ? [{ ...x, t: x.t + extra }] : [x])),
});

/** feet together: balance and arms in step with the turn */
export const FEET_SWING: Swing = { ...FULL_SWING, stance: 0.1 };
export const FEET_HALF: Swing = { ...HALF_SWING, stance: 0.1 };
/** a second's pause at the top, then down from the ground */
export const PAUSE_SWING: Swing = holdAt(FULL_SWING, 2.3, 1, L('Pause at the top – one second', 'Pause oben – eine Sekunde'));

/** the set-up held still – turn the view to see it from the front and from behind; the checks are named in turn */
const setup = (sw: Swing, address: Omit<SwingKey, 't'>, checks: SwingKey['label'][]): Swing => ({
  ...sw,
  hit: undefined,
  keys: checks.map((label, i) => k(i * 2.2, { ...address, label })).concat([k(checks.length * 2.2, address)]),
});
export const SETUP_IRON = setup(FULL_SWING, ADDRESS, [
  L('Bend from the hips, back straight', 'Aus der Hüfte beugen, Rücken gerade'),
  L('Knees soft, weight over the middle of the feet', 'Knie leicht gebeugt, Gewicht über der Fußmitte'),
  L('Arms hang from the shoulders, a hand’s width from the thighs', 'Die Arme hängen, eine Handbreit vor den Oberschenkeln'),
  L('Ball in the middle, hands level or slightly ahead', 'Ball in der Mitte, Hände auf Höhe oder leicht vor dem Ball'),
]);
export const SETUP_DRIVER = setup(DRIVER_SWING, ADDRESS, [
  L('Wider stance, ball opposite the lead heel', 'Breiter Stand, Ball gegenüber der vorderen Ferse'),
  L('Spine tilted away from the target', 'Wirbelsäule vom Ziel weg geneigt'),
  L('Teed high: half the ball above the clubface', 'Hoch aufgeteet: halber Ball über der Schlagfläche'),
]);
export const SETUP_CHIP = setup(CHIP_STROKE, CHIP_ADDRESS, [
  L('Narrow stance, ball back of centre', 'Schmaler Stand, Ball hinter der Mitte'),
  L('60–70 % of the weight on the lead foot', '60–70 % des Gewichts vorn'),
  L('Hands ahead of the ball, grip a little shorter', 'Hände vor dem Ball, etwas kürzer greifen'),
]);
export const SETUP_PUTT = setup(PUTT_STROKE, PUTT_ADDRESS, [
  L('Eyes over the ball – look from behind', 'Augen über dem Ball – von hinten ansehen'),
  L('Shoulders parallel to the start line', 'Schultern parallel zur Startlinie'),
  L('Arms hang, light grip pressure', 'Die Arme hängen, leichter Griffdruck'),
]);

/** one hand on the club: putting and chipping with the lead hand only */
export const PUTT_ONE: Swing = { ...PUTT_STROKE, oneHand: true };
export const CHIP_ONE: Swing = { ...CHIP_STROKE, oneHand: true };

// ---------- the faults: the faulty swing next to the right one ----------

/** a swing with some keys changed (by their time) and new labels */
const fault = (sw: Swing, change: Record<number, Partial<SwingKey>>, extra: Partial<Swing> = {}): Swing => ({
  ...sw,
  ...extra,
  keys: sw.keys.map((x) => (change[x.t] ? { ...x, ...change[x.t], body: { ...x.body, ...change[x.t].body } } : x)),
});
const quiet = (sw: Swing): Swing => ({ ...sw, keys: sw.keys.map((x) => ({ ...x, label: undefined })) });

/** fat: the weight stays back, the wrists flip – the club hits the ground behind the ball */
export const FAT: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [32, 12, 2], spine: [6, -4, 6], chest: [6, -16, 12] },
    shift: -0.05,
    drop: 0.08,
    miss: [-0.09, -0.02, 0],
    label: L('Left: weight back, the club hits the ground first – right: weight forward, ball first', 'Links: Gewicht hinten, der Schläger trifft zuerst den Boden – rechts: Gewicht vorn, erst der Ball'),
  },
}, { hit: undefined });
/** thin: the body rises – the leading edge hits the middle of the ball */
export const THIN: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [18, 26, 4], spine: [2, 2, 2], chest: [2, -10, 6] },
    drop: -0.02,
    miss: [0.01, 0.045, 0],
    label: L('Left: the chest rises, the edge hits the ball – right: the posture stays', 'Links: der Brustkorb hebt sich, die Kante trifft den Ball – rechts: die Haltung bleibt'),
  },
});
/** sway: the hips slide away from the target instead of turning */
export const SWAY: Swing = fault(FULL_SWING, {
  2.0: { shift: -0.12, body: { pelvis: [32, -20, -6], chest: [6, -30, 2] }, label: L('Left: the hips slide away – right: they turn', 'Links: die Hüfte gleitet weg – rechts: sie dreht') },
  2.3: { shift: -0.12, body: { pelvis: [32, -20, -6], chest: [6, -30, 2] } },
});
/** early extension: the hips move to the ball, the body stands up – seen from behind */
export const EARLY_EXT: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [14, 30, 6], spine: [2, 2, 2], chest: [4, -10, 7] },
    push: 0.1,
    drop: -0.02,
    miss: [0, 0.03, 0.02],
    label: L('Left: the hips move to the ball, the body stands up – right: the posture stays', 'Links: die Hüfte geht zum Ball, der Körper richtet sich auf – rechts: die Haltung bleibt'),
  },
});

/** pairs for the fault pictures: the fault first (left), the right way (right); z: one behind the other for the view from behind */
export const PAIRS = {
  fatPair: { fault: FAT, right: quiet(FULL_SWING) },
  thinPair: { fault: THIN, right: quiet(FULL_SWING) },
  swayPair: { fault: SWAY, right: quiet(FULL_SWING) },
  earlyPair: { fault: EARLY_EXT, right: quiet(FULL_SWING), behind: true },
};
export type PairId = keyof typeof PAIRS;

export const SWINGS = { full: FULL_SWING, driver: DRIVER_SWING, wood: WOOD_SWING, sand: SAND_SWING, half: HALF_SWING, chip: CHIP_STROKE, putt: PUTT_STROKE, feet: FEET_SWING, feetHalf: FEET_HALF, pause: PAUSE_SWING, setupIron: SETUP_IRON, setupDriver: SETUP_DRIVER, setupChip: SETUP_CHIP, setupPutt: SETUP_PUTT, puttOne: PUTT_ONE, chipOne: CHIP_ONE };
export type SwingId = keyof typeof SWINGS;
