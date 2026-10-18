import { L } from '../types';
import type { Swing, SwingKey } from './golf3d';

type V3 = [number, number, number];

// The swings of the 3D videos. Trunk angles in degrees (pelvis, spine, chest – x forward, y + towards the target,
// z + leaning to the player's right); the lead hand in the chest's frame (x to the player's left, y up the spine, z
// forward); the club as a world direction (x towards the target, y up, z towards the ball) or 'ball'.
// Times in seconds as shown: slowed so the eye can follow, back three times as long as down (Tour Tempo 3:1).

const k = (t: number, x: Omit<SwingKey, 't'>): SwingKey => ({ t, ...x });

const ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [38, 0, 2], spine: [2, 0, 0], chest: [2, 0, 5], neck: [-14, 0, 0], head: [6, 0, 0] },
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
      body: { pelvis: [38, -14, 2], spine: [2, -6, 0], chest: [2, -22, 5], neck: [-14, 18, 0], head: [12, 8, 0] },
      hands: [-0.02, -0.24, 0.44],
      club: [-1, 0.08, 0.05],
      label: L('Back in one piece – one', 'Aus einem Guss zurück – eins'),
    }),
    k(1.45, {
      body: { pelvis: [38, -28, 2], spine: [2, -10, 0], chest: [2, -34, 6], neck: [-14, 32, 0], head: [12, 12, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.1, 0.93, -0.36],
      label: L('Wrists hinge – two', 'Handgelenke winkeln an – zwei'),
    }),
    k(2.0, {
      body: { pelvis: [38, -42, 0], spine: [2, -12, 0], chest: [2, -36, 8], neck: [-14, 44, 0], head: [12, 14, 0] },
      hands: [-0.22, 0.44, 0.16],
      club: [0.95, -0.05, 0.1],
      label: L('The top – three', 'Oben – drei'),
    }),
    k(2.3, {
      body: { pelvis: [38, -42, 0], spine: [2, -12, 0], chest: [2, -36, 8], neck: [-14, 44, 0], head: [12, 14, 0] },
      hands: [-0.22, 0.44, 0.16],
      club: [0.95, -0.05, 0.1],
    }),
    k(2.6, {
      body: { pelvis: [38, -8, 5], spine: [2, -10, 2], chest: [2, -30, 8], neck: [-14, 30, 0], head: [12, 10, 0] },
      hands: [-0.12, -0.08, 0.42],
      club: [-0.45, 0.75, -0.45],
      shift: 0.04,
      label: L('Down from the ground', 'Abschwung vom Boden'),
    }),
    k(2.7, {
      body: { pelvis: [37, 12, 6], spine: [2, -4, 2], chest: [2, -22, 8], neck: [-14, 10, 0], head: [12, 2, 0] },
      hands: [-0.05, -0.17, 0.43],
      club: [-1, 0.06, 0.12],
      shift: 0.06,
    }),
    k(2.8, {
      body: { pelvis: [36, 30, 6], spine: [2, 2, 2], chest: [2, -10, 7], neck: [-14, -12, 0], head: [12, -6, 0] },
      hands: [0.1, -0.21, 0.42],
      club: 'ball',
      shift: 0.07,
      label: L('Impact: hands ahead – four', 'Treffmoment: Hände vorn – vier'),
    }),
    k(2.92, {
      body: { pelvis: [33, 45, 5], spine: [1, 6, 1], chest: [1, 4, 4], neck: [-13, -18, 0], head: [10, -8, 0] },
      hands: [0.16, -0.17, 0.44],
      club: [1, 0.06, 0.12],
      shift: 0.09,
    }),
    k(3.05, {
      body: { pelvis: [30, 55, 4], spine: [0, 8, 0], chest: [0, 18, 2], neck: [-12, -30, 0], head: [8, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.12, 0.93, -0.34],
      shift: 0.1,
      label: L('Through', 'Durch'),
      free: true,
    }),
    k(3.5, {
      body: { pelvis: [8, 85, 0], spine: [-4, 10, -2], chest: [-6, 14, -6], neck: [-10, -20, 0], head: [4, -8, 0] },
      hands: [0.12, 0.34, 0.3],
      club: [-0.75, -0.25, -0.6],
      shift: 0.12,
      drop: 0.02,
      heel: 1,
      free: true,
      label: L('Hold the finish', 'Finish halten'),
    }),
    k(4.7, {
      body: { pelvis: [8, 85, 0], spine: [-4, 10, -2], chest: [-6, 14, -6], neck: [-10, -20, 0], head: [4, -8, 0] },
      hands: [0.12, 0.34, 0.3],
      club: [-0.75, -0.25, -0.6],
      shift: 0.12,
      drop: 0.02,
      heel: 1,
      free: true,
    }),
  ],
};

FULL_SWING.hit = { at: 2.8, shot: 'full' };

/** the driver: wider stance, the ball forward on a tee, hit on the way up */
export const DRIVER_SWING: Swing = { ...FULL_SWING, club: 'driver', stance: 0.5, ball: [0.16, 0.9], tee: true };

/** the wedge swing from 9 to 3 o'clock (L to L, pitch) */
export const HALF_SWING: Swing = {
  club: 'wedge',
  stance: 0.3,
  ball: [0, 0.56],
  hit: { at: 2.1, shot: 'pitch' },
  keys: [
    k(0, { ...ADDRESS, label: L('Set-up', 'Ansprache') }),
    k(0.5, ADDRESS),
    k(1.0, {
      body: { pelvis: [38, -12, 2], spine: [2, -6, 0], chest: [2, -18, 5], neck: [-14, 16, 0], head: [12, 6, 0] },
      hands: [-0.02, -0.24, 0.44],
      club: [-1, 0.1, 0.05],
      label: L('The body turns back', 'Der Körper dreht zurück'),
    }),
    k(1.5, {
      body: { pelvis: [38, -24, 2], spine: [2, -8, 0], chest: [2, -30, 6], neck: [-14, 28, 0], head: [12, 10, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.1, 0.93, -0.36],
      label: L('9 o’clock: lead arm level, shaft up', '9 Uhr: vorderer Arm waagrecht, Schaft nach oben'),
    }),
    k(1.85, {
      body: { pelvis: [38, -24, 2], spine: [2, -8, 0], chest: [2, -30, 6], neck: [-14, 28, 0], head: [12, 10, 0] },
      hands: [-0.1, -0.12, 0.45],
      club: [-0.1, 0.93, -0.36],
    }),
    k(2.1, {
      body: { pelvis: [36, 26, 5], spine: [2, 2, 2], chest: [2, -8, 6], neck: [-14, -10, 0], head: [12, -5, 0] },
      hands: [0.1, -0.21, 0.42],
      club: 'ball',
      shift: 0.05,
      label: L('Ball first, then the grass', 'Erst der Ball, dann das Gras'),
    }),
    k(2.5, {
      body: { pelvis: [30, 50, 4], spine: [0, 8, 0], chest: [0, 16, 2], neck: [-12, -28, 0], head: [8, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.12, 0.93, -0.34],
      shift: 0.08,
      label: L('3 o’clock: chest to the target', '3 Uhr: Brust zum Ziel'),
      free: true,
    }),
    k(3.5, {
      body: { pelvis: [30, 50, 4], spine: [0, 8, 0], chest: [0, 16, 2], neck: [-12, -28, 0], head: [8, -10, 0] },
      hands: [0.12, -0.08, 0.46],
      club: [0.12, 0.93, -0.34],
      shift: 0.08,
      free: true,
    }),
  ],
};

const CHIP_ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [36, 6, 0], spine: [2, 0, -2], chest: [4, 0, -2], neck: [-14, 0, 0], head: [10, 0, 0] },
  hands: [0.1, -0.2, 0.42],
  club: 'ball',
  shift: 0.04,
};

/** the chip: narrow stance, weight and hands forward, the shoulders rock, the wrists stay firm, the finish held */
export const CHIP_STROKE: Swing = {
  club: 'wedge',
  stance: 0.2,
  ball: [-0.03, 0.5],
  hit: { at: 1.55, shot: 'chip' },
  keys: [
    k(0, { ...CHIP_ADDRESS, label: L('Narrow stance, weight and hands forward', 'Schmaler Stand, Gewicht und Hände vorn') }),
    k(0.6, CHIP_ADDRESS),
    k(1.25, {
      ...CHIP_ADDRESS,
      body: { pelvis: [36, 0, 0], spine: [2, -4, -2], chest: [4, -12, -2], neck: [-14, 12, 0], head: [10, 4, 0] },
      hands: [0.04, -0.21, 0.43],
      club: [-0.42, -0.88, 0.2],
      label: L('The shoulders rock, the wrists stay firm', 'Die Schultern schaukeln, die Handgelenke bleiben fest'),
    }),
    k(1.55, { ...CHIP_ADDRESS, label: L('The club brushes the grass', 'Der Schläger streift das Gras') }),
    k(1.9, {
      ...CHIP_ADDRESS,
      body: { pelvis: [34, 20, 0], spine: [2, 6, -2], chest: [4, 12, -2], neck: [-14, -14, 0], head: [10, -6, 0] },
      hands: [0.17, -0.2, 0.43],
      club: [0.45, -0.85, 0.25],
      label: L('The grip leads – hold the finish', 'Der Griff führt – Finish halten'),
    }),
    k(3.0, {
      ...CHIP_ADDRESS,
      body: { pelvis: [34, 20, 0], spine: [2, 6, -2], chest: [4, 12, -2], neck: [-14, -14, 0], head: [10, -6, 0] },
      hands: [0.17, -0.2, 0.43],
      club: [0.45, -0.85, 0.25],
    }),
  ],
};

