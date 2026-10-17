import { L, type CategoryId, type Motion, type MotionFrame } from '../types';

// The movements of the animated figure (Sascha 17.10.2026: "animated videos would be better than the still
// pictures"). The still picture with its numbers stays; the play button on it shows the movement. Times are seconds as
// shown – slowed down so the eye can follow, the proportions kept (full swing 3:1, putting stroke 2:1).

/** the full swing, face-on: back in three counts, down in one (Tour Tempo 3:1), the finish held */
const fullSwing = (opts?: MotionFrame['opts'], top = 0.3): Motion => ({
  // the 3D video where the player swings as usual (no drill aid in the picture)
  video: !opts || (Object.keys(opts).length === 1 && opts.club === 'iron') ? 'full' : opts.club === 'driver' && !opts.heelUp ? 'driver' : undefined,
  frames: [
    { pose: 'front', opts, t: 0, hold: 0.5 },
    { pose: 'takeaway', opts, t: 0.5, label: L('back in one piece – one', 'aus einem Guss zurück – eins') },
    { pose: 'halfBack', opts, t: 0.45, label: L('wrists hinge – two', 'Handgelenke winkeln an – zwei') },
    { pose: 'frontTop', opts, t: 0.55, hold: top, label: L('the top – three', 'oben – drei') },
    { pose: 'pump', opts, t: 0.3, label: L('down from the ground', 'Abschwung vom Boden') },
    { pose: 'impact', opts, t: 0.2, label: L('impact: hands ahead – four', 'Treffmoment: Hände vorn – vier') },
    { pose: 'halfThrough', opts, t: 0.25, label: L('through', 'durch') },
    { pose: 'frontFinish', opts, t: 0.45, hold: 1, label: L('hold the finish', 'Finish halten') },
  ],
});

/** the half swing from 9 to 3 o'clock (L to L, pitch, chip-and-run of the bunker without the full finish) */
const halfSwing = (opts?: MotionFrame['opts']): Motion => ({
  video: !opts || (Object.keys(opts).length === 1 && opts.club === 'iron') ? 'half' : undefined,
  frames: [
    { pose: 'front', opts: { club: 'wedge', ...opts }, t: 0, hold: 0.5 },
    { pose: 'takeaway', opts: { club: 'wedge', ...opts }, t: 0.5, label: L('the body turns back', 'der Körper dreht zurück') },
    { pose: 'halfBack', opts: { club: 'wedge', ...opts }, t: 0.5, hold: 0.4, label: L('9 o’clock: lead arm parallel', '9 Uhr: vorderer Arm waagrecht') },
    { pose: 'pump', opts: { club: 'wedge', ...opts }, t: 0.35, label: L('the body turns through', 'der Körper dreht durch') },
    { pose: 'impact', opts: { club: 'wedge', ...opts }, t: 0.2, label: L('ball first, then the grass', 'erst der Ball, dann das Gras') },
    { pose: 'halfThrough', opts: { club: 'wedge', ...opts }, t: 0.35, hold: 1, label: L('3 o’clock: chest to the target', '3 Uhr: Brust zum Ziel') },
  ],
});

/** the putting stroke: a pendulum from the shoulders, back twice as long as through (Grober) */
const puttStroke = (opts?: MotionFrame['opts'], arc = 9): Motion => ({
  video: opts ? undefined : 'putt',
  frames: [
    { pose: 'putt', opts, t: 0, hold: 0.6 },
    { pose: 'putt', opts, rock: -arc, t: 0.7, label: L('the shoulders rock back – tick', 'die Schultern schaukeln zurück – Tick') },
    { pose: 'putt', opts, rock: arc, t: 0.35, label: L('through the ball – tock', 'durch den Ball – Tack') },
    { pose: 'putt', opts, rock: arc, t: 0, hold: 1, label: L('the head stays still', 'der Kopf bleibt ruhig') },
    { pose: 'putt', opts, t: 0.7, hold: 0.2 },
  ],
});

