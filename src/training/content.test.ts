import { describe, expect, it } from 'vitest';
import { CATEGORIES, DRILLS, METRONOME_DRILLS, NO_RESULT_DRILLS, SWING_TEMPO_DRILLS, drillById } from './content';
import { DRILL_GEAR, GEAR, gearById, gearForDrill } from './content/gear';
import { PLANS } from './content/plans';
import { adviceFromRounds } from './recommend';
import { COACH_FAULT_DRILLS } from './coachLinks';
import { CHARTS } from './content/charts';
import { DRILL_VIDEOS } from './content/drill-videos';
import { FIGURE_SKETCHES, SECTION_FIGURE_SKETCHES } from './content/sketches-figures';
import { golferJoints } from './Golfer';
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
      if (s.view === 'grip') return expect(s.notes.every((n) => n.en && n.de), where).toBe(true);
      expect(s.w > 0 && s.h > 0 && s.items.length > 0, where).toBe(true);
    };
    for (const d of DRILLS) check(d.sketch, d.id);
    for (const c of CATEGORIES) c.sections.forEach((s, i) => check(s.sketch, `${c.id} section ${i}`));
  });
  it('gear per drill resolves (Sascha 16.10.2026: products belong to the drill, not the topic)', () => {
    for (const [drill, ids] of Object.entries(DRILL_GEAR)) {
      expect(drillById(drill), drill).toBeTruthy();
      for (const id of ids) expect(gearById(id), `${drill} → ${id}`).toBeTruthy();
    }
    expect(DRILLS.filter((d) => gearForDrill(d).length > 0).length).toBeGreaterThan(50);
  });

  it('every section of the basics has a picture, its drill and videos resolve (Sascha 16.10.2026)', () => {
    for (const c of CATEGORIES)
      c.sections.forEach((s, i) => {
        const where = `${c.id} ${i} ${s.title.de}`;
        if (s.drill) expect(drillById(s.drill), where).toBeTruthy();
        expect(s.sketch ?? (s.drill ? drillById(s.drill)?.sketch : undefined), where).toBeTruthy();
        for (const id of s.videos ?? []) expect(c.videos?.some((v) => v.id === id), `${where} → ${id}`).toBe(true);
      });
    const withVideo = CATEGORIES.flatMap((c) => c.sections).filter((s) => s.videos?.length).length;
    expect(withVideo).toBeGreaterThan(50);
  });

  it('the metronome is on the distance-control drills and in the putting basics (Sascha 16.10.2026)', () => {
    for (const id of METRONOME_DRILLS) expect(drillById(id)?.metronome, id).toBe('putt');
    for (const id of SWING_TEMPO_DRILLS) expect(drillById(id)?.metronome, id).toBe('swing');
    expect(CATEGORIES.find((c) => c.id === 'swing')!.sections.some((s) => s.metronome === 'swing')).toBe(true);
    const putting = CATEGORIES.find((c) => c.id === 'putting')!;
    const rhythm = putting.sections.find((s) => s.metronome);
    expect(rhythm?.title.de).toBe('Rhythmus: der Schlüssel zur Länge');
  });

  it('charts: real topics, both languages, positive values (Sascha 16.10.2026)', () => {
    for (const [cat, charts] of Object.entries(CHARTS)) {
      expect(CATEGORIES.find((c) => c.id === cat)?.charts?.length, cat).toBe(charts!.length);
      for (const ch of charts!) {
        expect(filled(ch.title), cat).toBe(true);
        const values = ch.kind === 'bars' ? ch.bars.map((b) => b.value) : ch.rows.flatMap((r) => r.parts);
        expect(values.every((v) => v >= 0) && values.some((v) => v > 0), cat).toBe(true);
        if (ch.kind === 'split') for (const r of ch.rows) expect(r.parts.length, cat).toBeLessThanOrEqual(ch.legend.length + 1);
      }
    }
  });

  it('drill videos come from the checked topic videos; most drills have one', () => {
    const topic = new Set(CATEGORIES.flatMap((c) => c.videos ?? []).map((v) => v.id));
    for (const [d, ids] of Object.entries(DRILL_VIDEOS)) {
      expect(drillById(d), d).toBeTruthy();
      for (const id of ids) expect(topic.has(id), `${d} → ${id}`).toBe(true);
    }
    expect(DRILLS.filter((d) => d.videos?.length).length).toBeGreaterThan(120);
  });

  it('planning, on-course and judgement drills have no result part (Sascha 16.10.2026)', () => {
    for (const id of NO_RESULT_DRILLS) {
      expect(drillById(id), id).toBeTruthy();
      expect(drillById(id)!.scoring?.kind, id).toBe('none');
      expect(drillById(id)!.targets, id).toBeUndefined();
    }
  });

  it('every Coach fault points to existing drills', () => {
    expect(Object.keys(COACH_FAULT_DRILLS).length).toBe(32);
    for (const [fault, ids] of Object.entries(COACH_FAULT_DRILLS)) for (const id of ids) expect(drillById(id), `${fault} → ${id}`).toBeTruthy();
  });

  it('every golfer sketch belongs to a drill or section, and every numbered detail sits on a joint of a figure', () => {
    const all: [string, Sketch][] = Object.entries(FIGURE_SKETCHES);
    for (const id of Object.keys(FIGURE_SKETCHES)) expect(drillById(id), id).toBeTruthy();
    for (const [cat, m] of Object.entries(SECTION_FIGURE_SKETCHES)) {
      const c = CATEGORIES.find((x) => x.id === cat);
      for (const [title, sk] of Object.entries(m!)) {
        expect(c?.sections.some((x) => x.title.en === title), `${cat} › ${title}`).toBe(true);
        all.push([`${cat} › ${title}`, sk]);
      }
    }
    for (const [where, sk] of all) {
      // a reused drill picture without numbered marks (e.g. a ball flight) needs no figure
      if (sk.view !== 'side' || !sk.items.some((x) => x.k === 'callout')) continue;
      const figs = sk.items.filter((x) => x.k === 'figure');
      expect(figs.length, where).toBeGreaterThan(0);
      for (const it of sk.items) {
        if (it.k !== 'callout') continue;
        const fg = figs[it.fig ?? 0];
        expect(fg, `${where}: figure ${it.fig ?? 0}`).toBeTruthy();
        if (fg?.k !== 'figure') continue;
        expect(golferJoints({ ...fg, pose: fg.pose ?? 'address' })[it.on], `${where}: ${it.on}`).toBeTruthy();
        if (typeof it.t !== 'string') expect(it.t.de && it.t.en, where).toBeTruthy();
      }
    }
  });
});
