import { describe, expect, it } from 'vitest';
import { NOTE_CRAMP } from './measure';
import { TPI_FORMS } from './tpiform';
import type { Grade, Measurement, TestId, TestResult } from './types';

const at = '2026-10-29T15:30:00Z';
const m = (grade: Grade, value: number | null = null, more: Partial<Measurement> = {}): Measurement => ({ value, grade, source: 'camera', at, ...more });
/** the label (German) of the answer each question of the test marks */
const answers = (id: TestId, r: TestResult) =>
  TPI_FORMS[id]!.map((q) => {
    const i = q.pick(r);
    return i == null ? 'Nicht getestet' : q.options[i].label.de;
  });

describe('the TPI form of each test', () => {
  it('every question ends with "painful", and pain marks it', () => {
    for (const [id, qs] of Object.entries(TPI_FORMS)) {
      for (const q of qs!) expect(q.options.at(-1)!.label.de, id).toBe('Schmerzhaft');
      const r: TestResult = { both: m('fail', null, { pain: true }), left: m('fail', null, { pain: true }), right: m('fail', null, { pain: true }) };
      for (const q of qs!) expect(q.pick(r), id).toBe(q.options.length - 1);
    }
  });

  it('the balance in the seconds of the form, per side', () => {
    expect(answers('single-leg', { left: m('fail', 4), right: m('pass', 22) })).toEqual(['Rechte Seite – Mehr als 15 Sekunden', 'Linke Seite – 0–5 Sekunden']);
    expect(answers('single-leg', { left: m('limited', 12), right: m('limited', 8) })).toEqual(['Rechte Seite – 6–10 Sekunden', 'Linke Seite – 11–15 Sekunden']);
  });

  it('the pelvic tilt: both ways but shaking – as the physio rated it', () => {
    const checks = [
      { id: 'hollow', label: { en: '', de: '' }, ok: true },
      { id: 'flat', label: { en: '', de: '' }, ok: true },
      { id: 'smooth', label: { en: '', de: '' }, ok: false },
    ];
    expect(answers('pelvic-tilt', { both: m('limited', 12, { checks }) })).toEqual(['Kann das Becken in beide Richtungen kippen', 'Zittern („Shake and bake“) beim Flachmachen']);
    expect(answers('pelvic-tilt', { both: m('limited', null, { source: 'physio' }) })[1]).toBe('Zittern („Shake and bake“) beim Flachmachen');
  });

  it('the bridge: a cramp is its own answer', () => {
    expect(answers('bridge', { left: m('fail', 5, { notes: [NOTE_CRAMP] }), right: m('pass', 10) })).toEqual(['Rechte Seite – Normal (mehr als 10 Sekunden)', 'Linke Seite – Krampf']);
  });

  it('the lower quarter: one leg short, both short; what the app cannot do stays "not tested"', () => {
    expect(answers('lower-quarter', { left: m('fail', 40), right: m('pass', 65) })[0]).toBe('Rückschwung – links eingeschränkt');
    expect(answers('lower-quarter', { left: m('fail', 40), right: m('fail', 42) })[0]).toBe('Rückschwung – beidseitig eingeschränkt');
    expect(answers('pelvic-rotation', { both: m('limited', 22) })).toEqual(['Beidseitig eingeschränkt ohne Hilfe', 'Nicht getestet']);
    expect(answers('pelvic-rotation', { both: m('limited', null, { source: 'physio' }) })[1]).toBe('Beidseitig besser mit Hilfe');
  });

  it('the hands: normal both, or the hand that is short', () => {
    expect(answers('forearm', { both: m('pass', 93) })).toEqual(['Pronation – normal (mehr als 80°)', 'Supination – normal (mehr als 80°)']);
    expect(answers('wrist-hinge', { left: m('pass', 60), right: m('limited', 35) })[0]).toBe('Radialabduktion – rechts eingeschränkt');
  });
});