/** the chip: the same pendulum with a lofted club, the grip leads, the short finish held */
const chipStroke = (opts?: MotionFrame['opts']): Motion => ({
  video: opts ? undefined : 'chip',
  frames: [
    { pose: 'chip', opts, t: 0, hold: 0.6 },
    { pose: 'chip', opts, rock: -15, t: 0.6, label: L('the shoulders rock, the wrists stay firm', 'die Schultern schaukeln, die Handgelenke bleiben fest') },
    { pose: 'chip', opts, rock: 0, t: 0.25, label: L('the club brushes the grass', 'der Schläger streift das Gras') },
    { pose: 'chip', opts, rock: 17, t: 0.3, hold: 1, label: L('the grip leads – hold the finish', 'der Griff führt – Finish halten') },
    { pose: 'chip', opts, t: 0.7, hold: 0.2 },
  ],
});

/** the punch: ball back, a short backswing, a short finish with the hands low */
const punch = (): Motion => ({
  frames: [
    { pose: 'front', opts: { club: 'iron', shift: 0.04 }, t: 0, hold: 0.5 },
    { pose: 'takeaway', opts: { club: 'iron', shift: 0.04 }, t: 0.6, label: L('short back – to hip or chest height', 'kurz zurück – bis Hüft- oder Brusthöhe') },
    { pose: 'halfBack', opts: { club: 'iron', shift: 0.04 }, t: 0.4, hold: 0.2 },
    { pose: 'pump', opts: { club: 'iron', shift: 0.05 }, t: 0.3 },
    { pose: 'impact', opts: { club: 'iron', shift: 0.06 }, t: 0.2, label: L('hands ahead, weight forward', 'Hände vorn, Gewicht vorn') },
    { pose: 'chipFinish', opts: { club: 'iron', shift: 0.06 }, t: 0.3, hold: 1.2, label: L('a short finish, the hands stay low', 'kurzes Finish, die Hände bleiben tief') },
  ],
});

