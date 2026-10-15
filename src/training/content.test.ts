import { describe, expect, it } from 'vitest';
import { CATEGORIES, DRILLS, drillById } from './content';
import { GEAR, gearById } from './content/gear';
import { PLANS } from './content/plans';
import { adviceFromRounds } from './recommend';
import type { L, Sketch } from './types';

// The Training library is data – these checks keep it consistent when it grows (every reference resolves, both
// languages are filled, results and targets fit the scoring).

const filled = (x: L | undefined) => !!x && x.en.trim().length > 0 && x.de.trim().length > 0;

describe('training content', () => {
  it('has unique drill, category and gear ids', () => {
    const ids = DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(GEAR.length);
  });

  it('every drill is complete in both languages', () => {
    for (const d of DRILLS) {
      expect(filled(d.name), d.id).toBe(true);
      expect(filled(d.goal), d.id).toBe(true);
      expect(filled(d.setup), d.id).toBe(true);
      expect(d.steps.length, d.id).toBeGreaterThan(0);
      for (const s of d.steps) expect(filled(s), d.id).toBe(true);
      expect(d.minutes, d.id).toBeGreaterThan(0);
      expect(CATEGORIES.some((c) => c.id === d.cat), d.id).toBe(true);
      for (const a of d.also ?? []) expect(CATEGORIES.some((c) => c.id === a), `${d.id} also ${a}`).toBe(true);
    }
  });

  it('targets fit the scoring', () => {
    for (const d of DRILLS) {
      if (!d.targets) continue;
      expect(d.scoring && d.scoring.kind !== 'none', `${d.id} has targets but no scoring`).toBe(true);
      const t = d.targets;
      const s = d.scoring!;
      if (s.kind === 'made') for (const v of [t.high, t.mid, t.low, t.tour ?? 0]) expect(v, d.id).toBeLessThanOrEqual(s.of);
      // better players have better targets
      const lower = s.kind === 'strokes' || (s.kind === 'meters' && s.lower);
      if (lower) expect(t.low <= t.mid && t.mid <= t.high, d.id).toBe(true);
      else expect(t.low >= t.mid && t.mid >= t.high, d.id).toBe(true);
    }
  });

  it('every reference resolves (faults, gear, plans, advice)', () => {
    for (const c of CATEGORIES) {
      for (const f of c.faults ?? []) for (const id of f.drills ?? []) expect(drillById(id), `${c.id} fault → ${id}`).toBeTruthy();
      for (const s of c.see ?? []) expect(CATEGORIES.some((x) => x.id === s), `${c.id} see ${s}`).toBe(true);
    }
    for (const d of DRILLS) for (const n of d.needs ?? []) if (typeof n === 'string') expect(gearById(n), `${d.id} needs ${n}`).toBeTruthy();
    for (const p of PLANS) {
      for (const i of p.items) expect(drillById(i.drill), `${p.id} → ${i.drill}`).toBeTruthy();
      for (const w of p.week ?? []) for (const i of w.items) expect(drillById(i.drill), `${p.id} → ${i.drill}`).toBeTruthy();
    }
  });

  it('the advice from rounds only names existing drills', async () => {
    // the drill lists inside recommend.ts are literal – read them from the source
    const src = (await import('./recommend?raw')).default as string;
    const ids = [...src.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).filter((id) => id.includes('-') && !['hcp-'].includes(id));
    const drillLike = ids.filter((id) => !/^(golfos|de-|en-)/.test(id));
    for (const id of drillLike) if (!drillById(id) && !CATEGORIES.some((c) => c.id === id)) throw new Error(`recommend.ts names unknown drill ${id}`);
    expect(adviceFromRounds([])).toEqual([]);
  });

  it('every category is complete', () => {
    for (const c of CATEGORIES) {
      expect(filled(c.name) && filled(c.short) && filled(c.intro), c.id).toBe(true);
      expect(c.sections.length, c.id).toBeGreaterThan(1);
      expect(DRILLS.filter((d) => d.cat === c.id).length, c.id).toBeGreaterThanOrEqual(5);
      for (const v of c.videos ?? []) expect(v.id, c.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it('gear has a price and texts', () => {
    for (const g of GEAR) {
      expect(g.price[0] > 0 && g.price[1] >= g.price[0], g.id).toBe(true);
      expect(filled(g.what) && filled(g.why), g.id).toBe(true);
    }
  });

  it('every drill has its own sketch (Sascha 15.10.2026)', () => {
    const missing = DRILLS.filter((d) => !d.sketch).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('sketches are drawable', () => {
    const check = (s: Sketch | undefined, where: string) => {
      if (!s) return;
      if (s.view === 'face') return expect(s.marks.length, where).toBeGreaterThan(0);
      expect(s.w > 0 && s.h > 0 && s.items.length > 0, where).toBe(true);
    };
    for (const d of DRILLS) check(d.sketch, d.id);
    for (const c of CATEGORIES) c.sections.forEach((s, i) => check(s.sketch, `${c.id} section ${i}`));
  });
});
