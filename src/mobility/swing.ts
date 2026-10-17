import { L } from '../training/types';
import type { Sketch, SideItem } from '../training/types';
import type { Grade, Measurement, Screening, Side, TestId, TestResult } from './types';

// The body–swing connection (TPI): a body that cannot do a movement makes the swing find another way – and those
// ways are predictable. Every swing pattern below lists the tests that point to it, with a weight (3 = the main
// cause, 1 = a contributing one) and, for sided tests, which side matters (lead = the side towards the target: the
// left for a right-hander). From the results: how likely the pattern is, and the misses it brings, in player language.
// Sources: TPI body–swing connection (mytpi.com, seminar notes); weights REVIEW(golf) – Chris.

export type PatternId =
  | 'early-extension'
  | 'loss-of-posture'
  | 'over-the-top'
  | 'sway'
  | 'slide'
  | 'reverse-spine'
  | 'flat-shoulder'
  | 'hanging-back'
  | 'casting'
  | 'chicken-wing'
  | 'scooping'
  | 's-posture';

export type Miss = 'slice' | 'hook' | 'push' | 'pull' | 'fat' | 'thin' | 'shank' | 'short' | 'high' | 'back';

export const MISS_NAMES: Record<Miss, L> = {
  slice: L('Slice', 'Slice'),
  hook: L('Hook', 'Hook'),
  push: L('Push (straight right)', 'Push (gerade rechts)'),
  pull: L('Pull (straight left)', 'Pull (gerade links)'),
  fat: L('Fat (ground first)', 'Fett (Boden zuerst)'),
  thin: L('Thin / topped', 'Dünn / getoppt'),
  shank: L('Shank', 'Shank'),
  short: L('Too short', 'Zu kurz'),
  high: L('High and weak', 'Hoch und schwach'),
  back: L('Back pain', 'Rückenschmerzen'),
};

interface Link {
  test: TestId;
  w: 1 | 2 | 3;
  /** which side of a sided test counts (none = the worse of both) */
  side?: 'lead' | 'trail';
}

export interface Pattern {
  id: PatternId;
  name: L;
  /** what happens in the swing, in player language */
  what: L;
  /** why the body does it */
  why: L;
  misses: Miss[];
  links: Link[];
  /** the fault in a picture (the golfer drawn doing it) */
  sketch: Sketch;
  /** the matching fault in Training (category id + English name) */
  training?: { cat: string; fault: string };
}

const G0 = 0.2;
const scene = (items: SideItem[], caption?: L): Sketch => ({ view: 'side', w: 3, h: 2.1, items: [{ k: 'ground', pts: [[0, G0], [3, G0]] }, ...items], caption });
const at = (x: number, y = G0): [number, number] => [x, y];

