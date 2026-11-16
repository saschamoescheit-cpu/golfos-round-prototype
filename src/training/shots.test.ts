import { describe, expect, it } from 'vitest';
import { CATEGORIES, drillById, drillsOf, shotById, videoById } from './content';
import { SHOTS } from './content/shots';
import { reviewItems, shotKey } from './review';
import type { L, ShotPart } from './types';

// The topics as shots (Sascha 15.11.2026): every shot has Set-up (ball position, stance, weight, club), Motion, What
// to watch and Practise – every tab with a picture (Sascha 16.10.: a picture with every text), both languages, drills
// and videos that exist, and its place in "Review the content" for our pro.

const filled = (x?: L) => !!x && x.en.trim().length > 3 && x.de.trim().length > 3;
const hasPicture = (p: ShotPart) => !!p.graphic || (!!p.sketch && (p.sketch.view === 'grip' || p.sketch.view === 'face' || ((p.sketch as { items?: unknown[] }).items?.length ?? 0) > 0));

describe('shots', () => {
  const all = CATEGORIES.flatMap((c) => (c.shots ?? []).map((s) => ({ c, s })));

  it('the chipping topic is built as shots, with the lie chart', () => {
    const chip = CATEGORIES.find((c) => c.id === 'chipping')!;
    expect(chip.shots?.map((s) => s.id)).toEqual(['chip-standard', 'chip-uphill', 'chip-downhill', 'chip-above-feet', 'chip-below-feet', 'chip-bare', 'chip-deep-grass']);
    expect(chip.lieChart?.rows.map((r) => r.lie)).toEqual(['short', 'up', 'down', 'collar', 'bare']);
    // the sections that moved into the shots left the basics, their pictures stayed with the shots
    expect(chip.sections.map((s) => s.title.en)).toEqual(['Practise like this']);
    expect(chip.absorbed?.map((s) => s.title.en)).toEqual(SHOTS.chipping!.absorbs);
  });

  it('every shot is complete: name, line, rows, every tab with text and a picture', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const { c, s } of all) {
      const id = `${c.id} › ${s.id}`;
      expect(filled(s.name) && filled(s.short), id).toBe(true);
      expect(s.setup.rows.length, id).toBeGreaterThanOrEqual(3);
      for (const r of s.setup.rows) expect(filled(r.v), `${id} › ${r.k}`).toBe(true);
      for (const [tab, p] of [['setup', s.setup], ['move', s.move], ['watch', s.watch]] as const) {
        expect(hasPicture(p), `${id} › ${tab} picture`).toBe(true);
        if (tab !== 'setup') expect((p.text?.length ?? 0) + (p.points?.length ?? 0), `${id} › ${tab} text`).toBeGreaterThan(0);
        for (const x of [...(p.text ?? []), ...(p.points ?? [])]) expect(filled(x), `${id} › ${tab}`).toBe(true);
      }
    }
  });

  it('drills and videos of a shot exist, the ids are unique', () => {
    const ids = all.map(({ s }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { s } of all) {
      expect(s.drills?.length ?? 0, s.id).toBeGreaterThan(0);
      for (const d of s.drills ?? []) expect(drillById(d), `${s.id} → ${d}`).toBeTruthy();
      for (const v of s.videos ?? []) expect(videoById(v), `${s.id} → video ${v}`).toBeTruthy();
      expect(shotById(s.id)?.shot.id).toBe(s.id);
    }
  });

  it('a section a tab names exists in the topic', () => {
    for (const [cat, t] of Object.entries(SHOTS)) {
      const c = CATEGORIES.find((x) => x.id === cat)!;
      for (const s of t!.shots)
        for (const p of [s.setup, s.move, s.watch]) {
          if (!p.section) continue;
          // "Title" of this topic or "topic/Title" of another
          const [cat2, title] = p.section.includes('/') ? p.section.split('/') : [cat, p.section];
          const c2 = CATEGORIES.find((x) => x.id === cat2)!;
          expect([...c2.sections, ...(c2.absorbed ?? [])].some((x) => x.title.en === title), `${s.id} › ${p.section}`).toBe(true);
        }
      for (const a of t!.absorbs ?? []) expect(c.absorbed?.some((x) => x.title.en === a), `${cat} absorbs ${a}`).toBe(true);
    }
  });

  it('the lie chart: ball positions between the feet, every row filled', () => {
    for (const c of CATEGORIES.filter((x) => x.lieChart)) {
      for (const r of c.lieChart!.rows) {
        expect(r.ball, `${c.id} › ${r.lie}`).toBeGreaterThanOrEqual(-1);
        expect(r.ball, `${c.id} › ${r.lie}`).toBeLessThanOrEqual(1);
        expect(filled(r.name) && filled(r.club) && filled(r.note), `${c.id} › ${r.lie}`).toBe(true);
      }
    }
  });

  it('all the topics Sascha named are built as shots (15.11.2026)', () => {
    const ids = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.shots?.map((s) => s.id) ?? [];
    expect(ids('pitching')).toEqual(['pitch-standard', 'pitch-clock', 'pitch-slope', 'pitch-rough']);
    expect(ids('bunker')).toEqual(['bunker-standard', 'bunker-fairway', 'bunker-plugged', 'bunker-slope', 'bunker-bounce', 'bunker-sand']);
    expect(ids('slopes')).toEqual(['slope-uphill', 'slope-downhill', 'slope-above', 'slope-below']);
    expect(ids('trouble')).toEqual(['trouble-punch', 'trouble-rough', 'trouble-divot', 'trouble-bare-wet', 'trouble-wind']);
    expect(ids('lob')).toEqual(['lob-shot', 'flop-shot']);
    expect(ids('spin')).toEqual(['spin-less', 'spin-factors']); // spin-low: out (Chris 15.11.2026)
    expect(ids('highlow')).toEqual(['shot-high', 'shot-low']);
    expect(ids('lowpoint')).toEqual(['lowpoint-iron', 'lowpoint-chip', 'lowpoint-bunker', 'lowpoint-driver']);
    // night run 15./16.11.2026: putting, irons, woods and driver as shots too
    expect(ids('putting')).toEqual(['putt-short', 'putt-long', 'putt-uphill', 'putt-downhill', 'putt-break', 'putt-fringe']);
    expect(ids('irons')).toEqual(['iron-standard', 'iron-approach', 'iron-long']);
    expect(ids('woods')).toEqual(['wood-fairway', 'wood-tee', 'hybrid']);
    expect(ids('driver')).toEqual(['driver-standard', 'driver-safe', 'driver-wind']);
    // putting keeps rhythm (with the metronome), the two skills and how to practise in its basics
    expect(CATEGORIES.find((c) => c.id === 'putting')!.sections.some((s) => s.metronome === 'putt')).toBe(true);
    // the new topics come right after their neighbours and show the drills their shots use
    const order = CATEGORIES.map((c) => c.id);
    expect(order.slice(2, 11)).toEqual(['chipping', 'pitching', 'lob', 'spin', 'bunker', 'slopes', 'trouble', 'highlow', 'lowpoint']);
    for (const cat of ['lob', 'spin', 'highlow', 'lowpoint'] as const) expect(drillsOf(cat).length, cat).toBeGreaterThanOrEqual(3);
    // the bunker basics keep the rule of the sand (Rule 12.2) through the numbers; slopes and trouble keep one section
    expect(CATEGORIES.find((c) => c.id === 'trouble')!.sections.map((s) => s.title.en)).toEqual(['Decide first: the escape rule']);
    expect(CATEGORIES.find((c) => c.id === 'slopes')!.sections.map((s) => s.title.en)).toEqual(['Combined slopes and the short game']);
  });

  it('every shot can be reviewed by our pro', () => {
    const keys = new Set(reviewItems().map((i) => i.key));
    for (const { c, s } of all) expect(keys.has(shotKey(c.id, s.id)), s.id).toBe(true);
  });
});
