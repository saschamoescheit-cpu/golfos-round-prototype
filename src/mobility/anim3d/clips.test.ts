import { describe, expect, it } from 'vitest';
import { CLIPS } from './clips';
import { sample } from './scene';
import { FULL } from '../tests';

describe('3D test videos', () => {
  it('every test has its video', () => {
    for (const id of FULL) expect(CLIPS[id], id).toBeTruthy();
  });

  it('keys in time order, the first one says what to do, every step in both languages', () => {
    for (const [id, c] of Object.entries(CLIPS)) {
      const ts = c.keys.map((k) => k.t);
      expect(ts, id).toEqual([...ts].sort((a, b) => a - b));
      expect(c.keys[0].label, id).toBeTruthy();
      expect(c.keys.filter((k) => k.label).length, id).toBeGreaterThanOrEqual(2);
      for (const k of c.keys) if (k.label) expect(k.label.en && k.label.de, id).toBeTruthy();
    }
  });

  it('the loop starts and ends in the same pose (no jump)', () => {
    for (const [id, c] of Object.entries(CLIPS)) expect(c.keys[c.keys.length - 1].pose.j, id).toEqual(c.keys[0].pose.j);
  });

  it('a moment between two keys mixes them and names the step', () => {
    const c = CLIPS['deep-squat'];
    const s = sample(c, 2.2);
    const hip = s.pose.j.hipL![0];
    expect(hip).toBeLessThan(0);
    expect(hip).toBeGreaterThan(-130);
    expect(s.step).toBe(1);
    expect(sample(c, 3.5).step).toBe(2);
  });
});