const PUTT_ADDRESS: Omit<SwingKey, 't'> = {
  body: { pelvis: [42, 0, 0], spine: [4, 0, 0], chest: [6, 0, 0], neck: [-16, 0, 0], head: [18, 0, 0] },
  hands: [0.0, -0.24, 0.38],
  club: 'ball',
};

/** the putt: a pendulum from the shoulders, back twice as long as through, the head still */
export const PUTT_STROKE: Swing = {
  club: 'putter',
  stance: 0.3,
  ball: [0.03, 0.46],
  hit: { at: 1.7, shot: 'putt' },
  keys: [
    k(0, { ...PUTT_ADDRESS, label: L('Eyes over the ball, arms hanging', 'Augen über dem Ball, die Arme hängen') }),
    k(0.6, PUTT_ADDRESS),
    k(1.35, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [6, -9, 0], neck: [-16, 9, 0] },
      hands: [-0.05, -0.24, 0.38],
      club: [-0.3, -0.93, 0.15],
      label: L('The shoulders rock back – tick', 'Die Schultern schaukeln zurück – Tick'),
    }),
    k(1.7, { ...PUTT_ADDRESS, label: L('Through the ball – tock', 'Durch den Ball – Tack') }),
    k(2.05, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [6, 9, 0], neck: [-16, -9, 0] },
      hands: [0.06, -0.24, 0.38],
      club: [0.3, -0.93, 0.15],
      label: L('The head stays still', 'Der Kopf bleibt ruhig'),
    }),
    k(3.2, {
      ...PUTT_ADDRESS,
      body: { ...PUTT_ADDRESS.body, chest: [6, 9, 0], neck: [-16, -9, 0] },
      hands: [0.06, -0.24, 0.38],
      club: [0.3, -0.93, 0.15],
    }),
  ],
};

/** a fairway wood from the grass: the driver's swing without a tee */
export const WOOD_SWING: Swing = { ...DRIVER_SWING, tee: false, stance: 0.44, ball: [0.1, 0.86] };
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
const withProps = (sw: Swing, props: Swing['props']): Swing => ({ ...sw, props });
const quiet = (sw: Swing): Swing => ({ ...sw, keys: sw.keys.map((x) => ({ ...x, label: undefined })) });

/** fat: the weight stays back, the wrists flip – the club hits the ground behind the ball */
export const FAT: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [38, 12, 2], spine: [2, -4, 6], chest: [2, -16, 12] },
    shift: -0.05,
    drop: 0.08,
    miss: [-0.09, -0.02, 0],
    label: L('Left: weight back, the club hits the ground first · right: weight forward, ball first', 'Links: Gewicht hinten, der Schläger trifft zuerst den Boden · rechts: Gewicht vorn, erst der Ball'),
  },
}, { hit: { at: 2.8, shot: 'pitch', scale: 0.35 } });
/** thin: the body rises – the leading edge hits the middle of the ball */
export const THIN: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [18, 26, 4], spine: [0, 2, 2], chest: [0, -10, 6] },
    drop: -0.02,
    miss: [0.01, 0.045, 0],
    label: L('Left: the chest rises, the edge hits the ball · right: the posture stays', 'Links: der Brustkorb hebt sich, die Kante trifft den Ball · rechts: die Haltung bleibt'),
  },
});
/** sway: the hips slide away from the target instead of turning */
export const SWAY: Swing = fault(FULL_SWING, {
  2.0: { shift: -0.12, body: { pelvis: [38, -20, -6], chest: [2, -30, 2] }, label: L('Left: the hips slide away · right: they turn', 'Links: die Hüfte gleitet weg · rechts: sie dreht') },
  2.3: { shift: -0.12, body: { pelvis: [38, -20, -6], chest: [2, -30, 2] } },
});
/** early extension: the hips move to the ball, the body stands up – seen from behind */
export const EARLY_EXT: Swing = fault(FULL_SWING, {
  2.8: {
    body: { pelvis: [14, 30, 6], spine: [0, 2, 2], chest: [0, -10, 7] },
    push: 0.1,
    drop: -0.02,
    miss: [0, 0.03, 0.02],
    label: L('Left: the hips move to the ball, the body stands up · right: the posture stays', 'Links: die Hüfte geht zum Ball, der Körper richtet sich auf · rechts: die Haltung bleibt'),
  },
});

/** the chip faults: fat (weight back, wrists flip), thin (the body rises), slowing down (long back, short through) */
export const CHIP_FAT: Swing = fault(CHIP_STROKE, {
  1.55: {
    body: { pelvis: [36, 0, 4], spine: [2, 0, 4], chest: [4, -4, 8] },
    shift: -0.05,
    drop: 0.08,
    miss: [-0.07, -0.02, 0],
    label: L('Left: weight back, the wrists flip – the ground first · right: weight forward, the grip leads', 'Links: Gewicht hinten, die Handgelenke klappen – zuerst der Boden · rechts: Gewicht vorn, der Griff führt'),
  },
}, { hit: { at: 1.55, shot: 'chip', scale: 0.35 } });
export const CHIP_THIN: Swing = fault(CHIP_STROKE, {
  1.55: {
    body: { pelvis: [20, 6, 0], spine: [0, 0, -2], chest: [0, 0, -2] },
    drop: -0.03,
    miss: [0.01, 0.04, 0],
    label: L('Left: the body rises, the edge hits the ball · right: the body stays down', 'Links: der Körper richtet sich auf, die Kante trifft den Ball · rechts: der Körper bleibt unten'),
  },
}, { hit: { at: 1.55, shot: 'punch', scale: 0.7 } });
export const CHIP_SLOW: Swing = fault(CHIP_STROKE, {
  1.25: { hands: [-0.03, -0.17, 0.43], club: [-0.7, -0.68, 0.2], body: { chest: [4, -20, -2] }, label: L('Left: a long backswing · right: a short one', 'Links: weit ausholen · rechts: kurz ausholen') },
  1.9: { hands: [0.12, -0.2, 0.43], club: [0.12, -0.98, 0.2], body: { chest: [4, 3, -2] }, label: L('Left: braking at the ball · right: longer through, finish held', 'Links: am Ball bremsen · rechts: länger durch, Finish halten') },
  3.0: { hands: [0.12, -0.2, 0.43], club: [0.12, -0.98, 0.2], body: { chest: [4, 3, -2] } },
}, { hit: { at: 1.55, shot: 'chip', scale: 0.5 } });

/** the fairway wood: topped (lifting the ball, the body rises) and fat (too steep, weight back) */
export const WOOD_TOP: Swing = fault(WOOD_SWING, {
  2.8: {
    body: { pelvis: [18, 26, 4], spine: [0, 2, 2], chest: [0, -10, 6] },
    drop: -0.03,
    miss: [0.01, 0.05, 0],
    label: L('Left: lifting the ball – the body rises · right: chest over the ball, sweeping the grass', 'Links: den Ball heben wollen – der Körper richtet sich auf · rechts: Brust über dem Ball, das Gras fegen'),
  },
}, { hit: { at: 2.8, shot: 'putt', scale: 4 } });
export const WOOD_FAT: Swing = fault(WOOD_SWING, {
  2.8: {
    body: { pelvis: [38, 12, 2], spine: [2, -4, 6], chest: [2, -16, 12] },
    shift: -0.05,
    drop: 0.08,
    miss: [-0.1, -0.02, 0],
    label: L('Left: weight back, too steep – the club digs · right: wide and flat, sweeping', 'Links: Gewicht hinten, zu steil – der Schläger gräbt · rechts: weit und flach, fegen'),
  },
}, { hit: { at: 2.8, shot: 'pitch', scale: 0.35 } });
/** the pitch: fat with the arms only and the weight back */
export const PITCH_FAT: Swing = fault(HALF_SWING, {
  2.1: {
    body: { pelvis: [38, 6, 2], spine: [2, -4, 6], chest: [2, -14, 12] },
    shift: -0.05,
    drop: 0.08,
    miss: [-0.08, -0.02, 0],
    label: L('Left: arms only, weight back – the ground first · right: the body turns, weight forward', 'Links: nur die Arme, Gewicht hinten – zuerst der Boden · rechts: der Körper dreht, Gewicht vorn'),
  },
}, { hit: { at: 2.1, shot: 'pitch', scale: 0.35 } });

/** over the top (the slice): the shoulders open first, the club comes down steep from outside and across the ball
 *  from out to in – the ball starts a little left and bends far right; the right way starts down from the ground and
 *  the club drops to the inside */
const overTheTop = (sw: Swing): Swing =>
  fault(
    sw,
    {
      2.6: {
        body: { pelvis: [38, -12, 3], spine: [2, -4, 2], chest: [2, -12, 8], neck: [-14, 14, 0], head: [12, 6, 0] },
        hands: [-0.1, -0.02, 0.5],
        club: [-0.3, 0.9, 0.22],
        shift: 0.01,
        label: L('Left: the shoulders turn first, the club comes from outside · right: down from the ground, the club drops inside', 'Links: die Schultern drehen zuerst auf, der Schläger kommt von außen · rechts: unten beginnen, der Schläger fällt nach innen'),
      },
      2.7: {
        body: { pelvis: [37, 6, 5], spine: [2, 0, 2], chest: [2, -2, 8], neck: [-14, 2, 0], head: [12, 0, 0] },
        hands: [-0.03, -0.15, 0.49],
        club: [-0.7, 0.45, 0.48],
        shift: 0.03,
      },
      2.8: {
        body: { pelvis: [36, 26, 6], spine: [2, 6, 2], chest: [2, 8, 7], neck: [-14, -20, 0], head: [12, -8, 0] },
        shift: 0.04,
        label: L('Left: across the ball from out to in – a slice · right: from the inside – straight', 'Links: von außen nach innen quer zum Ball – Slice · rechts: von innen an den Ball – gerade'),
      },
      2.92: {
        hands: [0.12, -0.2, 0.36],
        club: [0.72, 0.1, -0.62],
      },
    },
    { hit: { at: 2.8, shot: 'full', side: { start: -0.04, bend: 0.02 } } },
  );
