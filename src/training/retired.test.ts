import { describe, expect, it } from 'vitest';
import { CATEGORIES, DRILLS, anyDrillById, drillById, drillsOf, shotById, shotsForDrills } from './content';
import { RETIRED_DRILLS, RETIRED_SHOTS } from './content/retired';
import { PLANS } from './content/plans';
import { COACH_FAULT_DRILLS } from './coachLinks';
import { search } from './search';

// Chris's review (result 15.11.2026, Sascha 16.11.2026): what he took out shows nowhere – but what a player already
// logged or started still opens.
describe('drills and shots our pro took out', () => {
  it('are not in the library, a topic, a shot or the coach links', () => {
    for (const id of RETIRED_DRILLS) {
      expect(anyDrillById(id), id).toBeTruthy();
      expect(drillById(id), id).toBeUndefined();
      expect(DRILLS.some((d) => d.id === id), id).toBe(false);
      for (const c of CATEGORIES) {
        expect(drillsOf(c.id).some((d) => d.id === id), `${c.id} ${id}`).toBe(false);
        for (const s of c.shots ?? []) expect(s.drills ?? [], `${s.id} ${id}`).not.toContain(id);
      }
      for (const ids of Object.values(COACH_FAULT_DRILLS)) expect(ids).not.toContain(id);
    }
    for (const id of RETIRED_SHOTS) {
      expect(shotById(id), id).toBeUndefined();
      expect(shotsForDrills(['low-spinner', 'towel-behind', 'tee-after-ball'], 9).some((x) => x.shot.id === id)).toBe(false);
    }
  });

  it('a plan does not offer them (the screen keeps only drills of the library)', () => {
    const offered = PLANS.flatMap((p) => [...p.items, ...(p.week ?? []).flatMap((w) => w.items)]).filter((i) => drillById(i.drill)).map((i) => i.drill);
    for (const id of RETIRED_DRILLS) expect(offered, id).not.toContain(id);
  });

  it('the search does not find them', () => {
    const hits = (q: string) => { const r = search(q); return [...r.drills.map((d) => d.id), ...r.shots.map((x) => x.s.id)]; };
    expect(hits('Sweetspot-Tor')).not.toContain('sweetspot-gate');
    expect(hits('Angsthase')).not.toContain('chicken');
    expect(hits('flacher Spinner')).not.toContain('spin-low');
    expect(hits('flacher Spinner')).not.toContain('low-spinner');
    expect(hits('Spin')).toContain('spin-less');
  });

  it('every topic keeps enough to practise', () => {
    for (const c of CATEGORIES) expect(drillsOf(c.id).length + (c.shots?.length ?? 0), c.id).toBeGreaterThan(2);
    expect(CATEGORIES.find((c) => c.id === 'spin')!.shots!.map((s) => s.id)).toEqual(['spin-less', 'spin-factors']);
  });
});
