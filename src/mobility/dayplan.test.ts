import { describe, expect, it } from 'vitest';
import { buildDayPlan, DAY_MINUTES, drillTime, PREP_DRILLS } from './dayplan';
import { DRILL_COACH } from './drillcoach';

// a typical pillar: hips, spine and shoulders in focus, the rest below the goal
const FOCUS = ['mob-pelvic-turn', 'hip-9090', 'pallof-press', 'open-books', 'mob-thread-needle', 'seated-rotation', 'mob-9090-stretch', 'mob-band-er'];
const MORE = ['mob-ankle-wall', 'deep-squat', 'mob-toe-touch', 'glute-bridge', 'single-leg-balance', 'mob-neck-turn', 'mob-wrist-hinge', 'mob-lat-stretch', 'mob-wall-angels', 'mob-prone-y'];

describe('the plan of the day', () => {
  it('fills each time a day close to the minutes (within 10 %)', () => {
    for (const m of DAY_MINUTES) {
      const p = buildDayPlan({ minutes: m, focus: FOCUS, more: MORE });
      expect(p.seconds / 60, `${m} min`).toBeGreaterThan(m * 0.85);
      expect(p.seconds / 60, `${m} min`).toBeLessThanOrEqual(m * 1.05);
      expect(new Set(p.drills).size).toBe(p.drills.length);
    }
  });
  it('a longer day has more – never fewer drills or sets', () => {
    const plans = DAY_MINUTES.map((m) => buildDayPlan({ minutes: m, focus: FOCUS, more: MORE }));
    for (let i = 1; i < plans.length; i++) expect(plans[i].seconds).toBeGreaterThan(plans[i - 1].seconds);
  });
  it('15 min: the focus only, no warm-up', () => {
    const p = buildDayPlan({ minutes: 15, focus: FOCUS, more: MORE });
    expect(p.warm).toEqual([]);
    expect(p.drills.every((d) => FOCUS.includes(d))).toBe(true);
    expect(p.drills[0]).toBe(FOCUS[0]);
  });
  it('from 30 min: moving through first, then the focus in its order', () => {
    const p = buildDayPlan({ minutes: 30, focus: FOCUS, more: MORE });
    expect(p.warm.length).toBe(2);
    expect(p.drills.slice(0, 2)).toEqual(p.warm);
    // hip-9090 and open-books are in the focus: the warm-up takes cat-camel and nothing the focus has
    expect(p.warm).toContain('mob-cat-camel');
    expect(p.warm.some((w) => FOCUS.includes(w))).toBe(false);
    const focusOrder = p.drills.filter((d) => FOCUS.includes(d));
    expect(focusOrder).toEqual(FOCUS.filter((d) => focusOrder.includes(d)));
  });
  it('60 min: every focus drill, other areas, and more sets where time is left', () => {
    const short = buildDayPlan({ minutes: 60, focus: FOCUS.slice(0, 3), more: MORE.slice(0, 2) });
    expect(short.drills).toEqual(expect.arrayContaining(FOCUS.slice(0, 3)));
    expect(Object.keys(short.extraSets).length).toBeGreaterThan(0);
    for (const v of Object.values(short.extraSets)) expect(v).toBeLessThanOrEqual(3);
    const p = buildDayPlan({ minutes: 60, focus: FOCUS, more: MORE });
    expect(p.drills.filter((d) => MORE.includes(d)).length).toBeGreaterThan(0);
  });
  it('an extra set is counted in the time', () => {
    expect(drillTime('mob-pelvic-turn', 1)).toBeGreaterThan(drillTime('mob-pelvic-turn'));
  });
  it('the warm-up drills are led drills', () => {
    for (const id of PREP_DRILLS) expect(DRILL_COACH[id], id).toBeTruthy();
  });
  it('always one drill, even a long one in a short day', () => {
    const p = buildDayPlan({ minutes: 15, focus: [], more: ['mob-wrist-stretch'] });
    expect(p.drills).toEqual(['mob-wrist-stretch']);
  });
});