export const OVER_THE_TOP = overTheTop(FULL_SWING);
export const DRIVER_SLICE = overTheTop(DRIVER_SWING);

/** rushing: the same positions, but back short and fast and straight down from the top – no 3:1, no moment at the
 *  top; the right one swings 3:1 next to it (the keys of the backswing come sooner, the rest follows as fast as before) */
const RUSH_TIMES: Record<number, number> = { 0: 0, 0.5: 0.5, 1.0: 0.72, 1.45: 0.9, 2.0: 1.1, 2.3: 1.12 };
export const RUSHED: Swing = (() => {
  const back = 2.3 - RUSH_TIMES[2.3];
  const keys = FULL_SWING.keys.map((x) => ({ ...x, t: RUSH_TIMES[x.t] ?? x.t - back, label: undefined as SwingKey['label'] }));
  keys[0].label = L('Set-up', 'Ansprache');
  keys[4].label = L('Left: short and fast back, snatched from the top · right: three back, one down', 'Links: kurz und schnell zurück, oben sofort gerissen · rechts: drei zurück, eins runter');
  keys[8].label = L('Left: at the ball too soon, the body lags behind · right: in rhythm', 'Links: zu früh am Ball, der Körper hängt hinterher · rechts: im Rhythmus');
  // the finish is held until the right one has finished too
  keys[keys.length - 1] = { ...keys[keys.length - 1], t: FULL_SWING.keys[FULL_SWING.keys.length - 1].t };
  return { ...FULL_SWING, keys, hit: { at: 2.8 - back, shot: 'full' } };
})();

/** the bunker shot by the green: stance a little wider, ball forward, the face open, into the sand a hand's width
 *  behind the ball – the sand carries the ball out, high and soft – and through to a full finish */
export const BUNKER_SWING: Swing = {
  ...FULL_SWING,
  club: 'wedge',
  stance: 0.44,
  ball: [0.06, 0.56],
  sand: true,
  hit: { at: 2.8, shot: 'bunker' },
  keys: FULL_SWING.keys.map((x) => ({
    ...x,
    face: 18,
    ...(x.t === 0 ? { label: L('Stance a little wider, ball forward, the face open', 'Etwas breiter stehen, Ball vorn, die Fläche offen') } : {}),
    ...(x.t === 2.8 ? { miss: [-0.045, -0.03, 0] as V3, label: L('Into the sand behind the ball – the sand carries it out', 'In den Sand hinter dem Ball – der Sand trägt ihn heraus') } : {}),
    ...(x.t === 3.5 ? { label: L('Through to a full finish', 'Durch bis ins volle Finish') } : {}),
  })),
};
/** the club stops in the sand: no finish, the ball barely leaves */
const STUCK = { hands: [0.12, -0.22, 0.42] as V3, club: [0.4, -0.92, 0.1] as V3, body: { pelvis: [36, 34, 6] as V3, spine: [2, 4, 2] as V3, chest: [2, -4, 7] as V3, neck: [-14, -14, 0] as V3, head: [12, -6, 0] as V3 }, shift: 0.07, heel: 0, free: false, label: undefined };
export const BUNKER_STUCK: Swing = fault(BUNKER_SWING, {
  2.8: { label: L('Left: the club stops in the sand – the ball stays in · right: through to a full finish', 'Links: der Schläger bleibt im Sand stecken – der Ball bleibt drin · rechts: durch bis ins volle Finish') },
  2.92: STUCK,
  3.05: STUCK,
  3.5: { ...STUCK, label: undefined },
  4.7: STUCK,
}, { hit: { at: 2.8, shot: 'bunker', scale: 0.3 } });
/** thin: the body rises, the club hits the ball before the sand – it shoots low over the green */
export const BUNKER_THIN: Swing = fault(BUNKER_SWING, {
  2.8: {
    body: { pelvis: [18, 26, 4], spine: [0, 2, 2], chest: [0, -10, 6] },
    drop: -0.02,
    miss: [0.01, 0.045, 0],
    label: L('Left: the body rises, the club hits the ball first – it shoots over the green · right: down into the sand behind the ball', 'Links: der Körper richtet sich auf, der Schläger trifft zuerst den Ball – er schießt übers Grün · rechts: unten bleiben, in den Sand hinter dem Ball'),
  },
}, { hit: { at: 2.8, shot: 'punch', scale: 1.6 } });

/** the sky ball off the tee: too steep from the top, the body dips – the top of the driver goes under the ball, it
 *  climbs almost straight up and comes down short; the right one comes from behind, flat, and catches it on the way up */
export const DRIVER_SKY: Swing = fault(DRIVER_SWING, {
  2.6: { hands: [-0.1, -0.02, 0.47], club: [-0.15, 0.95, 0.15] },
  2.7: { hands: [-0.03, -0.13, 0.46], club: [-0.45, 0.85, 0.2] },
  2.8: {
    drop: 0.11,
    miss: [0, -0.035, 0],
    label: L('Left: steep from above, the body dips – the club goes under the ball, it climbs and falls short · right: flat from behind, the ball caught on the way up', 'Links: steil von oben, der Körper sackt ab – der Schläger geht unter den Ball, er steigt und fällt kurz herunter · rechts: flach von hinten, der Ball im Aufschwung getroffen'),
  },
}, { hit: { at: 2.8, shot: 'bunker', scale: 2.6 } });

/** the pitch that brakes: back to the top for a short shot – the body has to slow down at the ball and the club stops
 *  low; the right one swings back to 9 o'clock only and through to 3 o'clock */
const PITCH_TOP = { body: { pelvis: [38, -38, 0] as V3, spine: [2, -12, 0] as V3, chest: [2, -36, 8] as V3, neck: [-14, 42, 0] as V3, head: [12, 14, 0] as V3 }, hands: [-0.22, 0.44, 0.16] as V3, club: [0.95, -0.05, 0.1] as V3 };
const PITCH_BRAKE = { body: { pelvis: [36, 22, 5] as V3, spine: [2, 2, 2] as V3, chest: [2, -6, 6] as V3, neck: [-14, -8, 0] as V3, head: [12, -4, 0] as V3 }, hands: [0.12, -0.21, 0.43] as V3, club: [0.32, -0.92, 0.15] as V3, shift: 0.04, free: false };
export const PITCH_SLOW: Swing = fault(HALF_SWING, {
  1.5: { ...PITCH_TOP, label: L('Left: far too long back for a short pitch · right: back to 9 o’clock', 'Links: viel zu weit ausgeholt für einen kurzen Pitch · rechts: bis 9 Uhr') },
  1.85: PITCH_TOP,
  2.5: { ...PITCH_BRAKE, label: L('Left: it has to brake at the ball – the club stops low · right: through to 3 o’clock', 'Links: er muss am Ball bremsen – der Schläger bleibt unten stehen · rechts: durch bis 3 Uhr') },
  3.5: PITCH_BRAKE,
}, { hit: { at: 2.1, shot: 'pitch', scale: 0.55 } });

// ---------- the drills that fix the faults, with their aids in the picture (18.10.2026) ----------

