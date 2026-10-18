import { describe, expect, it } from 'vitest';
import { DRILL_COACH, RepCounter, SIGNALS, Signal, drillSeconds, setsOf, signalValueText, type SignalId } from './drillcoach';
import { bridgeBody, frontBody, latBody, squatBody, toeTouchBody } from './synth';
import { TESTS } from './tests';
import type { Frame, Lm } from './measure';

const W = 720;
const H = 1280;
/** a drill done n times: the body at k = 0 (rest) … 1 (furthest) and back, 2.5 s per rep at 20 pictures a second */
function run(id: SignalId, body: (k: number) => Lm[], reps: number, still = 10) {
  const sig = new Signal(id);
  const count = new RepCounter(SIGNALS[id]);
  let t = 0;
  for (let i = 0; i < still; i++) sig.calibrate({ lm: body(0), w: W, h: H, t: (t += 50) });
  let n = 0;
  const per = 50;
  for (let r = 0; r < reps; r++)
    for (let i = 0; i < per; i++) {
      const k = Math.sin((Math.PI * i) / per);
      const f: Frame = { lm: body(k), w: W, h: H, t: (t += 50) };
      if (count.push(sig.value(f))) n++;
    }
  // back at rest at the end (the last rep counts when the player comes back)
  for (let i = 0; i < 6; i++) if (count.push(sig.value({ lm: body(0), w: W, h: H, t: (t += 50) }))) n++;
  return { n, best: count.best, reps: count.reps };
}