export const PATTERNS: Pattern[] = [
  {
    id: 'early-extension',
    name: L('Standing up (early extension)', 'Frühes Aufrichten (Early Extension)'),
    what: L('In the downswing the hips move towards the ball and the body stands up – the arms have no room.', 'Im Abschwung schiebt die Hüfte zum Ball und der Körper richtet sich auf – die Arme haben keinen Platz mehr.'),
    why: L('Hips that cannot turn or bend deep enough, or weak glutes, push the pelvis forward.', 'Eine Hüfte, die nicht tief genug beugen oder drehen kann, oder ein schwaches Gesäß schieben das Becken nach vorn.'),
    misses: ['push', 'hook', 'thin', 'shank'],
    links: [{ test: 'deep-squat', w: 3 }, { test: 'bridge', w: 2 }, { test: 'pelvic-rotation', w: 2 }, { test: 'pelvic-tilt', w: 2 }, { test: 'lower-quarter', w: 2, side: 'lead' }, { test: 'toe-touch', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.0), pose: 'address', club: 'iron' },
      { k: 'figure', at: at(2.1), pose: 'address', club: 'iron', standUp: true },
      { k: 'callout', on: 'pelvis', t: L('the hips move towards the ball', 'die Hüfte schiebt zum Ball'), at: [2.8, 1.0], fig: 1 },
      { k: 'callout', on: 'head', t: L('the body stands up', 'der Körper richtet sich auf'), at: [2.8, 1.95], fig: 1 },
    ], L('Left: address. Right: in the downswing – hips forward, upright.', 'Links: Ansprechen. Rechts: im Abschwung – Hüfte vorn, aufgerichtet.')),
    training: { cat: 'fitness', fault: 'Early extension (standing up)' },
  },
  {
    id: 'loss-of-posture',
    name: L('Losing the posture', 'Haltungsverlust'),
    what: L('The angles of the address get lost in the swing – the body moves up and down.', 'Die Winkel der Ansprechhaltung gehen im Schwung verloren – der Körper geht hoch und runter.'),
    why: L('Stiff hips, hamstrings, upper back or lats – the body finds room by changing its posture.', 'Steife Hüfte, hintere Oberschenkel, oberer Rücken oder Latissimus – der Körper schafft sich Platz, indem er die Haltung ändert.'),
    misses: ['fat', 'thin', 'shank'],
    links: [{ test: 'deep-squat', w: 2 }, { test: 'toe-touch', w: 2 }, { test: 'lat', w: 2 }, { test: 'seated-rotation', w: 1 }, { test: 'shoulder-9090', w: 1, side: 'trail' }, { test: 'single-leg', w: 1 }, { test: 'bridge', w: 1 }, { test: 'neck', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.0), pose: 'address', club: 'iron' },
      { k: 'figure', at: at(2.1), pose: 'top', club: 'iron', standUp: true },
      { k: 'callout', on: 'head', t: L('the head comes up', 'der Kopf kommt hoch'), at: [2.8, 1.95], fig: 1 },
      { k: 'callout', on: 'pelvis', t: L('the spine angle is lost', 'der Rückenwinkel geht verloren'), at: [2.8, 0.9], fig: 1 },
    ]),
  },
  {
    id: 'over-the-top',
    name: L('Over the top', 'Von außen (Over the Top)'),
    what: L('The downswing starts with the shoulders and arms – the club comes from outside across the ball.', 'Der Abschwung beginnt mit Schultern und Armen – der Schläger kommt von außen über den Ball.'),
    why: L('The hips cannot lead on their own, so the upper body starts the downswing.', 'Die Hüfte kann nicht allein führen, also startet der Oberkörper den Abschwung.'),
    misses: ['slice', 'pull'],
    links: [{ test: 'pelvic-rotation', w: 3 }, { test: 'seated-rotation', w: 2 }, { test: 'shoulder-9090', w: 2, side: 'trail' }, { test: 'lower-quarter', w: 2, side: 'lead' }, { test: 'lat', w: 1 }, { test: 'single-leg', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.4), pose: 'top', club: 'iron' },
      { k: 'flight', pts: [[2.25, 1.75], [2.05, 1.1], [1.95, 0.25]], dashed: true },
      { k: 'callout', on: 'trailShoulder', t: L('the shoulders start the downswing', 'die Schultern starten den Abschwung'), at: [0.3, 1.9] },
      { k: 'text', at: [2.95, 1.95], t: L('club from outside', 'Schläger von außen'), size: 11, anchor: 'end' },
    ]),
    training: { cat: 'swing', fault: 'Over the top' },
  },
  {
    id: 'sway',
    name: L('Swaying away', 'Seitliches Ausweichen (Sway)'),
    what: L('In the backswing the hips slide away from the target instead of turning.', 'Im Rückschwung schiebt die Hüfte vom Ziel weg, statt zu drehen.'),
    why: L('The trail hip cannot rotate inwards or the balance is weak – the body moves sideways.', 'Die hintere Hüfte kann nicht nach innen drehen oder das Gleichgewicht fehlt – der Körper weicht zur Seite aus.'),
    misses: ['fat', 'thin', 'push'],
    links: [{ test: 'lower-quarter', w: 3, side: 'trail' }, { test: 'single-leg', w: 2, side: 'trail' }, { test: 'seated-rotation', w: 1 }, { test: 'pelvic-rotation', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'frontTop', shift: -0.12 },
      { k: 'line', from: [1.5 - 0.21, G0], to: [1.5 - 0.21, G0 + 1.9], dashed: true },
      { k: 'callout', on: 'pelvis', t: L('the hips slide past the trail foot', 'die Hüfte schiebt über den hinteren Fuß hinaus'), at: [0.4, 1.1] },
    ], L('Face-on at the top: the hips outside the trail foot.', 'Von vorn am Top: die Hüfte außerhalb des hinteren Fußes.')),
    training: { cat: 'swing', fault: 'Sway instead of turn' },
  },
  {
    id: 'slide',
    name: L('Sliding to the target', 'Hüfte schiebt zum Ziel (Slide)'),
    what: L('In the downswing the hips slide towards the target instead of turning open.', 'Im Abschwung schiebt die Hüfte zum Ziel, statt sich aufzudrehen.'),
    why: L('The lead hip cannot rotate inwards or the balance on the lead leg is weak.', 'Die vordere Hüfte kann nicht nach innen drehen oder das Gleichgewicht auf dem vorderen Bein fehlt.'),
    misses: ['push', 'hook'],
    links: [{ test: 'lower-quarter', w: 3, side: 'lead' }, { test: 'single-leg', w: 2, side: 'lead' }, { test: 'bridge', w: 1 }, { test: 'pelvic-rotation', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'impact', shift: 0.12 },
      { k: 'line', from: [1.5 + 0.21, G0], to: [1.5 + 0.21, G0 + 1.9], dashed: true },
      { k: 'callout', on: 'pelvis', t: L('the hips slide past the lead foot', 'die Hüfte schiebt über den vorderen Fuß hinaus'), at: [2.6, 1.1] },
    ]),
  },
  {
    id: 'reverse-spine',
    name: L('Leaning to the target at the top', 'Umgekehrter Rückenwinkel'),
    what: L('At the top the upper body leans towards the target instead of behind the ball.', 'Am Top lehnt der Oberkörper zum Ziel statt hinter den Ball.'),
    why: L('Not enough turn in the upper back, the trail hip or the lats – the body bends instead of turning.', 'Zu wenig Drehung im oberen Rücken, der hinteren Hüfte oder Latissimus – der Körper biegt sich statt zu drehen.'),
    misses: ['slice', 'pull', 'back'],
    links: [{ test: 'seated-rotation', w: 3 }, { test: 'lat', w: 2 }, { test: 'neck', w: 2 }, { test: 'lower-quarter', w: 1, side: 'trail' }, { test: 'single-leg', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'frontTop', joints: { head: [0.1, 1.54], neck: [0.08, 1.41], leadShoulder: [0.18, 1.36], trailShoulder: [-0.06, 1.41], leadElbow: [-0.06, 1.46], trailElbow: [-0.24, 1.3], hands: [-0.28, 1.6], clubHead: [0.55, 1.78], pelvis: [-0.06, 0.92], leadHip: [0.05, 0.92], trailHip: [-0.17, 0.92] } },
      { k: 'line', from: [1.5 - 0.06, G0 + 0.92], to: [1.5 - 0.06, G0 + 1.75], dashed: true },
      { k: 'callout', on: 'head', t: L('the upper body leans towards the target', 'der Oberkörper lehnt zum Ziel'), at: [2.6, 1.9] },
      { k: 'callout', on: 'trailHip', t: L('the hips slide back', 'die Hüfte schiebt nach hinten'), at: [0.45, 0.9] },
    ]),
  },
  {
    id: 'flat-shoulder',
    name: L('Flat shoulder turn', 'Flache Schulterdrehung'),
    what: L('The shoulders turn level instead of tilting – the club swings flat around the body.', 'Die Schultern drehen waagrecht statt geneigt – der Schläger schwingt flach um den Körper.'),
    why: L('Stiff lats and upper back keep the shoulders from tilting.', 'Ein verkürzter Latissimus und ein steifer oberer Rücken lassen die Schultern nicht neigen.'),
    misses: ['hook', 'push', 'fat'],
    links: [{ test: 'lat', w: 2 }, { test: 'reach-roll-lift', w: 2 }, { test: 'shoulder-9090', w: 1 }, { test: 'seated-rotation', w: 1 }, { test: 'pelvic-tilt', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.4), pose: 'top', club: 'iron', joints: { leadShoulder: [0.22, 1.37], trailShoulder: [0.1, 1.37], leadElbow: [0.02, 1.36], trailElbow: [-0.14, 1.28], hands: [-0.22, 1.44], clubHead: [-0.72, 1.66] } },
      { k: 'line', from: [1.4 - 0.25, G0 + 1.37], to: [1.4 + 0.6, G0 + 1.37], dashed: true },
      { k: 'callout', on: 'leadShoulder', t: L('the shoulders turn level, not tilted', 'die Schultern drehen waagrecht statt geneigt'), at: [2.6, 1.9] },
      { k: 'callout', on: 'hands', t: L('arms and club flat behind the body', 'Arme und Schläger flach hinter dem Körper'), at: [0.35, 1.0] },
    ]),
  },
  {
    id: 'hanging-back',
    name: L('Weight stays back', 'Gewicht bleibt hinten'),
    what: L('Through impact the weight stays on the trail foot.', 'Durch den Treffmoment bleibt das Gewicht auf dem hinteren Fuß.'),
    why: L('Poor balance on the lead leg or a lead hip that cannot turn – the body does not trust the lead side.', 'Schlechtes Gleichgewicht auf dem vorderen Bein oder eine vordere Hüfte, die nicht dreht – der Körper traut der vorderen Seite nicht.'),
    misses: ['fat', 'thin', 'high'],
    links: [{ test: 'single-leg', w: 2, side: 'lead' }, { test: 'lower-quarter', w: 2, side: 'lead' }, { test: 'bridge', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'impact', shift: -0.1 },
      { k: 'callout', on: 'trailKnee', t: L('the weight hangs on the trail foot', 'das Gewicht hängt auf dem hinteren Fuß'), at: [0.4, 0.8] },
    ]),
  },
  {
    id: 'casting',
    name: L('Throwing the club (casting)', 'Früher Handgelenkswinkel-Verlust (Casting)'),
    what: L('The wrist angle is thrown away early in the downswing – the speed is gone before the ball.', 'Der Winkel im Handgelenk wird früh im Abschwung geworfen – das Tempo ist vor dem Ball verbraucht.'),
    why: L('Stiff wrists or forearms, or a lower body that does not lead.', 'Steife Handgelenke oder Unterarme, oder ein Unterkörper, der nicht führt.'),
    misses: ['fat', 'thin', 'slice', 'short'],
    links: [{ test: 'wrist-hinge', w: 3 }, { test: 'forearm', w: 2 }, { test: 'wrist-flex', w: 1 }, { test: 'pelvic-rotation', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'pump', scoop: true },
      { k: 'callout', on: 'hands', t: L('the wrist angle is gone early', 'der Handgelenkswinkel ist früh weg'), at: [2.6, 1.4] },
    ]),

  },
  {
    id: 'chicken-wing',
    name: L('Bent lead arm in the finish (chicken wing)', 'Gebeugter Führungsarm (Chicken Wing)'),
    what: L('After impact the lead elbow bends and points away – the face stays open.', 'Nach dem Treffmoment knickt der vordere Ellbogen ein – die Schlagfläche bleibt offen.'),
    why: L('The lead shoulder cannot turn out, or the forearms cannot rotate.', 'Die vordere Schulter kann nicht nach außen drehen oder die Unterarme drehen nicht.'),
    misses: ['slice', 'thin', 'push'],
    links: [{ test: 'shoulder-9090', w: 2, side: 'lead' }, { test: 'forearm', w: 2 }, { test: 'wrist-flex', w: 1 }, { test: 'lat', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'halfThrough', joints: { leadElbow: [0.42, 1.12] } },
      { k: 'callout', on: 'leadElbow', t: L('the lead elbow bends and points away', 'der vordere Ellbogen knickt ein'), at: [2.6, 1.0] },
    ]),
  },
  {
    id: 'scooping',
    name: L('Scooping', 'Löffeln'),
    what: L('The hands stop and the wrists flip to help the ball up – the clubhead passes the hands.', 'Die Hände stoppen und die Handgelenke klappen ab, um den Ball hochzuhelfen – der Schlägerkopf überholt die Hände.'),
    why: L('Stiff wrists (bowing), weak balance on the lead side or weight that stays back.', 'Steife Handgelenke (beugen), wenig Gleichgewicht auf der vorderen Seite oder Gewicht hinten.'),
    misses: ['thin', 'fat', 'high', 'short'],
    links: [{ test: 'wrist-flex', w: 3 }, { test: 'wrist-hinge', w: 1 }, { test: 'single-leg', w: 1, side: 'lead' }, { test: 'bridge', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.5), pose: 'impact', scoop: true },
      { k: 'callout', on: 'hands', t: L('the hands behind the clubhead', 'die Hände hinter dem Schlägerkopf'), at: [2.6, 1.3] },
    ]),

  },
  {
    id: 's-posture',
    name: L('Hollow back (S-posture)', 'Hohlkreuz (S-Haltung)'),
    what: L('At address the low back is arched – the core cannot work, the back is loaded.', 'Beim Ansprechen ist der untere Rücken hohl – der Rumpf kann nicht arbeiten, der Rücken wird belastet.'),
    why: L('Poor control of the pelvis, weak glutes and core, tight lats.', 'Wenig Kontrolle über das Becken, schwaches Gesäß und schwacher Rumpf, verkürzter Latissimus.'),
    misses: ['back', 'thin'],
    links: [{ test: 'pelvic-tilt', w: 3 }, { test: 'bridge', w: 2 }, { test: 'lat', w: 1 }],
    sketch: scene([
      { k: 'figure', at: at(1.4), pose: 'address', club: 'iron' },
      { k: 'callout', on: 'pelvis', t: L('the low back arched', 'der untere Rücken hohl'), at: [0.3, 1.2] },
    ]),
  },
];