/** a swing with new labels on some keys (by their time) */
const relabel = (sw: Swing, labels: Record<number, SwingKey['label']>, extra: Partial<Swing> = {}): Swing => ({
  ...sw,
  ...extra,
  keys: sw.keys.map((x) => (labels[x.t] !== undefined ? { ...x, label: labels[x.t] } : x)),
});
/** Tiger Woods' gate: two tees just outside heel and toe of the putter, a straight 1.2 m putt */
export const TIGER_GATE: Swing = relabel(PUTT_STROKE, { 1.7: L('The putter passes the gate without touching a tee', 'Der Putter passiert das Tor, ohne einen Tee zu berühren') }, { props: ['teeGate'], hit: { at: 1.7, shot: 'putt', scale: 0.69 } });
/** the start-line gate: two tees 40 cm in front of the ball, a little more than a ball apart */
export const START_GATE: Swing = relabel(PUTT_STROKE, { 1.7: L('The ball rolls through the gate – the face was square', 'Der Ball rollt durchs Tor – die Fläche war square') }, { props: ['startGate'], hit: { at: 1.7, shot: 'putt', scale: 1.4 } });
/** the line drill: the ball on a line across the stance, the divot starts at or after the line */
export const LINE_DRILL: Swing = relabel(FULL_SWING, { 0: L('The ball on the line across the stance', 'Der Ball auf der Linie quer zum Stand'), 2.8: L('The divot starts at the line or after it', 'Das Divot beginnt an oder nach der Linie') }, { props: ['groundLine'], view: 'angle' });
/** ball, then tee: a tee pushed in 6 cm in front of the ball – the club takes it out after the ball */
export const TEE_AFTER: Swing = relabel(FULL_SWING, { 2.8: L('Ball first, then the tee – it flies out with the turf', 'Erst der Ball, dann der Tee – er fliegt mit dem Rasen heraus') }, { props: ['teeAfter'], view: 'angle' });
/** the gate from the inside: the outer tee behind the ball, the inner one in front of it, seen from above */
export const INSIDE_GATE: Swing = relabel(FULL_SWING, { 2.8: L('From the inside: inside the back tee, outside the front one', 'Von innen: innen am hinteren, außen am vorderen Tee vorbei') }, { props: ['insideGate'], view: 'above' });
/** the headcover outside and behind the ball: the club comes from the inside and misses it */
export const HEADCOVER: Swing = relabel(FULL_SWING, { 2.7: L('The club comes from the inside – past the headcover', 'Der Schläger kommt von innen – an der Haube vorbei') }, { props: ['headcover'], view: 'above' });
/** sweeping the tee: the fairway wood off a very low tee, the tee flies, no divot */
export const SWEEP_TEE: Swing = relabel(WOOD_SWING, { 2.8: L('Sweep it – the tee flies, no divot', 'Fegen – der Tee fliegt mit, kein Divot') }, { tee: true, lowTee: true, props: ['teeFlies'] });
/** the second tee: the driver rises through the ball and leaves the low tee in front standing */
export const SECOND_TEE: Swing = relabel(DRIVER_SWING, { 2.8: L('The club rises – the second tee stays standing', 'Der Schläger steigt – der zweite Tee bleibt stehen') }, { props: ['secondTee'], view: 'angle' });
/** the impact bag: slow half swings into the bag, stopped at impact */
export const IMPACT_BAG: Swing = {
  ...HALF_SWING,
  noBall: true,
  hit: undefined,
  props: ['impactBag'],
  keys: [
    ...HALF_SWING.keys.filter((x) => x.t <= 2.1).map((x) => (x.t === 2.1 ? { ...x, label: L('Stop at impact: hands ahead, buckle to the bag, weight forward, lead wrist flat', 'Im Treffmoment stoppen: Hände vorn, Gürtelschnalle zum Sack, Gewicht vorn, vorderes Handgelenk gerade') } : x)),
    { ...HALF_SWING.keys.find((x) => x.t === 2.1)!, t: 3.6, label: undefined },
  ],
};
/** the step drill: feet together, the lead foot steps towards the target during the backswing, the weight is
 *  forward before the club comes down */
export const STEP_DRILL: Swing = {
  ...FULL_SWING,
  stance: 0.1,
  ball: [0.05, 0.6],
  keys: FULL_SWING.keys.map((x) => {
    if (x.t === 0) return { ...x, label: L('Feet together, ball opposite the lead foot', 'Füße zusammen, Ball gegenüber dem vorderen Fuß') };
    if (x.t === 1.45) return { ...x, stance: 0.24, step: 0.07, label: L('During the backswing the lead foot steps towards the target', 'Während des Ausholens tritt der vordere Fuß Richtung Ziel') };
    if (x.t >= 2.0) return { ...x, stance: 0.38, shift: (x.shift ?? 0) + 0.06, ...(x.t === 2.0 ? { label: L('Foot down – the weight is forward before the club comes', 'Fuß aufsetzen – das Gewicht ist vorn, bevor der Schläger kommt') } : {}) };
    return x;
  }),
};
/** the pump drill: to the top, down until the hands are at hip height and back up – twice; the third time through */
const PUMP_DOWN = FULL_SWING.keys.find((x) => x.t === 2.6)!;
const TOP = FULL_SWING.keys.find((x) => x.t === 2.0)!;
export const PUMP_DRILL: Swing = {
  ...FULL_SWING,
  hit: { at: 2.8 + 1.8, shot: 'full' },
  keys: [
    ...FULL_SWING.keys.filter((x) => x.t <= 2.0),
    { ...PUMP_DOWN, t: 2.45, label: L('Pump: hands to hip height, the butt to the ball line – one', 'Pumpen: Hände bis Hüfthöhe, das Griffende zur Balllinie – eins') },
    { ...TOP, t: 2.9, label: undefined },
    { ...PUMP_DOWN, t: 3.35, label: L('And again – two', 'Und noch einmal – zwei') },
    { ...TOP, t: 3.8, label: L('The third time: through to the ball', 'Beim dritten Mal: durch zum Ball') },
    ...FULL_SWING.keys.filter((x) => x.t > 2.3).map((x) => ({ ...x, t: x.t + 1.8 })),
  ],
};

// ---------- the ball flight laws (18.10.2026) ----------

/** the flight from path and face (degrees, + right of the target): it starts mostly where the face looks and bends
 *  away from the path – the more the face is open or closed to the path, the more it curves */
const flight = (path: number, face: number) => ({ start: Math.tan(((0.85 * face + 0.15 * path) * Math.PI) / 180), bend: 0.003 * (face - path) });
const lawsOf = (sw: Swing, path: number, face: number, labels: Record<number, SwingKey['label']>, extra: Partial<Swing> = {}): Swing =>
  relabel({ ...sw, keys: sw.keys.map((x) => (x.t >= 2.8 ? { ...x, face: face + (x.t > 2.8 ? (face - path) * 1.5 : 0) } : x)) }, labels, {
    laws: { path, face },
    hit: { at: 2.8, shot: 'full', side: flight(path, face) },
    ...extra,
  });
/** the slice: the path from out to in (green), the face open to it (white) – it starts a little left and bends far
 *  right */
export const SLICE_LAWS: Swing = lawsOf(OVER_THE_TOP, -8, -2, {
  2.6: L('The shoulders open first, the club comes from outside', 'Die Schultern drehen zuerst auf, der Schläger kommt von außen'),
  2.8: L('Path out to in (green), the face open to the path (white; angles drawn larger) – it starts a little left and curves far right', 'Bahn von außen nach innen (grün), die Fläche offen zur Bahn (weiß; Winkel überzeichnet) – er startet leicht links und dreht stark nach rechts'),
}, { view: 'side' });
/** in to out: the club drops to the inside and swings out to the right after impact, the hands roll over */
const IN_TO_OUT: Swing = fault(FULL_SWING, {
  2.6: { hands: [-0.14, -0.1, 0.4], club: [-0.55, 0.6, -0.58], body: { pelvis: [38, -14, 5], spine: [2, -12, 2], chest: [2, -36, 8], neck: [-14, 34, 0], head: [12, 12, 0] }, label: undefined },
  2.7: { club: [-0.95, 0.12, -0.28], body: { pelvis: [37, 4, 6], spine: [2, -8, 2], chest: [2, -30, 8], neck: [-14, 18, 0], head: [12, 4, 0] } },
  2.92: { hands: [0.16, -0.17, 0.48], club: [0.7, 0.1, 0.65] },
});
/** the hook: the path from in to out (green), the face closed to it (white) – it starts a little right and bends far
 *  left */
export const HOOK_LAWS: Swing = lawsOf(IN_TO_OUT, 8, 2, {
  2.6: L('The club drops far to the inside', 'Der Schläger fällt weit nach innen'),
  2.8: L('Path in to out (green), the face closed to the path (white; angles drawn larger) – it starts a little right and curves far left', 'Bahn von innen nach außen (grün), die Fläche geschlossen zur Bahn (weiß; Winkel überzeichnet) – er startet leicht rechts und dreht stark nach links'),
}, { view: 'side' });
/** draw and fade on purpose: a little from the inside with the face a little closed to the path, a little from the
 *  outside with it a little open – both come back to the target */
export const DRAW_LAWS: Swing = lawsOf(FULL_SWING, 4, 2.2, {
  2.8: L('Left: draw – path a little in to out, the face slightly closed to it · right: fade – the other way round', 'Links: Draw – Bahn leicht von innen nach außen, die Fläche leicht geschlossen dazu · rechts: Fade – umgekehrt'),
});
export const FADE_LAWS: Swing = lawsOf(FULL_SWING, -4, -2.2, {});
/** the nine ball flights from one spot: straight, fade, draw – push, push-slice, push-draw – pull, pull-hook, pull-fade */
export const NINE_FLIGHTS: Swing = relabel(FULL_SWING, {
  2.8: L('Starts straight: straight, fade, draw · starts right: push, push slice, push draw · starts left: pull, pull hook, pull fade', 'Startet gerade: gerade, Fade, Draw · startet rechts: Push, Push-Slice, Push-Draw · startet links: Pull, Pull-Hook, Pull-Fade'),
}, {
  view: 'side',
  fan: [
    { start: 0, bend: 0.01 },
    { start: 0, bend: -0.01 },
    { start: 0.11, bend: 0 },
    { start: 0.11, bend: 0.014 },
    { start: 0.11, bend: -0.016 },
    { start: -0.11, bend: 0 },
    { start: -0.11, bend: -0.014 },
    { start: -0.11, bend: 0.016 },
  ],
});

// ---------- where the ball meets the face (18.10.2026) ----------

/** the shank: the weight goes to the toes, the club comes closer to the ball than at address – the hosel meets it and
 *  it shoots off sharply to the right */
