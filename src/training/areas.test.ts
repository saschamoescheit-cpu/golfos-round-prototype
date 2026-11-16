import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './content';
import { PLANS } from './content/plans';
import { AREAS, areaOf, levelForHcp, plansForYou } from './areas';

// The topics in five areas, "Für dich" in Üben (Sascha 17.11.2026, the overhaul of Training).
describe('areas', () => {
  it('every topic in exactly one area, no area names a topic that is not there', () => {
    const all = AREAS.flatMap((a) => a.cats);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });
  it('every ready-made plan lands in an area by its first topic', () => {
    for (const p of PLANS) expect(AREAS.some((a) => a.id === areaOf(p.focus[0])), p.id).toBe(true);
  });
  it('the level of a handicap: up to 10 Können, 11–20 Fortgeschritten, else Einsteiger', () => {
    expect(levelForHcp(4.2)).toBe(3);
    expect(levelForHcp(15)).toBe(2);
    expect(levelForHcp(28)).toBe(1);
    expect(levelForHcp(null)).toBe(1);
  });
  it('für dich: the weak spot of the rounds first, then the level; never a weekly plan, never twice', () => {
    const mine = plansForYou(PLANS, [{ cat: 'bunker' }], 15);
    expect(mine.length).toBe(3);
    expect(mine[0].focus[0]).toBe('bunker');
    expect(mine.every((p) => !p.week)).toBe(true);
    expect(new Set(mine).size).toBe(mine.length);
    const none = plansForYou(PLANS, [], 4);
    expect(none.length).toBeGreaterThan(0);
    // no Einsteiger plan for a handicap of 4 (there is no plan of level 3 – the level below, then the plans for everyone)
    expect(none.every((p) => p.level !== 1)).toBe(true);
  });
});
