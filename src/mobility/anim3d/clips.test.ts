import { describe, expect, it } from 'vitest';
import { CLIPS } from './clips';
import { sample } from './scene';
import { FULL } from '../tests';
import { DRILL_CLIPS } from './drills';
import { drillById } from '../../training/content';

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

describe('3D drill videos', () => {
  it('every video belongs to a drill of Agility', () => {
    for (const id of Object.keys(DRILL_CLIPS)) expect(drillById(id), id).toBeTruthy();
  });

  it('keys in time order, every step in both languages, the loop closes, the pose (and place) at the end is the start', () => {
    for (const [id, c] of Object.entries(DRILL_CLIPS)) {
      const ts = c.keys.map((k) => k.t);
      expect(ts, id).toEqual([...ts].sort((a, b) => a - b));
      expect(c.keys[0].label, id).toBeTruthy();
      for (const k of c.keys) if (k.label) expect(k.label.en && k.label.de, id).toBeTruthy();
      const first = c.keys[0].pose;
      const last = c.keys[c.keys.length - 1].pose;
      expect(last.j, id).toEqual(first.j);
      expect([last.at, last.tip, last.roll], id).toEqual([first.at, first.tip, first.roll]);
    }
  });
});