export const SHANK: Swing = fault({ ...FULL_SWING, faceView: true }, {
  2.8: {
    push: 0.04,
    miss: [0, 0, 0.045],
    label: L('Left: the weight on the toes, the hosel meets the ball – it shoots off right · right: from the middle of the face', 'Links: Gewicht auf den Zehen, der Schlägerhals trifft den Ball – er schießt nach rechts weg · rechts: aus der Mitte der Fläche'),
  },
}, { hit: { at: 2.8, shot: 'punch', scale: 0.6, side: { start: 0.7, bend: 0 } } });
/** a toe hit with the driver: shorter, and the gear effect turns it left (a heel hit: right) */
export const DRIVER_TOE: Swing = fault({ ...DRIVER_SWING, faceView: true }, {
  2.8: {
    push: -0.025,
    miss: [0, 0, -0.03],
    label: L('Left: off the toe – shorter, the ball turns left (off the heel: right) · right: from the middle', 'Links: an der Spitze getroffen – kürzer, der Ball dreht nach links (an der Ferse: nach rechts) · rechts: aus der Mitte'),
  },
}, { hit: { at: 2.8, shot: 'full', scale: 0.82, side: { start: 0.01, bend: -0.012 } } });

// ---------- length control (18.10.2026) ----------

/** a chip to a landing spot: the ball comes down in the ring and rolls to the hole */
const CHIP_TARGET = { carry: 1.1, hole: 2.6 };
export const CHIP_LAND: Swing = relabel(CHIP_STROKE, { 1.55: L('Land it in the ring – it rolls out to the hole', 'Im Ring landen – er rollt zum Loch aus') }, { landing: CHIP_TARGET, view: 'angle' });
/** the wrong length: no landing spot, a different motion each time – it comes down short of the ring and stops short */
export const CHIP_SHORT: Swing = fault(CHIP_STROKE, {
  1.55: { label: L('Left: no landing spot, a different motion – short again · right: down in the ring, out to the hole', 'Links: kein Landepunkt, jedes Mal eine andere Bewegung – wieder zu kurz · rechts: im Ring gelandet, zum Loch ausgerollt') },
}, { hit: { at: 1.55, shot: 'chip', scale: 0.62 }, landing: CHIP_TARGET });
/** the clock: the same rhythm, the backswing to 8, 9 or 10 o'clock – three lengths, each landing in its ring */
const clockPitch = (hands: V3, club: V3, chestTurn: number, scale: number, labels: Record<number, SwingKey['label']> = {}): Swing => {
  const back = { hands, club, body: { pelvis: [38, -chestTurn * 0.75, 2] as V3, spine: [2, -8, 0] as V3, chest: [2, -chestTurn, 6] as V3, neck: [-14, chestTurn * 0.9, 0] as V3, head: [12, 10, 0] as V3 } };
  const sw = fault(HALF_SWING, { 1.5: back, 1.85: back }, { hit: { at: 2.1, shot: 'pitch', scale }, landing: { carry: 2.6 * scale } });
  return { ...sw, keys: sw.keys.map((x) => ({ ...x, label: labels[x.t] ?? (x.t === 0 ? L('Set-up', 'Ansprache') : undefined) })) };
};
export const PITCH_8: Swing = clockPitch([-0.04, -0.2, 0.44], [-0.8, 0.55, -0.2], 22, 0.62, {
  1.5: L('Left 8 o’clock · middle 9 · right 10 – the same rhythm', 'Links 8 Uhr · Mitte 9 Uhr · rechts 10 Uhr – derselbe Rhythmus'),
  2.1: L('Three backswings, three lengths – your wedge table', 'Drei Ausholweiten, drei Längen – deine Wedge-Tabelle'),
});
export const PITCH_9: Swing = clockPitch([-0.1, -0.12, 0.45], [-0.1, 0.93, -0.36], 30, 0.85);
export const PITCH_10: Swing = clockPitch([-0.17, 0.12, 0.38], [0.45, 0.85, -0.25], 35, 1.05);
/** the bunker ladder: the same clock from the sand – face open, into the sand behind the ball, the same speed; the
 *  length of the swing sets the length of the shot */
const clockSand = (pitch: Swing, scale: number, labels: Record<number, SwingKey['label']> = {}): Swing => ({
  ...pitch,
  stance: 0.44,
  ball: [0.06, 0.56],
  sand: true,
  hit: { at: 2.1, shot: 'bunker', scale },
  landing: { carry: 2.2 * scale },
  keys: pitch.keys.map((x) => ({ ...x, face: 18, ...(x.t === 2.1 ? { miss: [-0.045, -0.03, 0] as V3 } : {}), label: labels[x.t] ?? (x.t === 0 ? L('Set-up', 'Ansprache') : undefined) })),
});
export const SAND_8: Swing = clockSand(PITCH_8, 0.8, {
  1.5: L('Left 8 o’clock · middle 9 · right 10 – the same speed', 'Links 8 Uhr · Mitte 9 Uhr · rechts 10 Uhr – dasselbe Tempo'),
  2.1: L('The length of the swing sets the length – not the speed', 'Die Schwunglänge bestimmt die Länge – nicht das Tempo'),
});
export const SAND_9: Swing = clockSand(PITCH_9, 1.1);
export const SAND_10: Swing = clockSand(PITCH_10, 1.4);

// ---------- bunker drills (18.10.2026) ----------
/** the line in the sand: the club goes in right at the line, the ball 4 cm in front of it comes out with the sand */
export const SAND_LINE: Swing = relabel(BUNKER_SWING, { 2.8: L('Into the sand at the line – the ball in front of it comes out', 'An der Linie in den Sand – der Ball davor kommt mit heraus') }, { props: ['sandLine'], view: 'angle' });
/** splash without a ball: only the sand flies, a long and flat mark */
export const SAND_SPLASH: Swing = relabel(BUNKER_SWING, { 2.8: L('Splash the sand onto the green – a soft “plop”, a long flat mark', 'Sand aufs Grün spritzen – ein weiches „Plopp“, eine lange flache Spur') }, { noBall: true, view: 'angle' });
/** the banknote frame: in at the back line, out at the front one – the whole frame of sand flies */
export const SAND_FRAME: Swing = relabel(BUNKER_SWING, { 2.8: L('In at the back line, out at the front one – the whole frame flies', 'An der hinteren Linie hinein, an der vorderen heraus – der ganze Rahmen fliegt') }, { props: ['sandFrame'], view: 'angle' });

// ---------- the punch under the branches (18.10.2026) ----------
/** the punch: ball back, a shorter backswing, hands ahead at impact, a short finish with the hands low – the ball
 *  stays under the branch */
const PUNCH_FINISH = { hands: [0.14, -0.14, 0.45] as V3, club: [0.9, 0.3, -0.2] as V3, body: { pelvis: [32, 42, 4] as V3, spine: [0, 8, 0] as V3, chest: [0, 12, 2] as V3, neck: [-12, -20, 0] as V3, head: [8, -8, 0] as V3 }, shift: 0.1, free: true };
export const PUNCH: Swing = {
  ...fault({ ...HALF_SWING, club: 'iron', ball: [-0.05, 0.6] }, {
    0: { label: L('Ball back, less loft, weight forward', 'Ball zurück, weniger Loft, Gewicht vorn') },
    2.1: { shift: 0.08, label: L('Hands ahead at impact', 'Im Treffmoment Hände vorn') },
    2.5: { ...PUNCH_FINISH, label: L('A short finish with the hands low – the ball stays under the branch', 'Kurzes Finish mit tiefen Händen – der Ball bleibt unter dem Ast') },
    3.5: PUNCH_FINISH,
  }, { hit: { at: 2.1, shot: 'punch', scale: 1.3 } }),
  props: ['trees'],
  view: 'side',
};
/** the punch that goes up: ball too far forward, the hands flip at impact – too much loft, up into the branches */
export const PUNCH_HIGH: Swing = fault({ ...PUNCH, ball: [0.06, 0.6] }, {
  2.1: { shift: 0, miss: [0.01, 0.01, 0], label: L('Left: ball forward, the hands flip – up into the branches · right: ball back, hands ahead – under them', 'Links: Ball vorn, die Hände klappen – hoch in die Äste · rechts: Ball zurück, Hände vorn – darunter durch') },
  2.5: { hands: [0.06, 0.2, 0.36], club: [0.3, 0.9, -0.3], body: { pelvis: [30, 46, 4], spine: [0, 8, 0], chest: [0, 16, 2], neck: [-12, -24, 0], head: [8, -8, 0] }, label: undefined },
  3.5: { hands: [0.06, 0.2, 0.36], club: [0.3, 0.9, -0.3] },
}, { hit: { at: 2.1, shot: 'pitch', scale: 3, lift: 0.72, stop: 5.05 } });

// ---------- the last drawings in 3D (18.10.2026) ----------
/** the fried egg: face square, ball in the middle, weight forward; steep and hard into the sand just behind the
 *  ball – the club stays in the sand, the ball comes out low and rolls a lot */
