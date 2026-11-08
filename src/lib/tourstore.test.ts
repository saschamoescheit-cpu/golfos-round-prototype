import { describe, expect, it } from 'vitest';
import { cutAfterAdding, type SeriesRound } from './tourstore';

// Yesterday's tournament taken into the series that starts on Monday (Sascha 08.11.2026): the cut stays after the same
// round as set – the rounds before it are one more.
const round = (date: string): SeriesRound => ({ code: date, date, name: date, course: { id: 'c', name: 'C' } });
const orlando = { rounds: [round('2026-11-09'), round('2026-11-10'), round('2026-11-11')], multi: { cut: { after: 2, top: 4 } } };

describe('a tournament taken into a series', () => {
  it('before the cut: the cut moves one on', () => {
    expect(cutAfterAdding(orlando, '2026-11-07')).toEqual({ after: 3, top: 4 });
  });
  it('after the cut: the cut stays', () => {
    expect(cutAfterAdding(orlando, '2026-11-12')).toEqual({ after: 2, top: 4 });
  });
  it('no cut: nothing to move', () => {
    expect(cutAfterAdding({ rounds: orlando.rounds }, '2026-11-07')).toBeUndefined();
  });
});
