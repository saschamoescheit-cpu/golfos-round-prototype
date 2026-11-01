// The rating of each test as the TPI form has it (Sascha 1.11.2026: "the original TPI rates every test – it should look
// the same and be visible in the app, not editable, with all possible choices"). The questions and their answers follow
// the TPI Level 1 forms of his physio's software word for word (filmed 29.10.2026), in German and English; the answer
// that fits the player's result is marked – "not tested" when the app could not tell (e.g. the help of a second person).
import { L } from '../training/types';

type Text = L;
import { NOTE_CRAMP } from './measure';
import type { Grade, Measurement, Side, TestId, TestResult } from './types';

export interface TpiQuestion {
  q: Text;
  /** the answers in the order of the form; the last is always "painful" */
  options: { label: Text; grade?: Grade }[];
  /** the answer (index into options) for this result – null: not tested */
  pick: (r: TestResult) => number | null;
}

const NOT = L('Did not test', 'Nicht getestet');
const PAIN = L('Painful', 'Schmerzhaft');
const pain = (o: TpiQuestion['options']) => [...o, { label: PAIN, grade: 'fail' as Grade }];

const one = (r: TestResult): Measurement | undefined => r.both ?? r.left ?? r.right;
const sideOf = (r: TestResult, s: Side): Measurement | undefined => r[s] ?? r.both;
/** the index of "painful" in a question of n answers */
const PAINFUL = (n: number) => n;
const has = (m: Measurement | undefined, id: string) => !!m?.checks?.some((c) => c.id === id && !c.ok);
const ok = (m: Measurement | undefined, id: string) => !!m?.checks?.some((c) => c.id === id && c.ok);

/** "good bilaterally / limited bilaterally / limited right / limited left" from the two sides (or one result for both) */
function bilateral(r: TestResult, by: (m: Measurement) => boolean): number | null {
  const l = sideOf(r, 'left');
  const rt = sideOf(r, 'right');
  if (!l && !rt) return null;
  if (l?.pain || rt?.pain) return 4;
  const lOk = l ? by(l) : true;
  const rOk = rt ? by(rt) : true;
  return lOk && rOk ? 0 : !lOk && !rOk ? 1 : !rOk ? 2 : 3;
}
const passes = (m: Measurement) => m.grade === 'pass';
/** a question per side: the answers by the grade, best first */
function perSide(side: Side, q: Text, labels: [Text, Grade][], pickOf: (m: Measurement) => number): TpiQuestion {
  return {
    q,
    options: pain(labels.map(([label, grade]) => ({ label, grade }))),
    pick: (r) => {
      const m = sideOf(r, side);
      if (!m) return null;
      return m.pain ? PAINFUL(labels.length) : pickOf(m);
    },
  };
}
const R = (en: string, de: string) => L(`Right side – ${en}`, `Rechte Seite – ${de}`);
const Lf = (en: string, de: string) => L(`Left side – ${en}`, `Linke Seite – ${de}`);
const sided = (side: Side, en: string, de: string) => (side === 'right' ? R(en, de) : Lf(en, de));
const byGrade = (m: Measurement) => (m.grade === 'pass' ? 0 : m.grade === 'limited' ? 1 : 2);

