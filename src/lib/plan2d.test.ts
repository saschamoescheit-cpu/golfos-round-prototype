import { describe, expect, it } from 'vitest';
import { holeOutline, smoothRing, treeSpots } from './plan2d';
import { distToLine, pointInRing } from './geo';
import type { LngLat } from '../types';

// a straight par 4 going north on the Hetzenhof's latitude: 1 m ≈ 1/111320° north, ≈ 1/73400° east
const N = 1 / 111320;
const E = 1 / 73400;
const at = (east: number, north: number): LngLat => [9.69 + east * E, 48.78 + north * N];
const line = [at(0, 0), at(0, 320)];
const rect = (e0: number, n0: number, e1: number, n1: number) => [at(e0, n0), at(e1, n0), at(e1, n1), at(e0, n1), at(e0, n0)];

describe('the drawn hole (2D at BeBrassie quality)', () => {
  it('soft outlines: a square becomes rounded, still closed and inside the old one', () => {
    const sq = rect(0, 0, 40, 40);
    const s = smoothRing(sq);
    expect(s.length).toBeGreaterThan(sq.length * 2);
    expect(s[0]).toEqual(s[s.length - 1]);
    expect(s.every((p) => pointInRing(p, rect(-0.1, -0.1, 40.1, 40.1)))).toBe(true);
    expect(pointInRing(at(0.5, 0.5), s)).toBe(false); // the corner is cut off
  });
  it('the hole outline covers fairway, green and a bunker beside it, with a margin', () => {
    const fairway = rect(-15, 120, 15, 280);
    const green = rect(-12, 300, 12, 325);
    const bunker = rect(14, 290, 26, 300); // right of the green
    const o = holeOutline(line, [fairway, green, bunker])!;
    expect(o).not.toBeNull();
    expect(pointInRing(at(0, 200), o)).toBe(true);
    expect(pointInRing(at(-15, 200), o) && pointInRing(at(15, 200), o)).toBe(true);
    expect(pointInRing(at(26, 295), o)).toBe(true); // the bunker's far edge
    expect(pointInRing(at(0, -5), o)).toBe(true); // behind the tee
    expect(pointInRing(at(0, 333), o)).toBe(true); // behind the green
    expect(pointInRing(at(60, 200), o)).toBe(false); // not the whole map
    expect(pointInRing(at(0, 380), o)).toBe(false);
  });
  it('trees: crowns along the wood\'s edge and inside it, only near the hole, never twice on one spot', () => {
    const wood = rect(30, 50, 120, 250); // right of the fairway, reaching far away
    const t = treeSpots(line, [wood], [], [at(-25, 150)]);
    expect(t.length).toBeGreaterThan(40);
    expect(t.every((x) => distToLine(x.pos, line) <= 60.5)).toBe(true);
    expect(t.some((x) => Math.abs((x.pos[0] - 9.69) / E + 25) < 0.1)).toBe(true); // the single tree
    for (let i = 0; i < t.length; i++)
      for (let j = i + 1; j < t.length; j++) {
        const d = Math.hypot((t[i].pos[0] - t[j].pos[0]) / E, (t[i].pos[1] - t[j].pos[1]) / N);
        expect(d).toBeGreaterThan(2.9);
      }
    expect(treeSpots(line, [wood], [], [])).toEqual(treeSpots(line, [wood], [], [])); // the same trees every time
  });
});
