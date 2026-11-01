import { describe, expect, it } from 'vitest';
import { dueToday, exerciseSec, faultLevel, parsePlan, retestDue, routineSec, runSteps, toScreening, weekCount, weekStart, weeksOf, type PhysioPlan } from './physio';

// a made-up plan in the shape of the file (no player's data)
const FILE = {
  source: 'TPI Level 1 Screen',
  screenedAt: '2026-10-29T16:26:00',
  gfh: 22,
  tests: [
    { name: 'Toe Touch', light: 'red' },
    { name: 'Single Leg Balance', light: 'red', left: 'red', right: 'yellow' },
    { name: 'Setup Posture', light: 'green' },
    { name: 'Cervical Rotation', light: 'yellow' },
  ],
  faults: [
    { name: 'Sway', pct: 83 },
    { name: 'Loss of Posture', pct: 97 },
    { name: 'Flying Elbow', pct: 15 },
  ],
  routine: {
    name: 'Rx',
    exercises: [
      { name: 'Glute squeeze', steps: ['Lie on your back.'], sets: [{ reps: 5, repSec: 15, restSec: 5 }] },
      { name: 'Bridge', sets: [{ reps: 8, repSec: 4, restSec: 15 }, { reps: 8, repSec: 4, restSec: 30 }] },
      { name: 'Hip wipers', perSide: true, sets: [{ reps: 1, repSec: 120, restSec: 1 }] },
      { name: 'Stance', perSide: true, sets: [{ reps: 1, repSec: 15, restSec: 10 }, { reps: 1, repSec: 15, restSec: 10 }, { reps: 1, repSec: 15, restSec: 30 }] },
    ],
  },
};
const plan = () => parsePlan(JSON.stringify(FILE), new Date('2026-11-01T15:00:00')) as PhysioPlan;

describe('the physio plan', () => {
  it('reads the file, sorts the swing characteristics, refuses what is not a plan', () => {
    const p = plan();
    expect(p.routine.exercises).toHaveLength(4);
    expect(p.faults.map((f) => f.name)).toEqual(['Loss of Posture', 'Sway', 'Flying Elbow']);
    expect(p.gfh).toBe(22);
    expect(parsePlan('nope')).toEqual({ error: 'no JSON' });
    expect(parsePlan('{"routine":{"exercises":[]}}')).toEqual({ error: 'no routine' });
    expect(parsePlan('{"routine":{"exercises":[{"name":"x","sets":[{"reps":0,"repSec":3,"restSec":1}]}]}}')).toEqual({ error: 'exercise 1: set' });
  });

  it('times as the physio app does: reps × rep time + rest per set, twice per side', () => {
    const p = plan();
    expect(p.routine.exercises.map(exerciseSec)).toEqual([80, 109, 242, 190]);
    expect(routineSec(p)).toBe(621);
  });

  it('labels the swing characteristics high, moderate, low as the TPI app', () => {
    expect([97, 68, 65, 37, 15].map(faultLevel)).toEqual(['high', 'high', 'moderate', 'moderate', 'low']);
  });

  it('becomes a screening on the day of the physio: red fail, yellow limited, green pass, sides kept; unknown tests left out', () => {
    const s = toScreening(plan(), 'x')!;
    expect(s.finishedAt).toBe(new Date('2026-10-29T16:26:00').toISOString());
    expect(s.from).toBe('TPI Level 1 Screen');
    expect(s.results['toe-touch']?.both?.grade).toBe('fail');
    expect(s.results['single-leg']?.left?.grade).toBe('fail');
    expect(s.results['single-leg']?.right?.grade).toBe('limited');
    expect(s.results.neck?.left?.grade).toBe('limited');
    expect(s.results.neck?.right?.source).toBe('physio');
    expect(s.tests).toEqual(['single-leg', 'neck', 'toe-touch']);
  });

  it('runs every exercise: intro, reps, rest between sets, 5 s to change sides, no rest after the last set', () => {
    const steps = runSteps(plan());
    const ex = (i: number) => steps.filter((s) => s.ex === i);
    expect(ex(0).map((s) => s.kind)).toEqual(['intro', 'rep', 'rep', 'rep', 'rep', 'rep']);
    expect(ex(1).filter((s) => s.kind === 'rep')).toHaveLength(16);
    expect(ex(1).filter((s) => s.kind === 'rest').map((s) => (s as { sec: number }).sec)).toEqual([15]);
    expect(ex(3).map((s) => s.kind).join(' ')).toBe('intro rep rest rep rest rep rest switch rep rest rep rest rep');
  });

  it('the week: sessions counted by day, due on the chosen days or until the count is reached', () => {
    const now = new Date('2026-11-04T12:00:00'); // a Wednesday
    expect(weekStart(now).getDay()).toBe(1);
    const p = plan();
    const log = [
      { id: 'a', at: '2026-11-02T08:00:00', done: 4, of: 4, min: 10, how: 'guided' as const },
      { id: 'b', at: '2026-11-02T19:00:00', done: 2, of: 4, min: 5, how: 'guided' as const },
      { id: 'c', at: '2026-11-03T08:00:00', done: 4, of: 4, min: 10, how: 'entered' as const },
      { id: 'd', at: '2026-10-28T08:00:00', done: 4, of: 4, min: 10, how: 'guided' as const },
    ];
    expect(weekCount(log, now)).toBe(2);
    expect(weeksOf(log, now, 2).map((w) => w.n)).toEqual([2, 1]);
    expect(dueToday({ ...p, log, schedule: { perWeek: 3 } }, now)).toBe(true);
    expect(dueToday({ ...p, log, schedule: { perWeek: 2 } }, now)).toBe(false);
    expect(dueToday({ ...p, log, schedule: { perWeek: 2, days: [0, 2, 4] } }, now)).toBe(true);
    expect(dueToday({ ...p, log, schedule: { perWeek: 2, days: [0, 4] } }, now)).toBe(false);
    expect(dueToday({ ...p, log: [...log, { ...log[0], id: 'e', at: '2026-11-04T07:00:00' }], schedule: { perWeek: 7 } }, now)).toBe(false);
    expect(dueToday({ ...p, log }, now)).toBe(false);
  });

  it('the retest after 4 weeks and 8 sessions, counted from the newest screening', () => {
    const p = { ...plan(), log: Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, at: `2026-11-${String(i + 2).padStart(2, '0')}T08:00:00`, done: 4, of: 4, min: 10, how: 'guided' as const })) };
    expect(retestDue(p, null, new Date('2026-11-20T12:00:00')).due).toBe(false);
    expect(retestDue(p, null, new Date('2026-11-27T12:00:00'))).toMatchObject({ due: true, sessions: 9 });
    expect(retestDue(p, '2026-11-08T08:00:00', new Date('2026-11-27T12:00:00')).due).toBe(false);
  });
});