export const TPI_FORMS: Partial<Record<TestId, TpiQuestion[]>> = {
  'pelvic-tilt': [
    {
      q: L('Pelvic tilt movement pattern?', 'Bewegungsmuster beim Beckenkippen?'),
      options: pain([
        { label: L('Can pelvic tilt in both directions', 'Kann das Becken in beide Richtungen kippen'), grade: 'pass' },
        { label: L('Cannot pelvic tilt in either direction', 'Kann das Becken in keine Richtung kippen'), grade: 'fail' },
        { label: L('Cannot arch the back', 'Kann kein Hohlkreuz machen'), grade: 'limited' },
        { label: L('Cannot flatten the back', 'Kann den Rücken nicht flach machen'), grade: 'limited' },
      ]),
      pick: (r) => {
        const m = one(r);
        if (!m) return null;
        if (m.pain) return 4;
        if (m.checks?.length) return ok(m, 'hollow') && ok(m, 'flat') ? 0 : !ok(m, 'hollow') && !ok(m, 'flat') ? 1 : !ok(m, 'hollow') ? 2 : 3;
        return m.grade === 'fail' ? 1 : 0;
      },
    },
    {
      q: L('Movement quality while flattening the back?', 'Bewegungsqualität beim Flachmachen des Rückens?'),
      options: pain([
        { label: L('Smooth motion while flattening the back', 'Flüssige Bewegung beim Flachmachen'), grade: 'pass' },
        { label: L('Shake and bake (vibration) while flattening the back', 'Zittern („Shake and bake“) beim Flachmachen'), grade: 'limited' },
      ]),
      pick: (r) => {
        const m = one(r);
        if (!m) return null;
        if (m.pain) return 2;
        if (m.checks?.length) return has(m, 'smooth') ? 1 : 0;
        // the physio's or a self-judged rating: yellow with both ways = the shaking (TPI's own yellow for this test)
        return m.grade === 'limited' ? 1 : m.grade === 'pass' ? 0 : null;
      },
    },
  ],
  'pelvic-rotation': [
    {
      q: L('Pelvic rotation without assistance?', 'Beckenrotation ohne Hilfe?'),
      options: pain([
        { label: L('Good bilaterally without assistance', 'Beidseitig gut ohne Hilfe'), grade: 'pass' },
        { label: L('Limited bilaterally without assistance', 'Beidseitig eingeschränkt ohne Hilfe'), grade: 'limited' },
        { label: L('Limited turning right without assistance', 'Eingeschränkt beim Drehen nach rechts'), grade: 'limited' },
        { label: L('Limited turning left without assistance', 'Eingeschränkt beim Drehen nach links'), grade: 'limited' },
      ]),
      pick: (r) => bilateral(r, passes),
    },
    {
      q: L('Pelvic rotation with assistance (shoulders held)?', 'Beckenrotation mit Hilfe (Schultern gehalten)?'),
      options: pain([
        { label: L('Improvement bilaterally with assistance', 'Beidseitig besser mit Hilfe'), grade: 'limited' },
        { label: L('No improvement bilaterally with assistance', 'Beidseitig nicht besser mit Hilfe'), grade: 'fail' },
        { label: L('Right rotation improvement with assistance', 'Rechtsdrehung besser mit Hilfe'), grade: 'limited' },
        { label: L('Left rotation improvement with assistance', 'Linksdrehung besser mit Hilfe'), grade: 'limited' },
      ]),
      // only asked when it was limited – the app cannot hold the shoulders; the physio's yellow = better with help
      pick: (r) => {
        const m = one(r);
        if (m?.pain) return 4;
        return m?.source === 'physio' && m.grade === 'limited' ? 0 : m?.source === 'physio' && m.grade === 'fail' ? 1 : null;
      },
    },
  ],
  'deep-squat': [
    {
      q: L('Overhead deep squat result?', 'Ergebnis tiefe Kniebeuge mit Armen oben?'),
      options: pain([
        { label: L('Full overhead deep squat', 'Volle tiefe Kniebeuge mit Armen oben'), grade: 'pass' },
        { label: L('Arms down full deep squat', 'Volle tiefe Kniebeuge mit Armen unten'), grade: 'limited' },
        { label: L('Arms down limited deep squat', 'Eingeschränkte Kniebeuge auch mit Armen unten'), grade: 'fail' },
      ]),
      pick: (r) => {
        const m = one(r);
        if (!m) return null;
        if (m.pain) return 3;
        if (m.grade === 'pass') return 0;
        // the retest with the hands behind the head: the upper body limits (full) – else the legs or hips (limited)
        return m.cause === 'upper' ? 1 : m.cause ? 2 : m.grade === 'limited' ? 1 : 2;
      },
    },
    {
      q: L('Weight distribution?', 'Gewichtsverteilung?'),
      options: pain([
        { label: L('Weight evenly distributed throughout squat', 'Gewicht gleichmäßig verteilt'), grade: 'pass' },
        { label: L('More weight on right leg during squat', 'Mehr Gewicht auf dem rechten Bein'), grade: 'limited' },
        { label: L('More weight on left leg during squat', 'Mehr Gewicht auf dem linken Bein'), grade: 'limited' },
      ]),
      pick: (r) => {
        const m = one(r);
        if (!m) return null;
        if (m.pain) return 3;
        const shift = m.notes?.find((n) => /weight|Gewicht/i.test(n.en + n.de));
        if (shift) return /right|rechts/i.test(shift.en + shift.de) ? 1 : /left|links/i.test(shift.en + shift.de) ? 2 : null;
        return m.source === 'camera' || m.source === 'physio' ? 0 : null;
      },
    },
  ],
  'toe-touch': [
    {
      q: L('Toe touch result?', 'Ergebnis Zehen berühren?'),
      options: pain([
        { label: L('Good toe touch', 'Zehen gut erreicht'), grade: 'pass' },
        { label: L('Limited toe touch', 'Zehen nicht erreicht'), grade: 'fail' },
      ]),
      pick: (r) => {
        const m = one(r);
        return !m ? null : m.pain ? 2 : m.grade === 'pass' ? 0 : 1;
      },
    },
    {
      q: L('Unilateral toe touch result?', 'Ergebnis Zehen berühren auf einem Bein?'),
      options: pain([
        { label: L('Good bilaterally', 'Beidseitig gut'), grade: 'pass' },
        { label: L('Limited left', 'Links eingeschränkt'), grade: 'limited' },
        { label: L('Limited right', 'Rechts eingeschränkt'), grade: 'limited' },
        { label: L('Limited bilaterally', 'Beidseitig eingeschränkt'), grade: 'fail' },
      ]),
      // one leg forward at a time – not part of the app's test; the physio's red = limited both
      pick: (r) => {
        const m = one(r);
        if (m?.pain) return 4;
        return m?.source === 'physio' && m.grade === 'fail' ? 3 : m?.source === 'physio' && m.grade === 'pass' ? 0 : null;
      },
    },
  ],
  'shoulder-9090': (['right', 'left'] as Side[]).flatMap((side): TpiQuestion[] => [
    perSide(
      side,
      side === 'right' ? L('Standing right side external rotation?', 'Außenrotation rechts im Stehen?') : L('Standing left side external rotation?', 'Außenrotation links im Stehen?'),
      [
        [sided(side, 'Greater than spine angle', 'Mehr als der Wirbelsäulenwinkel'), 'pass'],
        [sided(side, 'Equal to spine angle', 'Gleich dem Wirbelsäulenwinkel'), 'limited'],
        [sided(side, 'Less than spine angle', 'Weniger als der Wirbelsäulenwinkel'), 'fail'],
      ],
      byGrade,
    ),
    {
      q: side === 'right' ? L('Golf posture right side external rotation difference?', 'Außenrotation rechts in Golfhaltung im Vergleich?') : L('Golf posture left side external rotation difference?', 'Außenrotation links in Golfhaltung im Vergleich?'),
      options: pain([
        { label: sided(side, 'Same as or greater than standing (golf posture)', 'In Golfhaltung gleich oder mehr als im Stehen'), grade: 'pass' },
        { label: sided(side, 'Less than standing (golf posture)', 'In Golfhaltung weniger als im Stehen'), grade: 'limited' },
      ]),
      // the app measures in golf posture only: a good value there is at least the standing one
      pick: (r) => {
        const m = sideOf(r, side);
        return !m ? null : m.pain ? 2 : m.grade === 'pass' ? 0 : null;
      },
    },
  ]),
  'single-leg': (['right', 'left'] as Side[]).map((side) =>
    perSide(
      side,
      side === 'right' ? L('Right side duration with eyes closed?', 'Dauer rechts mit geschlossenen Augen?') : L('Left side duration with eyes closed?', 'Dauer links mit geschlossenen Augen?'),
      [
        [sided(side, 'Greater than 15 seconds', 'Mehr als 15 Sekunden'), 'pass'],
        [sided(side, '11–15 seconds', '11–15 Sekunden'), 'limited'],
        [sided(side, '6–10 seconds', '6–10 Sekunden'), 'limited'],
        [sided(side, '0–5 seconds', '0–5 Sekunden'), 'fail'],
      ],
      (m) => (m.value == null ? (m.grade === 'pass' ? 0 : m.grade === 'limited' ? 2 : 3) : m.value > 15 ? 0 : m.value > 10 ? 1 : m.value > 5 ? 2 : 3),
    ),
  ),
  lat: (['right', 'left'] as Side[]).map((side) =>
    perSide(
      side,
      side === 'right' ? L('Right side range of motion?', 'Bewegungsumfang rechts?') : L('Left side range of motion?', 'Bewegungsumfang links?'),
      [
        [sided(side, 'Touches the wall', 'Berührt die Wand'), 'pass'],
        [sided(side, 'Between the nose and the wall', 'Zwischen Nase und Wand'), 'limited'],
        [sided(side, 'Covers the nose', 'Verdeckt die Nase'), 'fail'],
        [sided(side, 'Below the nose', 'Unter der Nase'), 'fail'],
      ],
      (m) => (m.value == null ? byGrade(m) : m.value >= 165 ? 0 : m.value >= 140 ? 1 : m.value >= 120 ? 2 : 3),
    ),
  ),
  'lower-quarter': [
    {
      q: L('Backswing rotation range of motion?', 'Bewegungsumfang Richtung Rückschwung?'),
      options: pain([
        { label: L('Backswing – greater than 60° bilaterally', 'Rückschwung – mehr als 60° beidseitig'), grade: 'pass' },
        { label: L('Backswing – right side limited rotation', 'Rückschwung – rechts eingeschränkt'), grade: 'limited' },
        { label: L('Backswing – left side limited rotation', 'Rückschwung – links eingeschränkt'), grade: 'limited' },
        { label: L('Backswing – limited rotation bilaterally', 'Rückschwung – beidseitig eingeschränkt'), grade: 'fail' },
      ]),
      pick: (r) => {
        const b = bilateral(r, passes);
        return b == null ? null : [0, 3, 1, 2, 4][b];
      },
    },
    {
      q: L('Downswing rotation range of motion?', 'Bewegungsumfang Richtung Durchschwung?'),
      options: pain([
        { label: L('Downswing – greater than 60° bilaterally', 'Durchschwung – mehr als 60° beidseitig'), grade: 'pass' },
        { label: L('Downswing – right side limited rotation', 'Durchschwung – rechts eingeschränkt'), grade: 'limited' },
        { label: L('Downswing – left side limited rotation', 'Durchschwung – links eingeschränkt'), grade: 'limited' },
        { label: L('Downswing – limited rotation bilaterally', 'Durchschwung – beidseitig eingeschränkt'), grade: 'fail' },
      ]),
      // the app measures each leg with both turns together – the same rating for both directions
      pick: (r) => {
        const b = bilateral(r, passes);
        return b == null ? null : [0, 3, 1, 2, 4][b];
      },
    },
  ],
  'seated-rotation': (['right', 'left'] as Side[]).map((side) =>
    perSide(
      side,
      side === 'right' ? L('Right side rotation range of motion?', 'Drehumfang rechts?') : L('Left side rotation range of motion?', 'Drehumfang links?'),
      [
        [sided(side, 'Greater than 45°', 'Mehr als 45°'), 'pass'],
        [sided(side, 'Equal to 45°', 'Genau 45°'), 'limited'],
        [sided(side, 'Less than 45°', 'Weniger als 45°'), 'fail'],
      ],
      (m) => (m.value == null ? byGrade(m) : m.value > 47 ? 0 : m.value >= 43 ? 1 : 2),
    ),
  ),
  bridge: (['right', 'left'] as Side[]).map((side) =>
    perSide(
      side,
      side === 'right' ? L('Right side test result?', 'Ergebnis rechts?') : L('Left side test result?', 'Ergebnis links?'),
      [
        [sided(side, 'Normal (more than 10 seconds)', 'Normal (mehr als 10 Sekunden)'), 'pass'],
        [sided(side, 'Weak (less than 10 seconds)', 'Schwach (weniger als 10 Sekunden)'), 'limited'],
        [sided(side, 'Cramp', 'Krampf'), 'fail'],
      ],
      (m) => (m.notes?.some((n) => n.en === NOTE_CRAMP.en) ? 2 : m.grade === 'pass' ? 0 : m.source === 'physio' && m.grade === 'fail' ? 2 : 1),
    ),
  ),
  neck: (['right', 'left'] as Side[]).map((side) =>
    perSide(
      side,
      side === 'right' ? L('Right side cervical rotation range of motion?', 'Halsdrehung rechts?') : L('Left side cervical rotation range of motion?', 'Halsdrehung links?'),
      [
        [sided(side, 'Normal', 'Normal'), 'pass'],
        [sided(side, 'Limited (cannot rotate to mid-clavicle)', 'Eingeschränkt (Kinn erreicht die Schlüsselbeinmitte nicht)'), 'limited'],
      ],
      (m) => (m.grade === 'pass' ? 0 : 1),
    ),
  ),
};