export const FRIED_EGG: Swing = fault({ ...BUNKER_SWING, ball: [0, 0.56], sunk: 0.016, keys: BUNKER_SWING.keys.map((x) => ({ ...x, face: 0, shift: (x.shift ?? 0) + 0.03 })) }, {
  0: { label: L('Face square or slightly closed, ball in the middle, weight forward', 'Fläche square oder leicht geschlossen, Ball in der Mitte, Gewicht vorn') },
  1.45: { label: L('A steep backswing', 'Steil ausholen') },
  2.8: { miss: [-0.03, -0.05, 0], label: L('Hard down just behind the ball – the club stays in the sand', 'Kräftig knapp hinter dem Ball nach unten – der Schläger bleibt im Sand') },
  2.92: STUCK,
  3.05: STUCK,
  3.5: { ...STUCK, label: L('Hardly any finish – the ball comes out low and rolls a lot', 'Kaum ein Finish – der Ball kommt flach heraus und rollt viel') },
  4.7: STUCK,
}, { hit: { at: 2.8, shot: 'chip', scale: 2, lift: 0.9 }, view: 'angle' });
/** weight forward in the bunker: the trail foot pulled back and on its toes – the low point stays in one place */
export const SAND_TRAIL_TOE: Swing = relabel({ ...BUNKER_SWING, trailToe: true, keys: BUNKER_SWING.keys.map((x) => ({ ...x, shift: (x.shift ?? 0) + 0.04 })) }, {
  0: L('Trail foot back and up on its toes – the weight on the lead foot', 'Hinteren Fuß zurück und auf die Zehen – das Gewicht auf dem vorderen Fuß'),
  2.8: L('The low point stays in the same spot – into the sand behind the ball', 'Der tiefste Punkt bleibt an derselben Stelle – hinter dem Ball in den Sand'),
}, { view: 'angle' });
/** the ball in an old divot: a little back, hands and weight forward, steeper, down and through, a short finish */
export const DIVOT_LIE: Swing = {
  ...relabel(PUNCH, {
    0: L('Ball a little back, hands ahead, weight forward', 'Ball etwas zurück, Hände vorn, Gewicht vorn'),
    2.1: L('Steeper – down and through', 'Steiler – nach unten und durch'),
    2.5: L('A short finish – the ball flies lower and runs more', 'Kurzes Finish – der Ball fliegt flacher und rollt mehr'),
  }),
  sunk: 0.008,
  props: ['oldDivot'],
  view: 'angle',
};
/** the chip with the hybrid: gripped down to the shaft, a putting stroke – the ball hops briefly and rolls */
export const HYBRID_CHIP: Swing = relabel({ ...PUTT_STROKE, club: 'hybrid', choke: 0.14, ball: [0.02, 0.5], hit: { at: 1.7, shot: 'chip', scale: 1.4, lift: 0.4 } }, {
  0: L('Hybrid gripped down to the shaft, stand like for a putt', 'Hybrid bis an den Schaft gegriffen, stehen wie beim Putten'),
  1.35: L('A putting stroke from the shoulders', 'Eine Puttbewegung aus den Schultern'),
  1.7: L('The ball hops briefly and rolls', 'Der Ball hüpft kurz und rollt'),
}, { view: 'angle' });
/** the lob: face open before the grip, a wider stance, ball forward, with speed along the body line – the sole
 *  slides under the ball, it goes up high and lands soft */
export const LOB: Swing = relabel({ ...FULL_SWING, club: 'wedge', stance: 0.46, ball: [0.07, 0.58], hit: { at: 2.8, shot: 'pitch', scale: 0.85, lift: 2.2 }, keys: FULL_SWING.keys.map((x) => ({ ...x, face: 24 })) }, {
  0: L('Open the face, then grip – wider, ball forward', 'Fläche öffnen, dann greifen – breiter, Ball vorn'),
  2.6: L('With speed along the body line', 'Mit Tempo entlang der Körperlinie'),
  2.8: L('The sole slides under the ball', 'Die Sohle gleitet unter den Ball'),
  3.5: L('High and soft – it lands almost without roll', 'Hoch und weich – er landet fast ohne Rollen'),
}, { view: 'angle' });
/** lead arm only: a short iron gripped down, the trail hand on the chest; the chest's turn moves the arm */
export const LEAD_ARM: Swing = relabel({ ...HALF_SWING, club: 'iron', choke: 0.04, oneHand: true }, {
  0: L('Short iron, grip down, the trail hand on the chest', 'Kurzes Eisen, kurz greifen, die hintere Hand auf der Brust'),
  1.5: L('The turn of the chest moves the arm', 'Die Drehung der Brust bewegt den Arm'),
  2.1: L('The wrist stays flat at impact', 'Das Handgelenk bleibt im Treffmoment gerade'),
});
/** sand on the face: a slow swing without a ball, back over the trail shoulder and through over the lead one – the
 *  face stays open, so the sand stays on it */
export const SAND_ON_FACE: Swing = relabel({ ...HALF_SWING, hit: undefined, noBall: true, sand: true, props: ['faceSand'], faceView: true, keys: HALF_SWING.keys.map((x) => ({ ...x, t: x.t * 1.5, face: 22, label: undefined })) }, {
  0: L('A little sand on the open face of the sand wedge', 'Etwas Sand auf der offenen Fläche des Sandwedges'),
  2.25: L('Slowly back over the trail shoulder – the sand stays on', 'Langsam zurück über die hintere Schulter – der Sand bleibt liegen'),
  3.75: L('Through over the lead shoulder – the face stays open', 'Durch über die vordere Schulter – die Fläche bleibt offen'),
}, { view: 'angle' });
/** the flyer: the same wedge from light rough and from the fairway – grass between face and ball takes the spin
 *  away, the ball flies lower and further and runs on over the green */
const WEDGE_TO_PIN: Swing = { ...FULL_SWING, club: 'wedge', hit: { at: 2.8, shot: 'pitch', scale: 2.4 } };
export const FLYER: Swing = relabel(quiet({ ...WEDGE_TO_PIN, props: ['rough'], sunk: 0.004, hit: { at: 2.8, shot: 'pitch', scale: 3.4, lift: 0.5 } }), {
  0: L('Left: the ball in light rough · right: on the fairway – the same wedge', 'Links: der Ball im leichten Rough · rechts: auf dem Fairway – dasselbe Wedge'),
  2.8: L('Left: grass between face and ball – less spin, lower and further · right: it comes down at the flag', 'Links: Gras zwischen Fläche und Ball – weniger Spin, flacher und weiter · rechts: er kommt an der Fahne herunter'),
  3.5: L('Left: over the green – from the rough plan for the ball to run', 'Links: über das Grün – aus dem Rough mit Ausrollen planen'),
});

/** short and armsy: the upper back hardly turns, the arms swing up past the body */
export const ARMSY: Swing = fault(FULL_SWING, {
  1.0: { body: { pelvis: [38, -6, 2], spine: [2, -2, 0], chest: [2, -8, 5], neck: [-14, 8, 0], head: [12, 4, 0] }, label: L('Left: only the arms swing · right: the upper back turns', 'Links: nur die Arme schwingen · rechts: der obere Rücken dreht') },
  1.45: { body: { pelvis: [38, -12, 2], spine: [2, -4, 0], chest: [2, -14, 6], neck: [-14, 16, 0], head: [12, 6, 0] }, label: undefined },
  2.0: { body: { pelvis: [38, -16, 0], spine: [2, -4, 0], chest: [2, -18, 8], neck: [-14, 22, 0], head: [12, 6, 0] }, hands: [-0.3, 0.4, 0.2], club: [0.6, 0.6, -0.1], label: L('Left: the turn ends early · right: a full turn to the top', 'Links: die Drehung endet früh · rechts: volle Drehung bis oben') },
  2.3: { body: { pelvis: [38, -16, 0], spine: [2, -4, 0], chest: [2, -18, 8], neck: [-14, 22, 0], head: [12, 6, 0] }, hands: [-0.3, 0.4, 0.2], club: [0.6, 0.6, -0.1] },
  2.6: { body: { pelvis: [38, -2, 5], spine: [2, -4, 2], chest: [2, -14, 8], neck: [-14, 14, 0], head: [12, 4, 0] }, label: undefined },
}, { hit: { at: 2.8, shot: 'full', scale: 0.8 } });

// ---------- uneven lies: the ground tilts, the set-up and the flight follow the slope ----------

/** a swing on a slope: every key moved (weight, the labels of the set-up and the finish) */
const onSlope = (sw: Swing, extra: Partial<Swing>, shift: number, labels: Record<number, SwingKey['label']>, keyExtra: Record<number, Partial<SwingKey>> = {}): Swing => ({
  ...sw,
  ...extra,
  keys: sw.keys.map((x) => ({ ...x, shift: (x.shift ?? 0) + shift, ...keyExtra[x.t], ...(labels[x.t] !== undefined ? { label: labels[x.t] } : {}) })),
});
/** uphill: shoulders along the slope, weight on the lower trail foot, ball a little forward; the slope adds loft –
 *  higher and shorter, it tends to go left */
export const SLOPE_UP: Swing = onSlope(FULL_SWING, { slope: { up: 9 }, ball: [0.06, 0.6], hit: { at: 2.8, shot: 'full', scale: 0.8, lift: 1.45, side: { start: -0.01, bend: -0.003 } } }, -0.04, {
  0: L('Uphill: shoulders along the slope, weight on the lower trail foot', 'Bergauf: Schultern parallel zum Hang, Gewicht auf dem tieferen hinteren Fuß'),
  2.8: L('Swing up the slope – the ball flies higher and shorter', 'Den Hang hinauf schwingen – der Ball fliegt höher und kürzer'),
  3.5: L('The finish may be shorter', 'Das Finish darf kürzer sein'),
});
/** downhill: shoulders along the slope, weight on the lower lead foot, ball a little back; flatter and running,
 *  it tends to go right; after impact the body follows the slope down */
/** the brush point on a slope: practice swings without a ball in the set-up for the slope – where the club touches
 *  the grass is where the ball goes (uphill further forward) */