/**
 * Playing with it today ("teach around it", TPI): until the body moves better, a small change at address or in the swing
 * takes the pressure off the limit – TPI coaches flare the trail foot for a hip that does not turn in, keep the swing
 * short for a stiff upper back (Jon Rahm: short backswing, full separation). One or two per pattern, in player
 * language. REVIEW(golf) – Chris.
 */
export const PLAY_NOW: Record<PatternId, L[]> = {
  'early-extension': [
    L('Turn the trail foot out 20–30° at address – the hip can turn instead of pushing towards the ball.', 'Den hinteren Fuß beim Ansprechen 20–30° ausdrehen – die Hüfte kann drehen statt zum Ball zu schieben.'),
    L('Feel the seat stay on an imagined wall behind you until after impact.', 'Das Gesäß bleibt bis nach dem Treffpunkt an einer gedachten Wand hinter dir.'),
  ],
  'loss-of-posture': [
    L('Swing back only as far as you keep your posture – a three-quarter swing hits it more solid.', 'Nur so weit ausholen, wie du die Haltung hältst – ein Dreiviertelschwung trifft sauberer.'),
    L('Stand a little taller at address, knees soft.', 'Beim Ansprechen etwas aufrechter stehen, Knie locker.'),
  ],
  'over-the-top': [
    L('Start the downswing with the hips, the arms come later – slower back, short pause at the top.', 'Den Abschwung mit der Hüfte beginnen, die Arme kommen später – langsam ausholen, oben kurz warten.'),
    L('Set up a little closed (trail foot back) – it gives the arms room from the inside.', 'Etwas geschlossen stehen (hinterer Fuß zurück) – das gibt den Armen Platz von innen.'),
  ],
  sway: [
    L('Turn the trail foot out 20–30° and keep the weight on the inside of that foot.', 'Den hinteren Fuß 20–30° ausdrehen und das Gewicht auf seiner Innenseite halten.'),
    L('A slightly narrower stance makes turning easier than sliding.', 'Ein etwas schmalerer Stand macht Drehen leichter als Schieben.'),
  ],
  slide: [
    L('Turn the lead foot out 20–30° – the hip can turn through instead of sliding to the target.', 'Den vorderen Fuß 20–30° ausdrehen – die Hüfte kann durchdrehen statt zum Ziel zu schieben.'),
  ],
  'reverse-spine': [
    L('Let the lead heel come up a little in the backswing – it gives the turn more room.', 'Die vordere Ferse im Rückschwung etwas heben lassen – das gibt der Drehung Platz.'),
    L('Swing shorter: stop where the chest stops turning, not where the arms could go.', 'Kürzer ausholen: dort stoppen, wo die Brust aufhört zu drehen, nicht wo die Arme noch könnten.'),
  ],
  'flat-shoulder': [
    L('Bend a little more from the hips at address – the shoulders turn steeper by themselves.', 'Beim Ansprechen etwas mehr aus der Hüfte beugen – die Schultern drehen von selbst steiler.'),
    L('A shorter backswing with the arms in front of the chest.', 'Ein kürzerer Rückschwung, die Arme bleiben vor der Brust.'),
  ],
  'hanging-back': [
    L('Start with a little more weight on the lead foot (about 55 %) and the ball a touch further back.', 'Mit etwas mehr Gewicht auf dem vorderen Fuß beginnen (etwa 55 %), den Ball etwas weiter hinten.'),
  ],
  casting: [
    L('Hinge the wrists early in the backswing – the angle is set before the top.', 'Die Handgelenke früh im Rückschwung abwinkeln – der Winkel steht schon vor dem höchsten Punkt.'),
    L('Three-quarter swings: hold the angle a little longer instead of swinging harder.', 'Dreiviertelschwünge: den Winkel etwas länger halten statt fester zu schlagen.'),
  ],
  'chicken-wing': [
    L('A slightly stronger grip helps the face close without pulling the elbow in.', 'Ein etwas stärkerer Griff hilft, das Schlagblatt zu schließen, ohne den Ellbogen anzuziehen.'),
    L('Short finish: let the forearms turn over, the arms stay long only to hip height.', 'Kurzes Finish: die Unterarme drehen lassen, die Arme nur bis Hüfthöhe lang.'),
  ],
  scooping: [
    L('Ball a touch further back, hands slightly ahead of it at address.', 'Den Ball etwas weiter hinten, die Hände beim Ansprechen leicht davor.'),
    L('Keep more weight on the lead foot through impact.', 'Durch den Treffpunkt mehr Gewicht auf dem vorderen Fuß.'),
  ],
  's-posture': [
    L('At address, roll the pelvis under a little (belt buckle up) – the low back is flat, not hollow.', 'Beim Ansprechen das Becken leicht einrollen (Gürtelschnalle nach oben) – der untere Rücken ist flach, nicht hohl.'),
    L('Knees a little more bent, the weight over the balls of the feet.', 'Die Knie etwas mehr gebeugt, das Gewicht über den Fußballen.'),
  ],
};

