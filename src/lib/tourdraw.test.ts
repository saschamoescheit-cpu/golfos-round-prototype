import { describe, expect, it } from 'vitest';
import { deal, drawOrder, flightSizes, madeCut, shuffled, teeSlots } from './tourdraw';

const ps = [
  { id: 'a', hcp: 12.4 },
  { id: 'b', hcp: 3.1 },
  { id: 'c', hcp: null },
  { id: 'd', hcp: 24 },
  { id: 'e', hcp: 7 },
];

describe('the draw of a tournament round', () => {
  it('spreads the players evenly into flights of the size chosen', () => {
    expect(flightSizes(10, 4)).toEqual([4, 3, 3]);
    expect(flightSizes(9, 3)).toEqual([3, 3, 3]);
    expect(flightSizes(10, 3)).toEqual([3, 3, 2, 2]);
    expect(flightSizes(5, 2)).toEqual([3, 2]);
    expect(flightSizes(1, 4)).toEqual([1]);
    expect(flightSizes(4, 4)).toEqual([4]);
    expect(flightSizes(0, 4)).toEqual([]);
  });
  it('orders by handicap up and down – none known counts as the highest', () => {
    expect(drawOrder('hcpAsc', ps)).toEqual(['b', 'e', 'a', 'd', 'c']);
    expect(drawOrder('hcpDesc', ps)).toEqual(['c', 'd', 'a', 'e', 'b']);
  });
  it('by result: the worst first, the best last; a tie the higher handicap earlier; no result first', () => {
    // to par: lower is better
    expect(drawOrder('result', ps, { results: { a: 4, b: -2, d: 4, e: 10 } })).toEqual(['c', 'e', 'd', 'a', 'b']);
    // Stableford: more points are better
    expect(drawOrder('result', ps, { results: { a: 70, b: 80, c: 60, d: 75, e: 75 }, higherBetter: true })).toEqual(['c', 'a', 'd', 'e', 'b']);
  });
  it('random: every player once, the same with the same seed', () => {
    const one = drawOrder('random', ps, { seed: 42 });
    expect([...one].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(drawOrder('random', ps, { seed: 42 })).toEqual(one);
    expect(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 1)).not.toEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 2));
  });
  it('deals the order into flights, the first flight first', () => {
    expect(deal(['c', 'd', 'a', 'e', 'b'], 3)).toEqual({ c: 0, d: 0, a: 0, e: 1, b: 1 });
  });
  it('tee times one after the other, or two on each time from tees 1 and 10', () => {
    expect(teeSlots(3, '08:56', 8, false)).toEqual([
      { time: '08:56', start: 0 },
      { time: '09:04', start: 0 },
      { time: '09:12', start: 0 },
    ]);
    expect(teeSlots(3, '09:00', 10, true)).toEqual([
      { time: '09:00', start: 0 },
      { time: '09:00', start: 9 },
      { time: '09:10', start: 0 },
    ]);
  });
  it('the cut: the best ones and everyone level with the last of them', () => {
    const rows = [{ sum: -3 }, { sum: 0 }, { sum: 2 }, { sum: 2 }, { sum: 5 }];
    expect(madeCut(rows, 3)).toHaveLength(4);
    expect(madeCut(rows, 2)).toHaveLength(2);
    expect(madeCut(rows, 0)).toHaveLength(5);
  });
});