/** "normal / limited bilaterally / limited right / limited left" – the hand tests, per direction */
function handQuestion(q: Text, what: [string, string], normal: [string, string]): TpiQuestion {
  const [en, de] = what;
  return {
    q,
    options: pain([
      { label: L(`${en} – ${normal[0]}`, `${de} – ${normal[1]}`), grade: 'pass' },
      { label: L(`${en} – limited bilaterally`, `${de} – beidseitig eingeschränkt`), grade: 'fail' },
      { label: L(`${en} – limited right`, `${de} – rechts eingeschränkt`), grade: 'limited' },
      { label: L(`${en} – limited left`, `${de} – links eingeschränkt`), grade: 'limited' },
    ]),
    // the camera rates the whole movement of each hand (both directions together): the same answer for both questions
    pick: (r) => bilateral(r, passes),
  };
}

TPI_FORMS.forearm = [
  handQuestion(L('Forearm pronation (palms rotating down) range of motion?', 'Unterarm-Pronation (Handflächen nach unten)?'), ['Pronation', 'Pronation'], ['normal (more than 80°)', 'normal (mehr als 80°)']),
  handQuestion(L('Forearm supination (palms rotating up) range of motion?', 'Unterarm-Supination (Handflächen nach oben)?'), ['Supination', 'Supination'], ['normal (more than 80°)', 'normal (mehr als 80°)']),
];
TPI_FORMS['wrist-hinge'] = [
  handQuestion(L('Wrist hinge up (radial deviation) range of motion?', 'Handgelenk nach oben anwinkeln (Radialabduktion)?'), ['Radial deviation', 'Radialabduktion'], ['normal bilaterally', 'beidseitig normal']),
  handQuestion(L('Wrist hinge down (ulnar deviation) range of motion?', 'Handgelenk nach unten anwinkeln (Ulnarabduktion)?'), ['Ulnar deviation', 'Ulnarabduktion'], ['normal bilaterally', 'beidseitig normal']),
];
TPI_FORMS['wrist-flex'] = [
  handQuestion(L('Wrist flexion (bowing) range of motion?', 'Handgelenk beugen?'), ['Flexion', 'Beugung'], ['normal bilaterally (60° or more)', 'beidseitig normal (60° oder mehr)']),
  handQuestion(L('Wrist extension (cupping) range of motion?', 'Handgelenk strecken?'), ['Extension', 'Streckung'], ['normal bilaterally (60° or more)', 'beidseitig normal (60° oder mehr)']),
];

export const NOT_TESTED = NOT;
