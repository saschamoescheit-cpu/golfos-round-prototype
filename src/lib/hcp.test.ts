import { describe, expect, it } from 'vitest';
import { ballSpot, clampHcp, easierClub, hcpTier, ownParLine, shortGameClub, shortGameLine, spotLine, spreadFactor, strokesOn } from './hcp';
import type { HoleMapData } from './geo';
import type { LngLat } from '../types';

// Sascha 16.10.2026: "a handicap 54 needs other advice from the caddie than a handicap 3" – and the advice follows
// where the ball lies.

const N = 1 / 111320;
const E = 1 / 73400;
const at = (east: number, north: number): LngLat => [9.69 + east * E, 48.78 + north * N];
const rect = (e0: number, n0: number, e1: number, n1: number) => [at(e0, n0), at(e1, n0), at(e1, n1), at(e0, n1), at(e0, n0)];
const hole: HoleMapData = {
  line: [at(0, 0), at(0, 350)],
  tee: at(0, 0),
  green: rect(-12, 335, 12, 365),
  greenCenter: at(0, 350),
  bunkers: [rect(15, 330, 25, 340)],
  water: [],
  fairways: [rect(-15, 120, 15, 320)],
  tees: [],
};

describe('the caddie for every handicap', () => {
  it('handicap 54 counts up to 54 – it scatters more than 36 (was capped at 36)', () => {
    expect(clampHcp(54)).toBe(54);
    expect(clampHcp(60)).toBe(54);
    expect(spreadFactor(54)).toBeGreaterThan(spreadFactor(36));
    expect(spreadFactor(3)).toBeLessThan(spreadFactor(18));
  });
  it('four tiers: 3 low, 18 mid, 30 high, 54 beginner', () => {
    expect([3, 18, 30, 54].map(hcpTier)).toEqual(['low', 'mid', 'high', 'beginner']);
  });
  it('strokes received: 54 gets three on the hardest holes, 3 gets one on the three hardest', () => {
    expect(strokesOn(54, 1)).toBe(3);
    expect(strokesOn(54, 18)).toBe(3);
    expect(strokesOn(40, 4)).toBe(3);
    expect(strokesOn(40, 5)).toBe(2);
    expect(strokesOn(3, 3)).toBe(1);
    expect(strokesOn(3, 4)).toBe(0);
  });
  it('his own par for the beginner, nothing for the low handicap', () => {
    expect(ownParLine(4, 3, 'beginner')).toMatch(/Your par here: 7 \(par 4 \+ 3 strokes\) – 5 shots to the green/);
    expect(ownParLine(4, 1, 'low')).toBeNull();
  });
  it('a hybrid instead of the 4-iron for the beginner – the 4-iron stays for handicap 3', () => {
    const bag = [
      { club: '4i' as const, carry: 170 },
      { club: 'Hy' as const, carry: 175 },
      { club: '7i' as const, carry: 140 },
    ];
    expect(easierClub('4i', bag, 'beginner')?.club).toBe('Hy');
    expect(easierClub('4i', bag, 'low')).toBeNull();
    expect(easierClub('7i', bag, 'beginner')).toBeNull();
  });
  it('around the green: the beginner putts from the fringe and chips low, the low handicap picks a landing spot', () => {
    expect(shortGameLine(15, true, 'beginner')).toMatch(/putt it/);
    expect(shortGameLine(25, false, 'beginner')).toMatch(/Chip and run/);
    expect(shortGameLine(25, false, 'low')).toMatch(/landing spot/);
    expect(shortGameLine(80, false, 'beginner')).toBeNull();
  });
});

describe('where the ball lies', () => {
  it('fairway, rough left and right, bunker, fringe – from the map', () => {
    expect(ballSpot(at(0, 200), hole)).toMatchObject({ where: 'fairway', lie: null });
    expect(ballSpot(at(-30, 200), hole)).toMatchObject({ where: 'rough', side: 'left', lie: 'lightRough' });
    expect(ballSpot(at(30, 200), hole)).toMatchObject({ where: 'rough', side: 'right' });
    expect(ballSpot(at(20, 335), hole).where).toBe('bunker');
    expect(ballSpot(at(0, 332), hole).where).toBe('fringe');
  });
  it('2 m off the fairway still counts as fairway (GPS)', () => {
    expect(ballSpot(at(16.5, 200), hole).where).toBe('fairway');
  });
  it('said first: "You are in the rough right – 152 m to the pin."', () => {
    expect(spotLine(ballSpot(at(30, 200), hole), '152 m')).toBe('You are in the rough right – 152 m to the pin.');
  });
});

describe('easier clubs and the short game for bogey golfers and beginners', () => {
  const bag = [
    { club: '3W' as const, carry: 190 },
    { club: '5W' as const, carry: 175 },
    { club: 'Hy' as const, carry: 165 },
    { club: '6i' as const, carry: 140 },
  ];
  it('off the fairway the 5-wood instead of the 3-wood – from the tee the 3-wood stays', () => {
    expect(easierClub('3W', bag, 'beginner')?.club).toBe('5W');
    expect(easierClub('3W', bag, 'beginner', { teeShot: true })).toBeNull();
    expect(easierClub('3W', bag, 'mid')).toBeNull();
  });
  it('from the rough a hybrid of the same length instead of the 6-iron – never one that flies 25 m further', () => {
    expect(easierClub('6i', [...bag, { club: '5H' as const, carry: 145 }], 'high', { rough: true })?.club).toBe('5H');
    expect(easierClub('6i', bag, 'high', { rough: true })).toBeNull(); // the hybrid carries 165 – too long
    expect(easierClub('6i', [...bag, { club: '5H' as const, carry: 145 }], 'high')).toBeNull(); // off the fairway the 6-iron is fine
  });
  it('putter from the fringe, chip and run from the fairway – the low handicap keeps the wedge advice', () => {
    expect(shortGameClub(15, 'fringe', 'beginner')?.club).toBe('Putter');
    expect(shortGameClub(25, 'fairway', 'high')?.club).toBe('8i');
    expect(shortGameClub(25, 'fairway', 'low')).toBeNull();
    expect(shortGameClub(25, 'bunker', 'beginner')).toBeNull();
    expect(shortGameClub(60, 'fairway', 'beginner')).toBeNull();
  });
});