/** the moving figure of a drill's picture, by drill id */
export const DRILL_MOTIONS: Record<string, Motion> = {
  // full swing
  'slow-motion': fullSwing(undefined, 0.8),
  'tempo-321': fullSwing(),
  'pause-top': fullSwing(undefined, 1),
  'feet-together-swing': fullSwing({ stance: 'together' }),
  'hold-finish': fullSwing(),
  'hip-stick': fullSwing({ club: 'iron' }),
  'driver-80': fullSwing({ club: 'driver', stance: 'wide' }),
  'speed-training': fullSwing({ club: 'driver', stance: 'wide' }),
  'driver-wide-stance': fullSwing({ club: 'driver', stance: 'wide' }),
  'pump-drill': {
    frames: [
      { pose: 'front', t: 0, hold: 0.4 },
      { pose: 'takeaway', t: 0.45 },
      { pose: 'halfBack', t: 0.4 },
      { pose: 'frontTop', t: 0.5, hold: 0.2, label: L('to the top', 'bis oben') },
      { pose: 'pump', t: 0.45, hold: 0.3, label: L('down to hip height – once', 'bis Hüfthöhe – einmal') },
      { pose: 'frontTop', t: 0.45, label: L('and up again', 'und wieder hoch') },
      { pose: 'pump', t: 0.45, hold: 0.3, label: L('down – twice', 'runter – zweimal') },
      { pose: 'frontTop', t: 0.45, label: L('up again', 'wieder hoch') },
      { pose: 'pump', t: 0.3, label: L('the third time through to the ball', 'beim dritten Mal durch zum Ball') },
      { pose: 'impact', t: 0.2 },
      { pose: 'halfThrough', t: 0.25 },
      { pose: 'frontFinish', t: 0.45, hold: 0.8, label: L('hold the finish', 'Finish halten') },
    ],
  },
  // half swing
  'l-to-l': halfSwing({ club: 'iron' }),
  'nine-to-three': halfSwing(),
  'feet-together-pitch': halfSwing({ stance: 'together' }),
  'towel-arms': halfSwing({ towel: true }),
  'lead-arm-only': halfSwing({ club: 'iron', oneHand: true }),
  'split-grip': halfSwing({ club: 'iron' }),
  'grip-pressure-ball': halfSwing({ club: 'iron' }),
  'splash-no-ball': fullSwing({ club: 'wedge', stance: 'wide' }),
  'sand-on-face': halfSwing(),
  'one-foot-bunker': fullSwing({ club: 'wedge', stance: 'wide', heelUp: 'trail' }),
  'fairway-bunker': fullSwing({ club: 'iron' }),
  'brush-five': fullSwing({ club: 'iron' }),
  'fried-egg': {
    frames: [
      { pose: 'front', opts: { club: 'wedge' }, t: 0, hold: 0.5 },
      { pose: 'halfBack', opts: { club: 'wedge' }, t: 0.7, label: L('steep back', 'steil zurück') },
      { pose: 'frontTop', opts: { club: 'wedge' }, t: 0.4, hold: 0.2 },
      { pose: 'pump', opts: { club: 'wedge' }, t: 0.3, label: L('hard down behind the ball', 'kräftig nach unten hinter den Ball') },
      { pose: 'impact', opts: { club: 'wedge', shift: 0.04 }, t: 0.2, hold: 1.4, label: L('the club stays in the sand – hardly a finish', 'der Schläger bleibt im Sand – kaum ein Finish') },
    ],
  },
  'punch-gap': punch(),
  'divot-lie': punch(),
  // stance: undefined – the figure of the picture stands with the feet together; after the step the normal stance
  'step-drill': {
    frames: [
      { pose: 'front', opts: { club: 'iron', stance: 'together' }, t: 0, hold: 0.6, label: L('feet together', 'Füße zusammen') },
      { pose: 'takeaway', opts: { club: 'iron', stance: 'together' }, t: 0.6, label: L('start back with the feet together', 'mit geschlossenen Füßen ausholen') },
      { pose: 'halfBack', opts: { club: 'iron', stance: undefined }, t: 0.6, hold: 0.2, label: L('the lead foot steps towards the target', 'der vordere Fuß tritt Richtung Ziel') },
      { pose: 'pump', opts: { club: 'iron', stance: undefined, shift: 0.04 }, t: 0.35, label: L('foot down – the weight is forward first', 'Fuß aufsetzen – zuerst ist das Gewicht vorn') },
      { pose: 'impact', opts: { club: 'iron', stance: undefined, shift: 0.06 }, t: 0.2 },
      { pose: 'halfThrough', opts: { club: 'iron', stance: undefined, shift: 0.06 }, t: 0.3, hold: 1, label: L('then the club arrives', 'dann kommt der Schläger') },
    ],
  },
  'hold-finish-slope': fullSwing(undefined, 0.2),
  'brush-find': halfSwing({ club: 'iron' }),
  'impact-bag': {
    frames: [
      { pose: 'front', t: 0, hold: 0.5 },
      { pose: 'takeaway', t: 0.6 },
      { pose: 'halfBack', t: 0.5, hold: 0.3, label: L('slowly back', 'langsam zurück') },
      { pose: 'pump', t: 0.6 },
      { pose: 'impact', opts: { shift: 0.05 }, t: 0.4, hold: 1.4, label: L('stop at impact: hands ahead, weight forward', 'im Treffmoment stoppen: Hände vorn, Gewicht vorn') },
    ],
  },
  // putting and chipping
  'one-hand': puttStroke({ oneHand: true }),
  'trail-toe': chipStroke({ heelUp: 'trail' }),
  'stick-lead-arm': chipStroke({ gripStick: true }),
  'hold-finish-chip': chipStroke(),
  'lead-hand-chip': chipStroke({ oneHand: true }),
  'hybrid-chip': puttStroke({ club: 'driver' }, 12),
};

