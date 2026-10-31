import { describe, expect, it } from 'vitest';
import { hasPain, latestResults, likelyMisses, measurementFor, PLAY_NOW, PATTERNS, swingPatterns } from './swing';
import { FULL, QUICK, TESTS } from './tests';
import { drillById } from '../training/content';
import type { Grade, Measurement, Screening, TestId, TestResult } from './types';

const m = (grade: Grade, at = '2026-10-17T10:00:00Z', value: number | null = null): Measurement => ({ value, grade, source: 'camera', at });
const all = (grade: Grade, ids: TestId[] = FULL): Partial<Record<TestId, TestResult>> => Object.fromEntries(ids.map((id) => [id, { both: m(grade) }]));

describe('body–swing connection', () => {
  it('a body that passes everything points to no swing pattern', () => {
    expect(swingPatterns(all('pass'), 'right')).toEqual([]);
  });

  it('a failed deep squat and bridge make standing up (early extension) likely, with its misses', () => {
    const r = { ...all('pass'), 'deep-squat': { both: m('fail') }, bridge: { left: m('fail'), right: m('pass') } };
    const ps = swingPatterns(r, 'right');
    const ee = ps.find((p) => p.pattern.id === 'early-extension');
    expect(ee?.level).toBe('likely');
    expect(ee?.causes.map((c) => c.test)).toEqual(expect.arrayContaining(['deep-squat', 'bridge']));
    expect(ps[0].pattern.id).toBe('early-extension');
    const misses = likelyMisses(ps).map((x) => x.miss);
    expect(misses).toEqual(expect.arrayContaining(['push', 'hook', 'thin', 'shank']));
  });

  it('a test that hurt points to no pattern and offers no drills (a physio first)', () => {
    const r = { ...all('pass'), 'deep-squat': { both: { ...m('fail'), pain: true } }, bridge: { left: { ...m('fail'), pain: true }, right: m('pass') } };
    expect(swingPatterns(r, 'right').find((p) => p.pattern.id === 'early-extension')).toBeUndefined();
    expect(hasPain(r['deep-squat'])).toBe(true);
    expect(hasPain(r.bridge)).toBe(true);
    expect(hasPain(r['toe-touch'])).toBe(false);
  });

  it('one contributing test alone is at most "possible"', () => {
    const r = { ...all('pass'), 'pelvic-tilt': { both: m('fail') } };
    const ee = swingPatterns(r, 'right').find((p) => p.pattern.id === 'early-extension');
    expect(ee?.level).toBe('possible');
  });

  it('a pattern is not shown when too few of its tests were done', () => {
    // only the pelvic rotation done: casting has four tests, pelvic rotation is a minor one
    const ps = swingPatterns({ 'pelvic-rotation': { both: m('fail') } }, 'right');
    expect(ps.find((p) => p.pattern.id === 'casting')).toBeUndefined();
  });

  it('sided tests count on the right side: the trail hip for the sway, the lead hip for the slide', () => {
    // right-hander: trail = right; the right leg fails the lower quarter rotation
    const r = { ...all('pass'), 'lower-quarter': { left: m('pass'), right: m('fail') }, 'single-leg': { left: m('pass'), right: m('fail') } };
    const ps = swingPatterns(r, 'right');
    expect(ps.find((p) => p.pattern.id === 'sway')?.level).toBe('likely');
    expect(ps.find((p) => p.pattern.id === 'slide')).toBeUndefined();
    // the same body playing left-handed: the right side is the lead side now
    const lh = swingPatterns(r, 'left');
    expect(lh.find((p) => p.pattern.id === 'slide')?.level).toBe('likely');
    expect(lh.find((p) => p.pattern.id === 'sway')).toBeUndefined();
  });

  it('a test without sides counts for both links', () => {
    expect(measurementFor({ both: m('fail') }, 'lead', 'right')?.grade).toBe('fail');
    expect(measurementFor({ left: m('pass'), right: m('limited') }, undefined, 'right')?.grade).toBe('limited');
  });

  it('the newest result of each test wins over all screenings', () => {
    const base: Omit<Screening, 'id' | 'createdAt' | 'results'> = { kind: 'full', tests: FULL, finishedAt: '2026-10-17T12:00:00Z', current: 0, hand: 'right' };
    const older: Screening = { ...base, id: 'a', createdAt: '2026-09-01T10:00:00Z', results: { lat: { both: m('fail', '2026-09-01T10:00:00Z') }, neck: { left: m('fail', '2026-09-01T10:00:00Z') } } };
    const newer: Screening = { ...base, id: 'b', kind: 'single', tests: ['lat'], createdAt: '2026-10-01T10:00:00Z', results: { lat: { both: m('pass', '2026-10-01T10:00:00Z') } } };
    const { results } = latestResults([newer, older]);
    expect(results.lat?.both?.grade).toBe('pass');
    expect(results.neck?.left?.grade).toBe('fail');
  });
});

describe('the tests', () => {
  it('15 tests, 10 measured by the camera, 6 in the quick check', () => {
    expect(TESTS).toHaveLength(15);
    expect(FULL).toHaveLength(15);
    expect(new Set(FULL).size).toBe(15);
    expect(TESTS.filter((t) => t.mode === 'camera')).toHaveLength(10);
    expect(QUICK).toHaveLength(6);
    expect(QUICK.every((id) => TESTS.find((t) => t.id === id)!.mode === 'camera')).toBe(true);
  });

  it('every test has a picture, a video, steps in both languages and drills that exist in Training', () => {
    for (const t of TESTS) {
      expect(t.video.id, t.id).toMatch(/^[\w-]{11}$/);
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(1);
      for (const s of [t.name, t.why, t.setup, t.target, ...t.steps]) expect(s.en && s.de, t.id).toBeTruthy();
      if (t.mode === 'camera') {
        expect(t.metric, t.id).toBeTruthy();
        expect(t.sketch.view === 'side' && t.sketch.items.length > 0, `${t.id} picture`).toBe(true);
      } else {
        // three pictures, or four when the TPI form has a second limited answer (the pelvic tilt that shakes, 31.10.2026)
        expect(t.options!.length, t.id).toBeGreaterThanOrEqual(3);
        expect(t.options!.length, t.id).toBeLessThanOrEqual(4);
        expect(new Set(t.options!.map((o) => o.grade)), t.id).toEqual(new Set(['pass', 'limited', 'fail']));
      }
      expect(t.drills.length, t.id).toBeGreaterThanOrEqual(1);
      for (const d of t.drills) expect(drillById(d), `${t.id} → ${d}`).toBeTruthy();
    }
  });

  it('every corrective drill has its own picture and at least one video', () => {
    const ids = [...new Set(TESTS.flatMap((t) => t.drills))];
    for (const id of ids) {
      const d = drillById(id)!;
      expect(d.sketch, id).toBeTruthy();
      expect(d.videos?.length ?? 0, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('every pattern says how to play with it today, in both languages', () => {
    for (const p of PATTERNS) {
      expect(PLAY_NOW[p.id].length, p.id).toBeGreaterThan(0);
      for (const x of PLAY_NOW[p.id]) expect(x.en && x.de, p.id).toBeTruthy();
    }
  });
});
