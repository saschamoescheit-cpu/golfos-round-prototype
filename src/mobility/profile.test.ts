import { describe, expect, it } from 'vitest';
import { pillar, position, targetPos, targetValue, testPos, type MobilityGoal } from './profile';
import { TESTS, testById } from './tests';
import type { Measurement, TestId, TestResult } from './types';

const cam = (value: number): Measurement => ({ value, grade: 'pass', source: 'camera', at: '2026-10-18T06:00:00Z' });
const goal = (hcp: number, focus: MobilityGoal['focus'] = []): MobilityGoal => ({ id: 'goal', hcp, focus, at: '2026-10-18T06:00:00Z' });

describe('mobility profile – measuring, not grading', () => {
  it('puts values on a neutral scale (more movement = further right, also where smaller numbers mean more)', () => {
    expect(position('trunkRotation', 35)).toBeCloseTo(0.5);
    expect(position('toeTouch', 0)).toBe(1);
    expect(position('toeTouch', 30)).toBe(0);
    expect(position('shoulder9090', 30)).toBeCloseTo(0.5);
  });

  it('the side with less movement counts; pain gives no value', () => {
    const t = testById('seated-rotation');
    expect(testPos(t, { left: cam(56), right: cam(35) })).toBeCloseTo(0.5);
    expect(testPos(t, { both: { ...cam(50), pain: true } })).toBeNull();
  });

  it('a lower handicap goal asks for more movement', () => {
    const t = testById('seated-rotation');
    expect(targetPos(t, goal(0))).toBeGreaterThan(targetPos(t, goal(28)));
    expect(targetValue(t, goal(0))).toBe(45);
  });

  it('the pillar puts the area with the biggest gap first and marks the focus areas', () => {
    const r: Partial<Record<TestId, TestResult>> = {
      'seated-rotation': { left: cam(20), right: cam(22) }, // stiff upper back
      'pelvic-rotation': { both: cam(32) }, // hips fine
      'single-leg': { left: cam(25), right: cam(28) }, // balance fine
    };
    const p = pillar(TESTS, r, goal(10));
    expect(p[0].area).toBe('spine');
    expect(p[0].focus).toBe(true);
    expect(p.find((a) => a.area === 'stability')?.focus).toBe(false);
  });

  it('what the player wants moves the order: "more length" lifts the turning areas', () => {
    const r: Partial<Record<TestId, TestResult>> = {
      'seated-rotation': { left: cam(36), right: cam(36) },
      'single-leg': { left: cam(10), right: cam(10) },
    };
    const plain = pillar(TESTS, r, goal(10, ['consistency']));
    const length = pillar(TESTS, r, goal(10, ['length']));
    const gap = (p: ReturnType<typeof pillar>, a: string) => p.find((x) => x.area === a)!.gap;
    expect(gap(length, 'spine')).toBeGreaterThan(gap(plain, 'spine'));
    expect(gap(plain, 'stability')).toBeGreaterThan(gap(length, 'stability'));
  });
});
