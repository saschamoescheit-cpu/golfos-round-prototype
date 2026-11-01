import { describe, expect, it } from 'vitest';
import { localDay, physioDue, physioNote, type PhysioData } from '../../supabase/functions/golfos-push/index';

// the reminder of the physio's routine (Agility, Sascha 1.11.2026): on a training day at the chosen time, once a day,
// not when trained already
const plan = (schedule: PhysioData['schedule'], log: string[] = []): PhysioData => ({
  routine: { name: 'Rx', exercises: [{ sets: [{ reps: 8, repSec: 4, restSec: 15 }, { reps: 8, repSec: 4, restSec: 30 }] }, { perSide: true, sets: [{ reps: 1, repSec: 120, restSec: 1 }] }] },
  schedule,
  log: log.map((at) => ({ at })),
});
const BERLIN = 'Europe/Berlin';
// Wednesday 4.11.2026, 18:40 in Berlin (17:40 UTC)
const wed = new Date('2026-11-04T17:40:00Z');

describe('the physio reminder', () => {
  it('the day on the phone: date, weekday from Monday, minute', () => {
    expect(localDay(BERLIN, wed)).toEqual({ date: '2026-11-04', weekday: 2, minute: 18 * 60 + 40 });
    expect(localDay('America/New_York', wed).minute).toBe(12 * 60 + 40);
  });

  it('on a chosen day from the chosen time until 22:00 – not before, not without a time', () => {
    expect(physioDue(plan({ perWeek: 3, days: [0, 2, 4], remind: '18:30' }), BERLIN, wed)).toBe(true);
    expect(physioDue(plan({ perWeek: 3, days: [0, 2, 4], remind: '19:00' }), BERLIN, wed)).toBe(false);
    expect(physioDue(plan({ perWeek: 3, days: [0, 4], remind: '18:30' }), BERLIN, wed)).toBe(false);
    expect(physioDue(plan({ perWeek: 3, days: [0, 2, 4], remind: null }), BERLIN, wed)).toBe(false);
    expect(physioDue(plan({ perWeek: 3, days: [2], remind: '07:00' }), BERLIN, new Date('2026-11-04T21:10:00Z'))).toBe(false);
  });

  it('not when trained today; without days: until the week has its sessions', () => {
    expect(physioDue(plan({ perWeek: 3, days: [2], remind: '18:30' }, ['2026-11-04T06:00:00Z']), BERLIN, wed)).toBe(false);
    expect(physioDue(plan({ perWeek: 3, remind: '18:30' }, ['2026-11-02T07:00:00Z', '2026-11-03T07:00:00Z']), BERLIN, wed)).toBe(true);
    expect(physioDue(plan({ perWeek: 2, remind: '18:30' }, ['2026-11-02T07:00:00Z', '2026-11-03T07:00:00Z']), BERLIN, wed)).toBe(false);
    // last week's sessions do not count
    expect(physioDue(plan({ perWeek: 2, remind: '18:30' }, ['2026-10-30T07:00:00Z', '2026-10-31T07:00:00Z']), BERLIN, wed)).toBe(true);
  });

  it('says the routine and its minutes, opens Agility', () => {
    const n = physioNote(plan({ perWeek: 3 }), 'de');
    expect(n.body).toMatch(/^Heute ist deine Physio-Routine .Rx. dran – etwa 6 Min.$/);
    expect(n.url).toBe('./#agility');
    expect(physioNote(plan({ perWeek: 3 }), 'en').title).toBe('Training day');
  });
});