// ---------- results ----------
const SCORE: Record<Grade, number> = { pass: 0, limited: 0.5, fail: 1 };
const worse = (a?: Measurement, b?: Measurement): Measurement | undefined => (!a ? b : !b ? a : SCORE[a.grade] >= SCORE[b.grade] ? a : b);

/** lead = the side towards the target: left for a right-hander */
export const leadSide = (hand: 'right' | 'left'): Side => (hand === 'right' ? 'left' : 'right');

/** The measurement of a test that counts for a link (a side or the worse of both). */
export function measurementFor(r: TestResult | undefined, side: 'lead' | 'trail' | undefined, hand: 'right' | 'left'): Measurement | undefined {
  if (!r) return undefined;
  if (r.both) return r.both;
  if (!side) return worse(r.left, r.right);
  const lead = leadSide(hand);
  return side === 'lead' ? r[lead] : r[lead === 'left' ? 'right' : 'left'];
}

/**
 * The last measured value of a test (and side) before this screening – for "last time 44°, now +8°" (Yogger shows
 * two attempts side by side). Camera values only, no pain.
 */
export function previousMeasurement(list: Screening[], test: TestId, side: Side | null, exclude?: string): Measurement | undefined {
  let best: Measurement | undefined;
  for (const s of list) {
    if (s.id === exclude) continue;
    const r = s.results[test];
    const m = side ? r?.[side] : r?.both;
    if (!m || m.source !== 'camera' || m.value == null || m.pain) continue;
    if (!best || m.at > best.at) best = m;
  }
  return best;
}