describe('drill coach', () => {
  it('has a plan for every drill the tests point to', () => {
    const ids = new Set(TESTS.flatMap((t) => t.drills));
    for (const id of ids) expect(DRILL_COACH[id], id).toBeTruthy();
    for (const c of Object.values(DRILL_COACH)) {
      expect(c.reps || c.hold).toBeTruthy();
      expect(drillSeconds(c)).toBeGreaterThan(20);
    }
  });

  it('runs the sets per side, left first', () => {
    expect(setsOf({ view: 'front', where: { en: '', de: '' }, sides: true, sets: 2, reps: 5 })).toEqual(['left', 'left', 'right', 'right']);
    expect(setsOf({ view: 'front', where: { en: '', de: '' }, reps: 5 })).toEqual([null]);
  });

  it('counts chest turns and measures how far they go', () => {
    const r = run('turn', (k) => frontBody({ trunk: 50 * k }), 6);
    expect(r.n).toBe(6);
    expect(r.best!).toBeGreaterThan(42);
    expect(r.best!).toBeLessThan(58);
  });

  it('counts hip turns', () => {
    const r = run('hipTurn', (k) => frontBody({ pelvis: 35 * k }), 5);
    expect(r.n).toBe(5);
    expect(r.best!).toBeGreaterThan(28);
  });

  it('counts head turns', () => {
    const r = run('head', (k) => frontBody({ head: 70 * k }), 4);
    expect(r.n).toBe(4);
    expect(r.best!).toBeGreaterThan(50);
  });

  it('counts squats and measures the depth', () => {
    const deep = run('squat', (k) => squatBody(k, 8), 5);
    expect(deep.n).toBe(5);
    expect(deep.best!).toBeGreaterThan(0);
    const stiff = run('squat', (k) => squatBody(k, -15), 5);
    expect(stiff.n).toBe(5);
    expect(stiff.best!).toBeLessThan(0);
  });

  it('counts toe touches – less is better (nearer the toes)', () => {
    const r = run('reach', (k) => toeTouchBody(k, 0.05), 4);
    expect(r.n).toBe(4);
    expect(r.best!).toBeGreaterThan(-5);
    expect(r.best!).toBeLessThan(15);
  });

  it('counts knee to wall by the shin angle', () => {
    const r = run('shin', (k) => squatBody(k * 0.6, 0), 5);
    expect(r.n).toBe(5);
    expect(r.best!).toBeGreaterThan(10);
  });

  it('counts bridges by the hip extension', () => {
    const r = run('hipExt', (k) => bridgeBody('left', false, 0, k > 0.5), 6);
    expect(r.n).toBe(6);
    expect(r.best!).toBeGreaterThan(150);
  });

  it('counts wall angels by the arm height', () => {
    const r = run('arms', (k) => latBody(80 + 80 * k), 5);
    expect(r.n).toBe(5);
    expect(r.best!).toBeGreaterThan(140);
  });

  it('counts band external rotations and measures how far the forearms turn out', () => {
    const r = run('shoulderEr', (k) => frontBody({ er: 80 * k }), 6);
    expect(r.n).toBe(6);
    expect(r.best!).toBeGreaterThan(65);
    expect(r.best!).toBeLessThan(90);
    const stiff = run('shoulderEr', (k) => frontBody({ er: 45 * k }), 4);
    expect(stiff.n).toBe(4);
    expect(stiff.best!).toBeLessThan(55);
  });

  it('counts clamshells by the opening of the knees', () => {
    const r = run('kneeOpen', (k) => frontBody({ kneeOpen: 40 * k }), 5);
    expect(r.n).toBe(5);
    expect(r.best!).toBeGreaterThan(40);
  });

  it('counts the 90/90 switches – every pass through the middle', () => {
    // from the left to the right and back: two switches per loop
    const sig = new Signal('sideSwitch');
    const count = new RepCounter(SIGNALS.sideSwitch);
    let t = 0;
    let n = 0;
    for (let i = 0; i < 5 * 60; i++) {
      const x = 0.2 * Math.cos((Math.PI * i) / 30);
      if (count.push(sig.value({ lm: frontBody({ kneeShift: x }), w: W, h: H, t: (t += 50) }))) n++;
    }
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(10);
    expect(SIGNALS.sideSwitch.countOnly).toBe(true);
  });

  it('sees one foot off the floor', () => {
    const sig = new Signal('oneLeg');
    expect(sig.value({ lm: frontBody({}), w: W, h: H, t: 0 })).toBe(0);
    expect(sig.value({ lm: frontBody({ lift: 'right' }), w: W, h: H, t: 0 })).toBe(1);
  });

  it('counts quick turns left – right with few pictures per rep (through the middle in one or two pictures)', () => {
    const sig = new Signal('hipTurn');
    const count = new RepCounter(SIGNALS.hipTurn);
    let t = 0;
    for (let i = 0; i < 10; i++) sig.calibrate({ lm: frontBody({}), w: W, h: H, t: (t += 33) });
    // 10 turns to one side or the other, 7 pictures each: 35° · |sin| – the middle (0°) shows up in one picture only
    let n = 0;
    for (let r = 0; r < 10; r++)
      for (let i = 0; i < 7; i++) {
        const a = 35 * Math.sin((Math.PI * (r * 7 + i + 0.5)) / 7);
        if (count.push(sig.value({ lm: frontBody({ pelvis: a }), w: W, h: H, t: (t += 33) }))) n++;
      }
    for (let i = 0; i < 4; i++) if (count.push(sig.value({ lm: frontBody({}), w: W, h: H, t: (t += 33) }))) n++;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(10);
  });

  it('does not count a body that stands still or points that are not seen', () => {
    expect(run('turn', () => frontBody({ trunk: 3 }), 4).n).toBe(0);
    const c = new RepCounter(SIGNALS.squat);
    for (let i = 0; i < 50; i++) expect(c.push(null)).toBe(false);
    expect(c.reps).toBe(0);
  });

  it('says the values in words', () => {
    const tr = (_en: string, de: string) => de;
    expect(signalValueText('reach', 4.2, tr)).toBe('4 cm über den Zehen');
    expect(signalValueText('reach', -3, tr)).toBe('3 cm über die Zehen hinaus');
    expect(signalValueText('squat', -12, tr)).toBe('Oberschenkel 12° über waagrecht');
    expect(signalValueText('shin', 37.6, tr)).toBe('38°');
  });
});