/** the moving figure of a section's picture, by topic and English title */
export const SECTION_MOTIONS: Partial<Record<CategoryId, Record<string, Motion>>> = {
  putting: { 'The stroke': puttStroke(), 'Short putts (under 2 m)': puttStroke(undefined, 6) },
  chipping: { 'The stroke': chipStroke() },
  pitching: { 'The motion': halfSwing(), 'The clock system': halfSwing(), 'Lob and flop': fullSwing({ club: 'wedge', stance: 'wide' }) },
  bunker: { 'The swing': fullSwing({ club: 'wedge', stance: 'wide' }), 'Fairway bunker': fullSwing({ club: 'iron' }) },
  trouble: { 'The punch shot under trees': punch() },
  slopes: { 'Uphill lie': fullSwing(), 'Downhill lie': fullSwing() },
  woods: { 'The swing: sweep': fullSwing({ club: 'driver' }) },
  driver: { 'More speed': fullSwing({ club: 'driver', stance: 'wide' }), 'Hit up and hit the centre': fullSwing({ club: 'driver', stance: 'wide' }) },
  swing: {
    'Takeaway and backswing': fullSwing(),
    'Transition and downswing': fullSwing(),
    'Impact and finish': fullSwing(),
    'Tempo and rhythm': fullSwing(),
  },
};

// ---------- the fault pictures in motion: the fault (left figure) and the right way (right figure) in step ----------

type Opts = MotionFrame['opts'];

/** a swing down to impact, held there – full (to the top) or half (to 9 o’clock) */
const swingTo = (end: Opts, say: L | undefined, o: { half?: boolean; top?: Opts; after?: MotionFrame[] } = {}): MotionFrame[] => [
  { pose: 'front', t: 0, hold: 0.5 },
  { pose: 'takeaway', opts: o.top, t: 0.5, label: say && L('back', 'zurück') },
  { pose: 'halfBack', opts: o.top, t: 0.45, hold: o.half ? 0.3 : 0 },
  ...(o.half ? [] : [{ pose: 'frontTop' as const, opts: o.top, t: 0.55, hold: 0.3, label: say && L('the top', 'oben') }]),
  { pose: 'pump', t: 0.3, label: say && L('down', 'runter') },
  { pose: 'impact', opts: end, t: 0.2, hold: o.after ? 0 : 1.6, label: say },
  ...(o.after ?? []),
];
const pairSwing = (fault: Opts, right: Opts, say: L, o: { half?: boolean } = {}): Motion => ({
  fig: 0,
  frames: swingTo(fault, say, o),
  with: [{ fig: 1, frames: swingTo(right, undefined, o) }],
});
const chipTo = (end: Opts, say?: L): MotionFrame[] => [
  { pose: 'chip', t: 0, hold: 0.5 },
  { pose: 'chip', rock: -15, t: 0.6, label: say && L('back', 'zurück') },
  { pose: 'chip', opts: end, t: 0.3, hold: 1.6, label: say },
];
const pairChip = (fault: Opts, right: Opts, say: L): Motion => ({ fig: 0, frames: chipTo(fault, say), with: [{ fig: 1, frames: chipTo(right) }] });

