import { describe, expect, it } from 'vitest';
import { CATEGORIES, DRILLS } from './content';
import { phasesOf } from './Sketch';
import type { Sketch } from './types';

// The movements as phase pictures (Sascha 17.11.2026: the 3D animations are gone – "alles mit Bildern darstellen",
// as phase pictures side by side): every drawn movement of Training shows 2–4 pictures, the first the set-up, the last
// the held end – never the swing back to the set-up after the finish.
const sketches: { where: string; s: Sketch }[] = [
  ...DRILLS.flatMap((d) => (d.sketch ? [{ where: `drill ${d.id}`, s: d.sketch }] : [])),
  ...CATEGORIES.flatMap((c) => [...c.sections, ...(c.absorbed ?? [])].flatMap((x) => (x.sketch ? [{ where: `${c.id} › ${x.title.en}`, s: x.sketch }] : []))),
  ...CATEGORIES.flatMap((c) => (c.faults ?? []).flatMap((f) => (f.sketch ? [{ where: `${c.id} › ${f.name.en}`, s: f.sketch }] : []))),
];
const moving = sketches.filter((x) => x.s.view === 'side' && x.s.motion);

describe('phase pictures', () => {
  it('every drawn movement shows 2 to 4 phases, each with the moving figures', () => {
    expect(moving.length).toBeGreaterThan(40);
    for (const { where, s } of moving) {
      const p = phasesOf(s);
      expect(p.length, where).toBeGreaterThanOrEqual(2);
      expect(p.length, where).toBeLessThanOrEqual(4);
      for (const x of p) expect(x.moving.size, where).toBeGreaterThan(0);
    }
  });
  it('the chip ends in its held finish, not back at the set-up; the full swing in the finish', () => {
    const chip = ((c) => [...c.sections, ...(c.absorbed ?? [])])(CATEGORIES.find((c) => c.id === 'chipping')!).find((x) => x.title.en === 'The stroke')!.sketch!;
    const p = phasesOf(chip);
    const last = p[p.length - 1].label;
    expect(typeof last === 'string' ? last : last.en).toMatch(/finish/);
    const swing = ((c) => [...c.sections, ...(c.absorbed ?? [])])(CATEGORIES.find((c) => c.id === 'swing')!).find((x) => x.title.en === 'Impact and finish')!.sketch!;
    const q = phasesOf(swing);
    expect(q.length).toBe(4);
    const end = q[3].label;
    expect(typeof end === 'string' ? end : end.en).toMatch(/finish/i);
  });
  it('no picture of Training has a 3D video', () => {
    for (const { where, s } of sketches) expect(JSON.stringify(s), where).not.toMatch(/"video":/);
  });
});

describe('captions', () => {
  it('a caption that only repeats the text under the picture is left out (17.11.2026)', async () => {
    const { saysAgain } = await import('./Sketch');
    expect(saysAgain('Eine Puttbewegung mit Loft: die Schultern schaukeln, zurück und durch etwa gleich lang.', 'Eine Puttbewegung mit einem Schläger mit Loft: Die Schultern schaukeln, Arme und Schläger bewegen sich zusammen. Zurück und durch etwa gleich lang, sanft beschleunigen.')).toBe(true);
    expect(saysAgain('Von vorn, Ziel rechts.', 'Ballposition, Stand, Gewicht')).toBe(false);
    expect(saysAgain('Bergab: kurz landen.', 'Der Ball kommt flacher und rollt weit – kurz landen.')).toBe(false); // too short to judge
  });
});

describe('the slope shots', () => {
  it('their "Bewegung" shows 4 phase pictures (17.11.2026, Sascha: "Phasenbilder für Hang-Schläge")', () => {
    const shots = CATEGORIES.flatMap((c) => c.shots ?? []);
    for (const id of ['chip-uphill', 'chip-downhill', 'chip-below-feet', 'slope-uphill', 'slope-downhill', 'slope-above', 'slope-below']) {
      const s = shots.find((x) => x.id === id)?.move.sketch;
      expect(s, id).toBeTruthy();
      expect(phasesOf(s!).length, id).toBe(4);
    }
  });
});