export const BRUSH_FIND: Swing = relabel({ ...SLOPE_UP, noBall: true }, {
  0: L('Set up for the slope – without a ball first', 'Ansprache für den Hang – zuerst ohne Ball'),
  2.8: L('Where does the club brush the grass?', 'Wo streift der Schläger das Gras?'),
  3.5: L('Put the ball exactly there – uphill usually further forward', 'Leg den Ball genau dorthin – bergauf meist weiter vorn'),
}, { view: 'front' });
export const SLOPE_DOWN: Swing = onSlope(FULL_SWING, { slope: { up: -9 }, ball: [-0.04, 0.6], hit: { at: 2.8, shot: 'full', lift: 0.65, side: { start: 0.01, bend: 0.003 } } }, 0.04, {
  0: L('Downhill: shoulders along the slope, weight on the lower lead foot, ball back', 'Bergab: Schultern parallel zum Hang, Gewicht auf dem tieferen vorderen Fuß, Ball weiter hinten'),
  2.8: L('The ball flies flatter and runs', 'Der Ball fliegt flacher und rollt'),
  3.5: L('Follow the ball down the slope', 'Dem Ball den Hang hinunter folgen'),
}, { 3.05: { shift: 0.2 }, 3.5: { shift: 0.24 }, 4.7: { shift: 0.24 } });
/** ball above the feet: grip down, stand taller, aim right – the ball curves left back to the target */
export const SLOPE_ABOVE: Swing = onSlope(FULL_SWING, { slope: { side: 10 }, choke: 0.03, view: 'side', hit: { at: 2.8, shot: 'full', side: { start: 0.05, bend: -0.006 } } }, 0, {
  0: L('Ball above the feet: grip down, stand a little taller', 'Ball über den Füßen: kürzer greifen, etwas aufrechter stehen'),
  2.8: L('Aim right – the ball curves left', 'Rechts zielen – der Ball dreht nach links'),
});
/** ball below the feet: wider stance, more knee flex, stay down, aim left – the ball curves right */
export const SLOPE_BELOW: Swing = onSlope(FULL_SWING, { slope: { side: -10 }, stance: 0.46, view: 'side', hit: { at: 2.8, shot: 'full', scale: 0.85, side: { start: -0.05, bend: 0.006 } } }, 0, {
  0: L('Ball below the feet: wider stance, more knee flex, weight to the heels', 'Ball unter den Füßen: breiter stehen, mehr Kniebeugung, Gewicht Richtung Fersen'),
  2.8: L('Stay down through impact, aim left – the ball curves right', 'Unten bleiben, links zielen – der Ball dreht nach rechts'),
});

/** losing balance on the slope: a full swing from a normal stance – the body falls down the slope towards the ball */
const FALLING = { body: { pelvis: [30, 70, 2] as V3, spine: [8, 10, 0] as V3, chest: [6, 14, -4] as V3, neck: [-10, -20, 0] as V3, head: [6, -8, 0] as V3 }, hands: [0.12, 0.3, 0.32] as V3, club: [-0.7, -0.3, -0.6] as V3, push: 0.16, drop: 0.1, heel: 1, free: true };
export const SLOPE_BALANCE: Swing = fault({ ...SLOPE_BELOW, stance: 0.36 }, {
  0: { label: L('Set-up', 'Ansprache') },
  2.8: { label: L('Left: 100 %, the stance not adapted · right: 80 %, a wider stance', 'Links: 100 %, Stand nicht angepasst · rechts: 80 %, breiter Stand') },
  3.5: { ...FALLING, label: L('Left: falling down the slope · right: the finish held', 'Links: fällt den Hang hinunter · rechts: das Finish gehalten') },
  4.7: FALLING,
});
/** fat uphill and above the feet: not gripped down, the weight falls back – the club digs into the slope */
const UP_ABOVE: Swing = onSlope(FULL_SWING, { slope: { up: 7, side: 7 }, choke: 0.03, ball: [0.05, 0.6], view: 'angle', hit: { at: 2.8, shot: 'full', scale: 0.8, lift: 1.4, side: { start: 0.02, bend: -0.004 } } }, -0.03, { 0: L('Set-up', 'Ansprache') });
export const SLOPE_FAT: Swing = fault({ ...UP_ABOVE, choke: 0, ball: [0.0, 0.6] }, {
  2.8: {
    body: { pelvis: [38, 12, 9], spine: [2, -4, 8], chest: [2, -16, 14] },
    shift: -0.1,
    drop: 0.08,
    miss: [-0.09, -0.02, 0],
    label: L('Left: not gripped down, the weight falls back – the club digs in · right: gripped down, ball first', 'Links: nicht kürzer gegriffen, das Gewicht fällt zurück – der Schläger gräbt sich ein · rechts: kürzer gegriffen, erst der Ball'),
  },
}, { hit: { at: 2.8, shot: 'pitch', scale: 0.35 } });
/** thin and right below the feet: the body rises during the swing – topped or a weak slice */
export const SLOPE_THIN: Swing = fault(SLOPE_BELOW, {
  0: { label: L('Set-up', 'Ansprache') },
  2.8: {
    body: { pelvis: [14, 26, 4], spine: [0, 2, 2], chest: [0, -10, 6] },
    drop: -0.03,
    miss: [0.01, 0.045, 0],
    label: L('Left: the body rises – thin and to the right · right: knees stay flexed, down through impact', 'Links: der Körper richtet sich auf – dünn und nach rechts · rechts: die Knie bleiben gebeugt, unten durch den Treffmoment'),
  },
}, { hit: { at: 2.8, shot: 'punch', scale: 1.3, side: { start: 0.06, bend: 0.01 } } });

/** the putter face at impact: open – the ball starts right of the line and rolls past the hole; closing through the
 *  ball – it starts left; the right one keeps the face square and the putt drops */
const puttFace = (deg: number, label: SwingKey['label']): Swing =>
  fault(PUTT_STROKE, { 1.7: { face: deg, label }, 2.05: { face: deg * 1.6 }, 3.2: { face: deg * 1.6 } }, { hit: { at: 1.7, shot: 'putt', side: { start: Math.tan((deg * Math.PI) / 180), bend: 0 } } });
export const PUTT_OPEN = puttFace(5, L('Left: the face is open at impact – the ball starts right · right: square – it drops', 'Links: die Fläche ist im Treffmoment offen – der Ball startet rechts · rechts: square – er fällt'));
/** always short: a short backstroke, then braking at the ball – it stops in front of the hole */
const SHORT_BACK = { club: [-0.17, -0.97, 0.15] as V3, hands: [-0.03, -0.24, 0.38] as V3 };
const SHORT_THROUGH = { club: [0.12, -0.98, 0.15] as V3, hands: [0.02, -0.24, 0.38] as V3, body: { pelvis: [42, 0, 0] as V3, spine: [4, 0, 0] as V3, chest: [6, 3, 0] as V3, neck: [-16, -3, 0] as V3, head: [18, 0, 0] as V3 } };
export const PUTT_SHORT: Swing = fault(PUTT_STROKE, {
  1.35: { ...SHORT_BACK, body: { chest: [6, -4, 0], neck: [-16, 4, 0] }, label: L('Left: a short backstroke … · right: back as far as the putt is long', 'Links: kurz ausgeholt … · rechts: so weit ausgeholt, wie der Putt lang ist') },
  1.7: { label: L('Left: … and braking at the ball – it stops short of the hole · right: through – it drops', 'Links: … und am Ball abgebremst – er bleibt vor dem Loch liegen · rechts: durchgeschwungen – er fällt') },
  2.05: { ...SHORT_THROUGH, label: undefined },
  3.2: SHORT_THROUGH,
}, { hit: { at: 1.7, shot: 'putt', scale: 0.78 }, hole: { at: 1.74 } });
/** the short one missed: the head goes with the ball, the shoulders open – the face opens and it slides past right */
const HEAD_UP = { body: { pelvis: [42, 4, 0] as V3, spine: [4, 2, 0] as V3, chest: [6, 12, 0] as V3, neck: [-12, 18, 0] as V3, head: [0, 20, 0] as V3 } };
const SHORT_PUTT: Swing = { ...PUTT_STROKE, hit: { at: 1.7, shot: 'putt', scale: 0.6 } };
export const PUTT_PEEK: Swing = fault(SHORT_PUTT, {
  1.7: { ...HEAD_UP, face: 3, label: L('Left: the head goes with the ball, the shoulders open – it slides past right · right: the head stays down until the ball is gone', 'Links: der Kopf geht mit zum Ball, die Schultern öffnen – er rutscht rechts vorbei · rechts: der Kopf bleibt unten, bis der Ball weg ist') },
  2.05: { ...HEAD_UP, face: 5, label: undefined },
  3.2: { ...HEAD_UP, face: 5 },
}, { hit: { at: 1.7, shot: 'putt', scale: 0.6, side: { start: 0.07, bend: 0 } }, hole: { at: 1.04 } });
/** the three-putt from distance: the stroke of a short putt for a long one – two metres short; the right one swings
 *  back as far as the putt is long */
