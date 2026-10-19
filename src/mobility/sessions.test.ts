import { describe, expect, it } from 'vitest';
import { gains, type DrillDone, type TrainSession } from './sessions';

const at = '2026-10-19T07:00:00Z';
const done = (drill: string, best: number | null, more: Partial<DrillDone> = {}): DrillDone => ({ drill, sets: [{ side: null, reps: 10, target: 10, best }], at, ...more });
const session = (d: DrillDone[]): TrainSession => ({ id: 's', startedAt: at, finishedAt: at, minutes: 15, drills: d.map((x) => x.drill), done: d });

describe('training gains', () => {
  it('names the measured drills that went further than the last time, the biggest first', () => {
    const s = session([done('seated-rotation', 40), done('mob-pelvic-turn', 31), done('mob-toe-touch', -4)]);
    const g = gains(s, { 'seated-rotation': 35, 'mob-pelvic-turn': 20, 'mob-toe-touch': 2 });
    // (the order against the smallest clear change: 6 cm are 6 steps of 1 cm, 11° under 4 steps of 3°)
    expect(g.map((x) => x.drill)).toEqual(['mob-toe-touch', 'mob-pelvic-turn', 'seated-rotation']);
    // the fingertips: lower is better (6 cm further down)
    expect(g.find((x) => x.drill === 'mob-toe-touch')!.by).toBe(6);
  });

  it('leaves out small changes, first times, count-only drills and drills that hurt', () => {
    const s = session([done('seated-rotation', 37), done('mob-pelvic-turn', 30), done('hip-9090', null), done('deep-squat', 20, { pain: true })]);
    expect(gains(s, { 'seated-rotation': 35, 'mob-pelvic-turn': null, 'hip-9090': 0, 'deep-squat': 5 })).toEqual([]);
  });
});
