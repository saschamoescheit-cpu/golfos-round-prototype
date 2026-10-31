import { describe, expect, it } from 'vitest';
import { AREA_MOVES, buildWarmup, WARM_MOVES, WARMUP_MAX, WARMUP_MIN, type WarmMoveId } from './rangewarmup';
import { WARMUP_CLIPS } from './anim3d/warmup';
import type { AreaState } from './profile';
import type { Area } from './types';

const area = (a: Area, gap: number, focus = gap > 0.04): AreaState => ({ area: a, tests: [], now: 0.5, target: 0.5 + gap, gap, focus });

describe('the range warm-up', () => {
  it('5 to 7 min, whatever the results', () => {
    const cases: AreaState[][] = [
      [],
      [area('hips', 0.3), area('spine', 0.2), area('shoulders', 0.15), area('stability', 0.1), area('legs', 0.1), area('neck', 0.05), area('wrists', 0.05)],
      [area('wrists', 0.2)],
      [area('hips', 0), area('spine', 0)],
    ];
    for (const c of cases) {
      const w = buildWarmup(c);
      expect(w.seconds).toBeGreaterThanOrEqual(WARMUP_MIN);
      expect(w.seconds).toBeLessThanOrEqual(WARMUP_MAX);
      expect(new Set(w.moves.map((m) => m.id)).size).toBe(w.moves.length);
    }
  });
  it('the turn first, the swings last, half before full', () => {
    const w = buildWarmup([area('hips', 0.3)]);
    expect(w.moves[0].id).toBe('rw-turn');
    expect(w.moves.slice(-2).map((m) => m.id)).toEqual(['rw-swing-half', 'rw-swing-full']);
  });
  it('the areas with the biggest gap get their move, in order of the gap', () => {
    const w = buildWarmup([area('wrists', 0.1), area('stability', 0.3), area('hips', 0.2)]);
    const ids = w.moves.map((m) => m.id);
    expect(ids.indexOf('rw-balance')).toBeLessThan(ids.indexOf('rw-hips'));
    expect(ids.indexOf('rw-hips')).toBeLessThan(ids.indexOf('rw-wrists'));
    expect(w.areas).toEqual(['stability', 'hips', 'wrists']);
  });
  it('an area without a gap is not the reason for a move', () => {
    const w = buildWarmup([area('neck', 0), area('hips', 0.2)]);
    expect(w.areas).toEqual(['hips']);
    expect(w.moves.map((m) => m.id)).not.toContain('rw-neck');
  });
  it('every move has its picture (a 3D clip or a swing) and both languages', () => {
    for (const m of Object.values(WARM_MOVES)) {
      expect(!!m.swing || !!WARMUP_CLIPS[m.id], m.id).toBe(true);
      for (const s of [m.name, ...m.steps]) expect(s.en && s.de, m.id).toBeTruthy();
    }
    for (const list of Object.values(AREA_MOVES)) for (const id of list) expect(WARM_MOVES[id as WarmMoveId], id).toBeTruthy();
  });
  it('the clips loop and start with a step', () => {
    for (const [id, c] of Object.entries(WARMUP_CLIPS)) {
      expect(c.keys[0].label, id).toBeTruthy();
      expect(c.keys[c.keys.length - 1].pose.j, id).toEqual(c.keys[0].pose.j);
    }
  });
});