export const FAULT_MOTIONS: Partial<Record<CategoryId, Record<string, Motion>>> = {
  chipping: {
    'Fat chip (chunk)': pairChip({ shift: -0.08, scoop: true }, { shift: 0.06 }, L('left: weight back, the wrists flip – the club hits the ground first; right: weight forward, the grip leads', 'links: Gewicht hinten, die Handgelenke klappen – der Schläger trifft zuerst den Boden; rechts: Gewicht vorn, der Griff führt')),
    'Thin or bladed chip': pairChip({ standUp: true, scoop: true }, { shift: 0.05 }, L('left: the body rises, the leading edge hits the ball; right: the body stays down', 'links: der Körper richtet sich auf, die Kante trifft den Ball; rechts: der Körper bleibt unten')),
    'Slowing down': {
      fig: 0,
      frames: [
        { pose: 'chip', t: 0, hold: 0.5 },
        { pose: 'chip', rock: -24, t: 0.7, label: L('left: a long backswing; right: a short one', 'links: weit ausholen; rechts: kurz ausholen') },
        { pose: 'chip', rock: 3, t: 0.6, hold: 1.4, label: L('left: braking at the ball; right: longer through, finish held', 'links: am Ball bremsen; rechts: länger durch, Finish halten') },
      ],
      with: [{ fig: 1, frames: [{ pose: 'chip', t: 0, hold: 0.5 }, { pose: 'chip', rock: -12, t: 0.7 }, { pose: 'chip', rock: 18, t: 0.6, hold: 1.4 }] }],
    },
  },
  pitching: {
    'Fat or thin pitches': pairSwing({ shift: -0.08, scoop: true }, { shift: 0.05 }, L('left: arms only, weight back – the ground first; right: the body turns, weight forward', 'links: nur die Arme, Gewicht hinten – zuerst der Boden; rechts: der Körper dreht, Gewicht vorn'), { half: true }),
    'Slowing down at the ball': {
      fig: 0,
      frames: swingTo(undefined, L('left: too long back – it has to brake; right: shorter back, through to 3 o’clock', 'links: zu weit ausgeholt – er muss bremsen; rechts: kürzer aus, durch bis 3 Uhr')),
      with: [{ fig: 1, frames: [{ pose: 'front', t: 0, hold: 0.5 }, { pose: 'takeaway', t: 0.5 }, { pose: 'halfBack', t: 1, hold: 0.3 }, { pose: 'pump', t: 0.3 }, { pose: 'impact', t: 0.2 }, { pose: 'halfThrough', t: 0.35, hold: 1.25 }] }],
    },
  },
  bunker: {
    'Thin over the green': pairSwing({ standUp: true, shift: -0.05 }, { shift: 0.04 }, L('left: the body rises, the club hits the ball; right: down into the sand behind the ball', 'links: der Körper richtet sich auf, der Schläger trifft den Ball; rechts: unten bleiben, in den Sand hinter dem Ball')),
    'Ball stays in the bunker': {
      fig: 0,
      frames: swingTo({ shift: -0.04 }, L('left: the club stops in the sand; right: through to a full finish', 'links: der Schläger bleibt im Sand stecken; rechts: durch bis ins volle Finish')),
      with: [{ fig: 1, frames: swingTo(undefined, undefined, { after: [{ pose: 'halfThrough', t: 0.25 }, { pose: 'frontFinish', t: 0.45, hold: 0.9 }] }) }],
    },
  },
  trouble: {
    'Punch shot goes up into the branches': pairSwing({ scoop: true }, { shift: 0.06 }, L('left: the hands flip – loft is added; right: hands ahead, the ball stays low', 'links: die Hände klappen – mehr Loft; rechts: Hände vorn, der Ball bleibt flach'), { half: true }),
  },
  irons: {
    'Fat shots': pairSwing({ shift: -0.08, scoop: true }, { shift: 0.06 }, L('left: weight back, casting – the ground first; right: weight forward, hands ahead', 'links: Gewicht hinten, früh abgewinkelt – zuerst der Boden; rechts: Gewicht vorn, Hände vorn')),
    'Thin shots': pairSwing({ standUp: true }, { shift: 0.04 }, L('left: the chest rises – the edge hits the ball; right: the posture is kept', 'links: der Brustkorb hebt sich – die Kante trifft den Ball; rechts: die Haltung bleibt')),
  },
  woods: {
    Topping: pairSwing({ standUp: true }, {}, L('left: lifting the ball – the body rises; right: chest over the ball, sweeping the grass', 'links: den Ball heben wollen – der Körper richtet sich auf; rechts: Brust über dem Ball, das Gras fegen')),
    'Fat (chunked) woods': pairSwing({ shift: -0.08 }, {}, L('left: weight back, too steep – the club digs; right: wide and flat, sweeping', 'links: Gewicht hinten, zu steil – der Schläger gräbt; rechts: weit und flach, fegen')),
  },
  swing: {
    'Sway instead of turn': {
      fig: 0,
      frames: [
        { pose: 'front', t: 0, hold: 0.5 },
        { pose: 'takeaway', opts: { shift: -0.06 }, t: 0.6, label: L('left: the hips slide away from the target; right: they turn', 'links: die Hüfte gleitet vom Ziel weg; rechts: sie dreht') },
        { pose: 'frontTop', opts: { shift: -0.12 }, t: 0.9, hold: 1.4, label: L('left: head and body moved back; right: turned around a steady centre', 'links: Kopf und Körper sind nach hinten gewandert; rechts: um ein ruhiges Zentrum gedreht') },
      ],
      with: [{ fig: 1, frames: [{ pose: 'front', t: 0, hold: 0.5 }, { pose: 'takeaway', t: 0.6 }, { pose: 'frontTop', t: 0.9, hold: 1.4 }] }],
    },
  },
  ballflight: {
    'Topped shots': pairSwing({ standUp: true }, { shift: 0.04 }, L('left: the body rises, the arms pull in; right: the posture is kept through impact', 'links: der Körper richtet sich auf, die Arme ziehen ein; rechts: die Haltung bleibt durch den Treffmoment')),
  },
  fitness: {
    'Short, armsy backswing': {
      fig: 0,
      frames: [
        { pose: 'front', t: 0, hold: 0.5 },
        { pose: 'takeaway', t: 0.5, label: L('left: only the arms swing; right: the upper back turns', 'links: nur die Arme schwingen; rechts: der obere Rücken dreht') },
        { pose: 'halfBack', t: 0.45 },
        { pose: 'halfBack', t: 0.55, hold: 1.4, label: L('left: the turn ends early; right: a full turn to the top', 'links: die Drehung endet früh; rechts: volle Drehung bis oben') },
      ],
      with: [{ fig: 1, frames: [{ pose: 'front', t: 0, hold: 0.5 }, { pose: 'takeaway', t: 0.5 }, { pose: 'halfBack', t: 0.45 }, { pose: 'frontTop', t: 0.55, hold: 1.4 }] }],
    },
    'Early extension (standing up)': {
      fig: 0,
      frames: [
        { pose: 'address', t: 0, hold: 0.5 },
        { pose: 'top', t: 1.1, hold: 0.3, label: L('back to the top', 'zurück bis oben') },
        { pose: 'address', opts: { standUp: true }, t: 0.5, hold: 1.4, label: L('left: the hips move to the ball, the body rises; right: the posture is kept', 'links: die Hüfte geht zum Ball, der Körper richtet sich auf; rechts: die Haltung bleibt') },
      ],
      with: [{ fig: 1, frames: [{ pose: 'address', t: 0, hold: 0.5 }, { pose: 'top', t: 1.1, hold: 0.3 }, { pose: 'address', t: 0.5, hold: 1.4 }] }],
    },
  },
};

