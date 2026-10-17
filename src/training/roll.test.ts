import { describe, expect, it } from 'vitest';
import { ballsAt, rollPlan } from './roll';
import { DRILLS } from './content';
import type { Sketch } from './types';

// The ball on the top views (17.10.2026): it follows the drawn paths from a ball, a flight and its roll belong to the
// same ball, arrows between boxes are not a ball's path.

const chip: Sketch = {
  view: 'top',
  w: 4,
  h: 8,
  items: [
    { k: 'ball', at: [2, 1] },
    { k: 'path', pts: [[2, 1], [2, 4]], style: 'flight' },
    { k: 'path', pts: [[2, 4], [2, 7]], style: 'roll', arrow: true },
    { k: 'hole', at: [2, 7] },
  ],
};

describe('the ball on the top views', () => {
  it('a chip: flight, then roll – one ball', () => {
    const plan = rollPlan(chip)!;
    expect(plan.segs.map((s) => s.flight)).toEqual([true, false]);
    expect(plan.starts).toHaveLength(1);
    // in the middle of the flight it is in the air, at the end it lies at the hole
    const mid = ballsAt(plan, plan.segs[0].start + plan.segs[0].dur / 2);
    expect(mid[0].lift).toBeGreaterThan(0.9);
    const end = ballsAt(plan, plan.total);
    expect(end).toEqual([{ at: [2, 7], lift: 0 }]);
  });

  it('a putt slows down: more way in the first half than in the second', () => {
    const plan = rollPlan({ view: 'top', w: 4, h: 8, items: [{ k: 'ball', at: [2, 1] }, { k: 'path', pts: [[2, 1], [2, 7]], style: 'roll' }] })!;
    const s = plan.segs[0];
    const y = (u: number) => ballsAt(plan, s.start + s.dur * u)[0].at[1];
    expect(y(0.5) - 1).toBeGreaterThan(7 - y(0.5));
  });

  it('an arrow between boxes is not a ball, aim lines stay still', () => {
    expect(rollPlan({ view: 'top', w: 4, h: 6, items: [{ k: 'path', pts: [[2, 4], [2, 3]], style: 'roll', arrow: true }] })).toBeNull();
    expect(rollPlan({ view: 'top', w: 4, h: 6, items: [{ k: 'ball', at: [2, 1] }, { k: 'path', pts: [[2, 1], [2, 5]], style: 'aim' }] })).toBeNull();
  });

  it('several balls one after another: the finished ones stay where they stopped', () => {
    const plan = rollPlan({
      view: 'top',
      w: 6,
      h: 8,
      items: [
        { k: 'ball', at: [3, 1] },
        { k: 'path', pts: [[3, 1], [1, 6]], style: 'roll' },
        { k: 'path', pts: [[3, 1], [5, 6]], style: 'roll' },
      ],
    })!;
    expect(plan.segs).toHaveLength(2);
    const during2 = ballsAt(plan, plan.segs[1].start + 0.1);
    expect(during2).toHaveLength(2);
    expect(during2[0].at).toEqual([1, 6]);
  });

  it('the putting and chipping drills have a ball that moves', () => {
    for (const id of ['tiger-gate', 'lag-circle', 'landing-ring', 'three-speeds', 'draw-on-purpose']) {
      const d = DRILLS.find((x) => x.id === id);
      expect(d?.sketch && rollPlan(d.sketch), id).toBeTruthy();
    }
  });
});
