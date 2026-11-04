import { describe, expect, it } from 'vitest';
import { isLastHole, lastHole, nextHole, playPos, prevHole } from './holeorder';

const holes = (n: number) => Array.from({ length: n }, (_, k) => ({ label: String(k + 1), par: 4 })) as never;

describe('holeorder: a round off tee 10 (04.11.2026)', () => {
  it('from tee 1: 1 … 18 as ever', () => {
    const r = { holes: holes(18) };
    expect(playPos(r, 0)).toBe(0);
    expect(nextHole(r, 16)).toBe(17);
    expect(nextHole(r, 17)).toBeNull();
    expect(prevHole(r, 0)).toBeNull();
    expect(lastHole(r)).toBe(17);
    expect(isLastHole(r, 17)).toBe(true);
  });
  it('from tee 10: 10 … 18, then 1 … 9 – the 9th is the last', () => {
    const r = { holes: holes(18), startHole: 9 };
    const order: number[] = [];
    for (let k: number | null = 9; k != null; k = nextHole(r, k)) order.push(k + 1);
    expect(order).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(prevHole(r, 9)).toBeNull();
    expect(prevHole(r, 0)).toBe(17);
    expect(lastHole(r)).toBe(8);
    expect(isLastHole(r, 17)).toBe(false);
    expect(playPos(r, 0)).toBe(9);
  });
  it('a start outside the round is ignored', () => {
    const r = { holes: holes(9), startHole: 9 };
    expect(lastHole(r)).toBe(8);
    expect(nextHole(r, 8)).toBeNull();
  });
});