const LONG_BACK = { club: [-0.62, -0.78, 0.1] as V3, hands: [-0.12, -0.23, 0.38] as V3, body: { pelvis: [42, -2, 0] as V3, spine: [4, -2, 0] as V3, chest: [6, -16, 0] as V3, neck: [-16, 16, 0] as V3, head: [18, 2, 0] as V3 } };
const LONG_THROUGH = { club: [0.62, -0.78, 0.1] as V3, hands: [0.12, -0.23, 0.38] as V3, body: { pelvis: [42, 4, 0] as V3, spine: [4, 2, 0] as V3, chest: [6, 16, 0] as V3, neck: [-16, -16, 0] as V3, head: [18, -2, 0] as V3 } };
export const PUTT_LONG: Swing = fault(PUTT_STROKE, { 1.35: LONG_BACK, 2.05: LONG_THROUGH, 3.2: LONG_THROUGH }, { hit: { at: 1.7, shot: 'putt', scale: 3.9 } });
export const PUTT_LONG_SHORT: Swing = fault(PUTT_STROKE, {
  0: { label: L('A putt of 7 metres', 'Ein Putt über 7 Meter') },
  1.35: { label: L('Left: the stroke of a short putt · right: back as far as the putt is long', 'Links: die Bewegung eines kurzen Putts · rechts: so weit ausgeholt, wie der Putt lang ist') },
  1.7: { label: L('Left: two metres short – the next putt is not a gimme · right: the ball dies at the hole', 'Links: zwei Meter zu kurz – der nächste Putt ist kein Geschenk · rechts: der Ball stirbt am Loch') },
  2.05: { label: undefined },
}, { hit: { at: 1.7, shot: 'putt', scale: 2.8 }, hole: { at: 6.8 }, rollLine: true });
/** missing low, on the amateur side: too little break read – the ball runs below the hole; the right one aims higher
 *  and falls in from above (the green falls to the left) */
const BREAK = 0.11;
const BREAKING: Swing = { ...PUTT_STROKE, slope: { side: 2.5 }, hole: { at: 1.74 }, rollLine: true, hit: { at: 1.7, shot: 'putt', side: { start: BREAK, bend: -BREAK / 1.74 } } };
export const PUTT_LOW: Swing = fault(BREAKING, {
  0: { label: L('The green falls to the left', 'Das Grün fällt nach links') },
  1.7: { label: L('Left: too little break read – it runs below the hole (the amateur side) · right: aimed higher – it falls in from above', 'Links: zu wenig Break gelesen – er läuft unten vorbei (Amateurseite) · rechts: höher gezielt – er fällt von oben ins Loch') },
  2.05: { label: undefined },
}, { hit: { at: 1.7, shot: 'putt', side: { start: 0.035, bend: -BREAK / 1.74 } } });

export const PUTT_CLOSED = puttFace(-5, L('Left: the face closes through the ball – it starts left · right: square – it drops', 'Links: die Fläche schließt sich durch den Ball – er startet links · rechts: square – er fällt'));

/** pairs for the fault pictures: the fault first (left), the right way (right); z: one behind the other for the view from behind */
export const PAIRS = {
  fatPair: { fault: FAT, right: quiet(FULL_SWING) },
  thinPair: { fault: THIN, right: quiet(FULL_SWING) },
  // the coach's sticks: outside the trail hip (the hip slides into it or turns), behind the seat (it leaves it or stays)
  swayPair: { fault: withProps(SWAY, ['stickHip']), right: withProps(quiet(FULL_SWING), ['stickHip']) },
  earlyPair: { fault: withProps(EARLY_EXT, ['stickSeat']), right: withProps(quiet(FULL_SWING), ['stickSeat']), behind: true },
  chipFatPair: { fault: CHIP_FAT, right: quiet(CHIP_STROKE) },
  chipThinPair: { fault: CHIP_THIN, right: quiet(CHIP_STROKE) },
  chipSlowPair: { fault: CHIP_SLOW, right: quiet(CHIP_STROKE) },
  woodTopPair: { fault: WOOD_TOP, right: quiet(WOOD_SWING) },
  woodFatPair: { fault: WOOD_FAT, right: quiet(WOOD_SWING) },
  pitchFatPair: { fault: PITCH_FAT, right: quiet(HALF_SWING) },
  // the slice is seen best from behind: the path of the clubhead and the ball bending away
  slicePair: { fault: OVER_THE_TOP, right: quiet(FULL_SWING), behind: true },
  rushPair: { fault: RUSHED, right: quiet(FULL_SWING) },
  // from behind: the start line of the putt and the hole
  pitchSlowPair: { fault: PITCH_SLOW, right: quiet(HALF_SWING) },
  flyerPair: { fault: FLYER, right: quiet(WEDGE_TO_PIN), behind: true },
  armsyPair: { fault: ARMSY, right: quiet(FULL_SWING) },
  punchPair: { fault: PUNCH_HIGH, right: quiet(PUNCH), behind: true },
  chipLengthPair: { fault: CHIP_SHORT, right: quiet(CHIP_LAND), behind: true },
  sandTrio: { fault: SAND_8, right: SAND_9, more: [SAND_10], behind: true },
  clockTrio: { fault: PITCH_8, right: PITCH_9, more: [PITCH_10], behind: true },
  shankPair: { fault: SHANK, right: quiet({ ...FULL_SWING, faceView: true }) },
  toePair: { fault: DRIVER_TOE, right: quiet({ ...DRIVER_SWING, faceView: true }) },
  drawFadePair: { fault: DRAW_LAWS, right: quiet(FADE_LAWS), behind: true },
  slopeBalancePair: { fault: SLOPE_BALANCE, right: quiet(SLOPE_BELOW), behind: true },
  slopeFatPair: { fault: SLOPE_FAT, right: quiet(UP_ABOVE) },
  slopeThinPair: { fault: SLOPE_THIN, right: quiet(SLOPE_BELOW), behind: true },
  skyPair: { fault: DRIVER_SKY, right: quiet(DRIVER_SWING), behind: true },
  bunkerStuckPair: { fault: BUNKER_STUCK, right: quiet(BUNKER_SWING) },
  bunkerThinPair: { fault: BUNKER_THIN, right: quiet(BUNKER_SWING) },
  puttShortPair: { fault: PUTT_SHORT, right: quiet({ ...PUTT_STROKE, hole: { at: 1.74 } }), behind: true },
  puttPeekPair: { fault: PUTT_PEEK, right: quiet({ ...SHORT_PUTT, hole: { at: 1.04 } }), behind: true },
  puttLongPair: { fault: PUTT_LONG_SHORT, right: quiet({ ...PUTT_LONG, hole: { at: 6.8 }, rollLine: true }), behind: true },
  puttLowPair: { fault: PUTT_LOW, right: quiet(BREAKING), behind: true },
  puttRightPair: { fault: PUTT_OPEN, right: quiet(PUTT_STROKE), behind: true },
  puttLeftPair: { fault: PUTT_CLOSED, right: quiet(PUTT_STROKE), behind: true },
  driverSlicePair: { fault: DRIVER_SLICE, right: quiet(DRIVER_SWING), behind: true },
};
export type PairId = keyof typeof PAIRS;

/** where the golfers of a pair (or a trio) stand: side by side along the target line, or – seen from behind – one
 *  beside the other across it */
export function group(id: PairId): { swing: Swing; x?: number; z?: number }[] {
  const p = PAIRS[id] as { fault: Swing; right: Swing; more?: Swing[]; behind?: boolean };
  const all = [p.fault, p.right, ...(p.more ?? [])];
  const gap = all.length > 2 ? 1.4 : 2;
  return all.map((swing, i) => {
    const at = (i - (all.length - 1) / 2) * gap;
    return p.behind ? { swing, z: at } : { swing, x: at };
  });
}

/** drill aids in the picture: the stick at the trail hip, the towel under the arms, the stick with the grip, the trail heel up */
export const HIP_STICK: Swing = { ...FULL_SWING, props: ['stickHip'] };
export const TOWEL_HALF: Swing = { ...HALF_SWING, props: ['towel'] };
export const CHIP_STICK: Swing = { ...CHIP_STROKE, props: ['stickGrip'] };
export const CHIP_TOE: Swing = { ...CHIP_STROKE, keys: CHIP_STROKE.keys.map((x) => ({ ...x, heel: 1 })) };

export const SWINGS = { sandOnFace: SAND_ON_FACE, brushFind: BRUSH_FIND, friedEgg: FRIED_EGG, sandTrailToe: SAND_TRAIL_TOE, divotLie: DIVOT_LIE, hybridChip: HYBRID_CHIP, lob: LOB, leadArm: LEAD_ARM, punch: PUNCH, sandLine: SAND_LINE, sandSplash: SAND_SPLASH, sandFrame: SAND_FRAME, chipLand: CHIP_LAND, sliceLaws: SLICE_LAWS, hookLaws: HOOK_LAWS, nineFlights: NINE_FLIGHTS, tigerGate: TIGER_GATE, startGate: START_GATE, lineDrill: LINE_DRILL, teeAfter: TEE_AFTER, insideGate: INSIDE_GATE, headcover: HEADCOVER, sweepTee: SWEEP_TEE, secondTee: SECOND_TEE, impactBag: IMPACT_BAG, stepDrill: STEP_DRILL, pumpDrill: PUMP_DRILL, slopeUp: SLOPE_UP, slopeDown: SLOPE_DOWN, slopeAbove: SLOPE_ABOVE, slopeBelow: SLOPE_BELOW, bunker: BUNKER_SWING, full: FULL_SWING, driver: DRIVER_SWING, wood: WOOD_SWING, sand: SAND_SWING, half: HALF_SWING, chip: CHIP_STROKE, putt: PUTT_STROKE, feet: FEET_SWING, feetHalf: FEET_HALF, pause: PAUSE_SWING, setupIron: SETUP_IRON, setupDriver: SETUP_DRIVER, setupChip: SETUP_CHIP, setupPutt: SETUP_PUTT, puttOne: PUTT_ONE, chipOne: CHIP_ONE, hipStick: HIP_STICK, towelHalf: TOWEL_HALF, chipStick: CHIP_STICK, chipToe: CHIP_TOE };
export type SwingId = keyof typeof SWINGS;