/** It hurt on one side or both. */
export const hasPain = (r: TestResult | undefined): boolean => !!(r?.both?.pain || r?.left?.pain || r?.right?.pain);

/** The grade of a whole test (the worse side). */
export function testGrade(r: TestResult | undefined): Grade | null {
  const m = r?.both ?? worse(r?.left, r?.right);
  return m ? m.grade : null;
}

export interface PatternResult {
  pattern: Pattern;
  /** 0..1: the weighted share of the linked tests that did not pass */
  score: number;
  level: 'likely' | 'possible';
  /** the tests that point to it (failed or limited), with their grade */
  causes: { test: TestId; grade: Grade; side?: 'lead' | 'trail' }[];
  /** linked tests done / all linked */
  covered: [number, number];
}

/**
 * The swing patterns the body points to, most likely first. Shown only when enough of the linked tests were done (at
 * least 30 % of their weight). Likely: a third of the weight of the done tests did not pass, with a clear fail, and the
 * lost weight is 3 or more (a main cause, or two contributing ones); possible: some limitation.
 */
export function swingPatterns(results: Partial<Record<TestId, TestResult>>, hand: 'right' | 'left'): PatternResult[] {
  const out: PatternResult[] = [];
  for (const p of PATTERNS) {
    const all = p.links.reduce((sum, l) => sum + l.w, 0);
    let total = 0;
    let lost = 0;
    let done = 0;
    let anyFail = false;
    const causes: PatternResult['causes'] = [];
    for (const l of p.links) {
      const m = measurementFor(results[l.test], l.side, hand);
      // pain says nothing about mobility – the test does not count until it is pain-free
      if (!m || m.pain) continue;
      done++;
      total += l.w;
      lost += l.w * SCORE[m.grade];
      if (m.grade !== 'pass') causes.push({ test: l.test, grade: m.grade, side: l.side });
      if (m.grade === 'fail') anyFail = true;
    }
    if (!total || !causes.length || total / all < 0.3) continue;
    const score = lost / total;
    const level = score >= 1 / 3 && anyFail && lost >= 3 ? 'likely' : score >= 0.15 && lost >= 1 ? 'possible' : null;
    if (!level) continue;
    causes.sort((a, b) => SCORE[b.grade] - SCORE[a.grade]);
    out.push({ pattern: p, score, level, causes, covered: [done, p.links.length] });
  }
  return out.sort((a, b) => (a.level === b.level ? b.score - a.score : a.level === 'likely' ? -1 : 1));
}