// 3D where the video shows what the picture shows: no slope, no drill aid the 3D player does not have; the bunker from
// the sand, the fairway wood without a tee
const set3d = (m: Motion | undefined, v: Motion['video']) => m && (m.video = v);
for (const id of ['hip-stick', 'sand-on-face', 'brush-find', 'hold-finish-slope']) set3d(DRILL_MOTIONS[id], undefined);
set3d(DRILL_MOTIONS['fairway-bunker'], 'sand');
set3d(DRILL_MOTIONS['feet-together-swing'], 'feet');
set3d(DRILL_MOTIONS['feet-together-pitch'], 'feetHalf');
set3d(DRILL_MOTIONS['pause-top'], 'pause');
set3d(DRILL_MOTIONS['one-hand'], 'puttOne');
set3d(DRILL_MOTIONS['lead-hand-chip'], 'chipOne');
set3d(SECTION_MOTIONS.bunker?.['Fairway bunker'], 'sand');
set3d(SECTION_MOTIONS.woods?.['The swing: sweep'], 'wood');
for (const t of ['Uphill lie', 'Downhill lie']) set3d(SECTION_MOTIONS.slopes?.[t], undefined);

// the set-up sections: the address in 3D, still – the views show it from the front, from behind, at an angle
const still3d = (video: Motion['video']): Motion => ({ frames: [], video });
SECTION_MOTIONS.basics = { ...SECTION_MOTIONS.basics, Posture: still3d('setupIron') };
SECTION_MOTIONS.irons = { ...SECTION_MOTIONS.irons, 'Set-up for irons': still3d('setupIron') };
SECTION_MOTIONS.driver = { ...SECTION_MOTIONS.driver, 'Set-up for the driver': still3d('setupDriver') };
SECTION_MOTIONS.chipping = { ...SECTION_MOTIONS.chipping, 'The set-up': still3d('setupChip') };
SECTION_MOTIONS.putting = { ...SECTION_MOTIONS.putting, 'Set-up': still3d('setupPutt') };