/** The misses the body points to, most likely first (from the likely patterns, then the possible ones). */
export function likelyMisses(patterns: PatternResult[]): { miss: Miss; from: PatternId[] }[] {
  const by = new Map<Miss, { w: number; from: PatternId[] }>();
  for (const r of patterns) {
    for (const m of r.pattern.misses) {
      const e = by.get(m) ?? { w: 0, from: [] };
      e.w += r.score * (r.level === 'likely' ? 2 : 1);
      e.from.push(r.pattern.id);
      by.set(m, e);
    }
  }
  return [...by.entries()].sort((a, b) => b[1].w - a[1].w).map(([miss, e]) => ({ miss, from: e.from }));
}

/** The newest result of every test over all screenings (a single test done later replaces the older one). */
export function latestResults(list: Screening[]): { results: Partial<Record<TestId, TestResult>>; at: Partial<Record<TestId, string>>; hand: 'right' | 'left' } {
  const results: Partial<Record<TestId, TestResult>> = {};
  const at: Partial<Record<TestId, string>> = {};
  const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let hand: 'right' | 'left' = 'right';
  for (const s of sorted) {
    hand = s.hand;
    for (const [id, r] of Object.entries(s.results) as [TestId, TestResult][]) {
      const when = [r.both?.at, r.left?.at, r.right?.at].filter((x): x is string => !!x).sort().at(-1);
      if (!when) continue;
      if (!at[id] || when > at[id]!) {
        results[id] = r;
        at[id] = when;
      }
    }
  }
  return { results, at, hand };
}
